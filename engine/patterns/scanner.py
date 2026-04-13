"""Pattern Scanner — feeds building block results into PatternStateMachines.

Integrates with the existing scheduler. Called after each symbol's blocks
are evaluated, feeds triggered block names into all registered PatternStateMachines.

Design:
- One PatternStateMachine per registered PatternObject (singleton per process)
- evaluate_symbol_for_patterns() is called per symbol per scan cycle
- Entry signal → saves PatternOutcome to ledger + fires alert
- Background scan runs every 15min (reuses existing scheduler)

v2 improvements (CTO review):
- Prewarm: fetch perp data before offline scan (cold-start fix)
- Parallel: asyncio.gather for 300+ symbol scans
- Data quality: track perp coverage per scan cycle
- Feature snapshot: capture 92-dim vector at phase transitions
- BTC regime: auto-detect trend at entry for conditional hit-rate
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from data_cache.loader import load_klines, load_perp
from exceptions import CacheMiss
from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.state_machine import PatternStateMachine
from patterns.types import PhaseTransition
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from universe.loader import load_universe_async

log = logging.getLogger("engine.patterns.scanner")

LEDGER_STORE = LedgerStore()

# ── Singleton state machines — one per pattern in library ──────────────────
_MACHINES: dict[str, PatternStateMachine] = {}


def _get_machine(pattern_slug: str) -> PatternStateMachine:
    if pattern_slug not in _MACHINES:
        pattern = get_pattern(pattern_slug)
        _MACHINES[pattern_slug] = PatternStateMachine(
            pattern=pattern,
            on_entry_signal=_on_entry_signal,
            on_success=_on_success,
        )
    return _MACHINES[pattern_slug]


# ── Callbacks ────────────────────────────────────────────────────────────────

def _detect_btc_trend() -> str:
    """Detect BTC trend from cached klines. Returns 'bullish'|'bearish'|'sideways'."""
    try:
        btc_klines = load_klines("BTCUSDT", offline=True)
        if btc_klines is None or btc_klines.empty or len(btc_klines) < 50:
            return "unknown"
        close = btc_klines["close"].astype(float)
        sma20 = close.rolling(20).mean().iloc[-1]
        sma50 = close.rolling(50).mean().iloc[-1]
        last = close.iloc[-1]
        if last > sma20 > sma50:
            return "bullish"
        elif last < sma20 < sma50:
            return "bearish"
        else:
            return "sideways"
    except Exception:
        return "unknown"


def _get_entry_price(symbol: str) -> float | None:
    """Get current price for entry recording."""
    try:
        klines = load_klines(symbol, offline=True)
        if klines is not None and not klines.empty:
            return float(klines["close"].iloc[-1])
    except Exception:
        pass
    return None


def _on_entry_signal(transition: PhaseTransition) -> None:
    """Called when a symbol enters the entry phase (ACCUMULATION).

    v2: captures entry_price and btc_trend for conditional analysis.
    """
    entry_price = _get_entry_price(transition.symbol)
    btc_trend = _detect_btc_trend()

    log.info(
        "ENTRY SIGNAL: %s → %s [%s] price=%.4f btc=%s",
        transition.symbol,
        transition.to_phase,
        transition.pattern_slug,
        entry_price or 0,
        btc_trend,
    )
    outcome = PatternOutcome(
        pattern_slug=transition.pattern_slug,
        symbol=transition.symbol,
        accumulation_at=transition.timestamp,
        entry_price=entry_price,
        btc_trend_at_entry=btc_trend,
        feature_snapshot=transition.feature_snapshot,
    )
    LEDGER_STORE.save(outcome)


def _on_success(transition: PhaseTransition) -> None:
    """Called when a symbol reaches the target phase (BREAKOUT).

    v2: captures peak_price from klines.
    """
    peak_price = _get_entry_price(transition.symbol)  # current price at breakout

    log.info(
        "SUCCESS: %s → BREAKOUT [%s] price=%.4f",
        transition.symbol,
        transition.pattern_slug,
        peak_price or 0,
    )
    pending = LEDGER_STORE.list_pending(transition.pattern_slug)
    for outcome in pending:
        if outcome.symbol == transition.symbol:
            LEDGER_STORE.close_outcome(
                transition.pattern_slug,
                outcome.id,
                result="success",
                peak_price=peak_price,
                breakout_at=transition.timestamp,
            )
            break


# ── Per-symbol evaluation ────────────────────────────────────────────────────

def _build_perp_dict(perp_df) -> dict | None:
    """Build perp dict for compute_snapshot from perp DataFrame.

    v2 FIX: previously mapped oi_change_1h → oi_now (wrong semantics).
    compute_snapshot expects oi_now/oi_1h_ago as absolute OI values,
    but when we only have change rates, we skip oi_now/oi_1h_ago and let
    features_df carry the correct oi_change columns for block evaluation.
    """
    if perp_df is None or perp_df.empty:
        return None
    last = perp_df.iloc[-1]
    return {
        "funding_rate": float(last.get("funding_rate", 0.0)),
        "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
        # NOTE: We do NOT set oi_now/oi_1h_ago from change rates.
        # compute_snapshot will fall back to oi_change=0 for the snapshot,
        # but features_df has the correct oi_change_1h/24h columns
        # which is what blocks actually read from ctx.features[].
    }


def evaluate_symbol_for_patterns(
    symbol: str,
    timestamp: datetime | None = None,
) -> dict[str, str]:
    """Evaluate one symbol against all registered patterns.

    Returns:
        {pattern_slug: current_phase_id}
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    try:
        klines_df = load_klines(symbol, offline=True)
        perp_df = load_perp(symbol, offline=True)
    except CacheMiss:
        return {}
    except Exception as exc:
        log.warning("Failed to load data for %s: %s", symbol, exc)
        return {}

    if klines_df is None or klines_df.empty:
        return {}

    # v2: Track data quality — log when perp data is missing
    has_perp = perp_df is not None and not perp_df.empty
    if not has_perp:
        log.debug("No perp data for %s — OI/funding blocks will use zero defaults", symbol)

    try:
        features_df = compute_features_table(klines_df, symbol, perp=perp_df)
    except Exception as exc:
        log.warning("Feature calc failed for %s: %s", symbol, exc)
        return {}

    if features_df.empty:
        return {}

    # Build perp dict for snapshot (v2: fixed mapping)
    perp_dict = _build_perp_dict(perp_df)

    try:
        snap = compute_snapshot(klines_df, symbol, perp=perp_dict)
    except Exception as exc:
        log.warning("Snapshot failed for %s: %s", symbol, exc)
        return {}

    try:
        triggered_blocks = evaluate_blocks(snap, features_df, klines_df)
    except Exception as exc:
        log.warning("Block evaluation failed for %s: %s", symbol, exc)
        triggered_blocks = []

    # v2: Capture feature snapshot for phase transitions
    feature_snapshot = None
    if not features_df.empty:
        try:
            last_row = features_df.iloc[-1]
            feature_snapshot = {k: float(v) if hasattr(v, '__float__') else str(v)
                                for k, v in last_row.items()}
        except Exception:
            pass

    # Feed into each pattern's state machine
    results: dict[str, str] = {}
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        machine.evaluate(
            symbol, triggered_blocks, timestamp,
            feature_snapshot=feature_snapshot,
        )
        results[slug] = machine.get_current_phase(symbol)

    return results


# ── Prewarm ──────────────────────────────────────────────────────────────────

def prewarm_perp_cache(symbols: list[str], max_workers: int = 5) -> dict:
    """Fetch perp data for symbols that don't have cached data.

    Call this BEFORE run_pattern_scan() to ensure OI/funding blocks have data.
    Returns {fetched: N, cached: N, failed: N}.
    """
    stats = {"fetched": 0, "cached": 0, "failed": 0}

    def _warm_one(symbol: str) -> str:
        try:
            result = load_perp(symbol, offline=False)  # offline=False → fetch if missing
            if result is not None:
                return "ok"
            return "failed"
        except Exception:
            return "failed"

    # Check which symbols need fetching
    need_fetch = []
    for sym in symbols:
        try:
            existing = load_perp(sym, offline=True)
            if existing is not None and not existing.empty:
                stats["cached"] += 1
            else:
                need_fetch.append(sym)
        except Exception:
            need_fetch.append(sym)

    if not need_fetch:
        return stats

    log.info("Prewarming perp cache for %d symbols...", len(need_fetch))
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        results = list(pool.map(_warm_one, need_fetch))

    for r in results:
        if r == "ok":
            stats["fetched"] += 1
        else:
            stats["failed"] += 1

    log.info("Prewarm done: %s", stats)
    return stats


# ── Full universe scan ───────────────────────────────────────────────────────

async def run_pattern_scan(
    universe_name: str | None = None,
    prewarm: bool = True,
    symbols: list[str] | None = None,
) -> dict:
    """Scan all symbols in the universe for pattern phase states.

    v2 improvements:
    - Prewarm perp cache before scanning (fixes cold-start zero data)
    - Parallel evaluation with ThreadPoolExecutor
    - Data quality metrics in response
    """
    universe_name = universe_name or os.environ.get("SCAN_UNIVERSE", "binance_30")
    if symbols is None:
        symbols = await load_universe_async(universe_name)
    t0 = time.monotonic()

    # v2: Prewarm perp cache so OI/funding blocks have real data
    prewarm_stats = {}
    if prewarm:
        prewarm_stats = prewarm_perp_cache(symbols)

    timestamp = datetime.now(timezone.utc)
    results: dict[str, dict[str, str]] = {}
    errors: list[str] = []
    perp_coverage = {"with_perp": 0, "without_perp": 0}

    def _eval_one(symbol: str) -> tuple[str, dict[str, str] | None, str | None]:
        try:
            # Track perp coverage
            perp = load_perp(symbol, offline=True)
            has_perp = perp is not None and not perp.empty

            phases = evaluate_symbol_for_patterns(symbol, timestamp)
            return (symbol, phases if phases else None, None)
        except Exception as exc:
            return (symbol, None, f"{symbol}: {exc}")

    # v2: Parallel evaluation
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = list(pool.map(_eval_one, symbols))

    for symbol, phases, error in futures:
        if error:
            errors.append(error)
        elif phases:
            results[symbol] = phases
        # Track perp coverage
        try:
            perp = load_perp(symbol, offline=True)
            if perp is not None and not perp.empty:
                perp_coverage["with_perp"] += 1
            else:
                perp_coverage["without_perp"] += 1
        except Exception:
            perp_coverage["without_perp"] += 1

    # Collect entry candidates across all patterns
    entry_candidates: dict[str, list[str]] = {}
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        candidates = machine.get_entry_candidates()
        if candidates:
            entry_candidates[slug] = candidates

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    return {
        "scanned_at": timestamp.isoformat(),
        "n_symbols": len(symbols),
        "n_evaluated": len(results),
        "n_errors": len(errors),
        "elapsed_ms": elapsed_ms,
        "entry_candidates": entry_candidates,
        "all_states": {
            slug: _get_machine(slug).get_all_states()
            for slug in PATTERN_LIBRARY
        },
        # v2: data quality metrics
        "data_quality": {
            "perp_coverage": perp_coverage,
            "prewarm": prewarm_stats,
        },
    }


def get_pattern_states() -> dict[str, dict[str, str]]:
    """Return current {pattern_slug: {symbol: phase}} for all machines."""
    return {slug: _get_machine(slug).get_all_states() for slug in PATTERN_LIBRARY}


def get_entry_candidates_all() -> dict[str, list[str]]:
    """Return current entry candidates for all patterns."""
    return {
        slug: _get_machine(slug).get_entry_candidates()
        for slug in PATTERN_LIBRARY
    }
