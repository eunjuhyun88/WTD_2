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
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any

from data_cache.loader import load_klines, load_perp
from exceptions import CacheMiss
from ledger.store import LEDGER_RECORD_STORE, LedgerStore, get_ledger_store
from ledger.types import PatternOutcome
from patterns.alert_policy import ALERT_POLICY_STORE, evaluate_alert_policy
from patterns.definitions import build_definition_ref, definition_id_from_ref
from patterns.entry_scorer import score_entry_feature_snapshot
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.replay import replay_pattern_frames
from patterns.state_machine import PatternStateMachine
from patterns.state_store import PatternStateStore
from patterns.types import PhaseAttemptRecord, PhaseTransition
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from universe.loader import load_universe_async
from universe.config import DEFAULT_SCAN_UNIVERSE

log = logging.getLogger("engine.patterns.scanner")

LEDGER_STORE = get_ledger_store()
STATE_STORE = PatternStateStore()

# ── Singleton state machines — one per pattern in library ──────────────────
_MACHINES: dict[str, PatternStateMachine] = {}


def _get_machine(pattern_slug: str) -> PatternStateMachine:
    if pattern_slug not in _MACHINES:
        pattern = get_pattern(pattern_slug)
        machine = PatternStateMachine(
            pattern=pattern,
            on_transition=_on_transition,
            on_entry_signal=_on_entry_signal,
            on_success=_on_success,
            on_phase_attempt=_on_phase_attempt,
        )
        machine.hydrate_states(STATE_STORE.hydrate_states(pattern))
        _MACHINES[pattern_slug] = machine
    return _MACHINES[pattern_slug]


# ── Callbacks ────────────────────────────────────────────────────────────────

def _on_transition(transition: PhaseTransition) -> None:
    """Persist every phase transition before entry/success callbacks run."""
    STATE_STORE.append_transition(transition)


def _on_phase_attempt(attempt: PhaseAttemptRecord) -> None:
    """Persist failed phase-advance evidence for refinement."""
    LEDGER_RECORD_STORE.append_phase_attempt_record(attempt)

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

    v3: captures rule context plus shared ML shadow metadata for later training.
    """
    entry_price = _get_entry_price(transition.symbol)
    btc_trend = _detect_btc_trend()
    entry_score = score_entry_feature_snapshot(
        transition.feature_snapshot,
        pattern_slug=transition.pattern_slug,
    )

    log.info(
        "ENTRY SIGNAL: %s → %s [%s] price=%.4f btc=%s ml=%s p_win=%s pass=%s",
        transition.symbol,
        transition.to_phase,
        transition.pattern_slug,
        entry_price or 0,
        btc_trend,
        entry_score.state,
        f"{entry_score.p_win:.4f}" if entry_score.p_win is not None else "n/a",
        entry_score.threshold_passed,
    )
    definition_ref = build_definition_ref(
        transition.pattern_slug,
        pattern_version=transition.pattern_version,
    )
    outcome = PatternOutcome(
        pattern_slug=transition.pattern_slug,
        pattern_version=transition.pattern_version,
        definition_id=definition_id_from_ref(definition_ref),
        definition_ref=definition_ref,
        symbol=transition.symbol,
        accumulation_at=transition.timestamp,
        entry_price=entry_price,
        btc_trend_at_entry=btc_trend,
        feature_snapshot=transition.feature_snapshot,
        entry_transition_id=transition.transition_id,
        entry_scan_id=transition.scan_id,
        entry_block_scores=transition.block_scores,
        entry_block_coverage=transition.confidence,
        entry_p_win=entry_score.p_win,
        entry_ml_state=entry_score.state,
        entry_model_key=entry_score.model_key,
        entry_model_version=entry_score.model_version,
        entry_rollout_state=entry_score.rollout_state,
        entry_threshold=entry_score.threshold,
        entry_threshold_passed=entry_score.threshold_passed,
        entry_ml_error=entry_score.error,
    )
    LEDGER_STORE.save(outcome)
    LEDGER_RECORD_STORE.append_entry_record(outcome)
    LEDGER_RECORD_STORE.append_score_record(outcome)


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
    scan_id: str | None = None,
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
    replay_cutoff = features_df.index[-1].to_pydatetime() if hasattr(features_df.index[-1], "to_pydatetime") else features_df.index[-1]
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        replay_pattern_frames(
            machine,
            symbol,
            features_df=features_df,
            klines_df=klines_df,
            timestamp_limit=replay_cutoff,
            lookback_bars=336,
            data_quality={"has_perp": has_perp},
        )
        machine.evaluate(
            symbol, triggered_blocks, timestamp,
            feature_snapshot=feature_snapshot,
            scan_id=scan_id,
            trigger_bar_ts=timestamp,
            data_quality={"has_perp": has_perp},
        )
        state_record = machine.get_state_record(symbol, last_eval_at=timestamp)
        if state_record is not None:
            STATE_STORE.upsert_state(state_record)
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
    universe_name = universe_name or DEFAULT_SCAN_UNIVERSE
    if symbols is None:
        symbols = await load_universe_async(universe_name)
    t0 = time.monotonic()

    # v2: Prewarm perp cache so OI/funding blocks have real data
    prewarm_stats = {}
    if prewarm:
        prewarm_stats = prewarm_perp_cache(symbols)

    timestamp = datetime.now(timezone.utc)
    scan_id = str(uuid.uuid4())
    results: dict[str, dict[str, str]] = {}
    errors: list[str] = []
    perp_coverage = {"with_perp": 0, "without_perp": 0}

    def _eval_one(symbol: str) -> tuple[str, dict[str, str] | None, str | None]:
        try:
            # Track perp coverage
            perp = load_perp(symbol, offline=True)
            has_perp = perp is not None and not perp.empty

            phases = evaluate_symbol_for_patterns(symbol, timestamp, scan_id=scan_id)
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
    raw_entry_candidates = get_raw_entry_candidates_all()
    entry_candidate_records = get_entry_candidate_records()
    entry_candidates: dict[str, list[str]] = {}
    for slug, records in entry_candidate_records.items():
        visible_symbols = [record["symbol"] for record in records if record.get("alert_visible")]
        if visible_symbols:
            entry_candidates[slug] = visible_symbols

    elapsed_ms = int((time.monotonic() - t0) * 1000)

    return {
        "scan_id": scan_id,
        "scanned_at": timestamp.isoformat(),
        "n_symbols": len(symbols),
        "n_evaluated": len(results),
        "n_errors": len(errors),
        "elapsed_ms": elapsed_ms,
        "entry_candidates": entry_candidates,
        "raw_entry_candidates": raw_entry_candidates,
        "candidate_records_by_pattern": entry_candidate_records,
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
    """Return current visible entry candidates for all patterns."""
    records_by_pattern = get_entry_candidate_records()
    return {
        slug: [record["symbol"] for record in records if record.get("alert_visible")]
        for slug, records in records_by_pattern.items()
    }


def get_raw_entry_candidates_all() -> dict[str, list[str]]:
    """Return raw state-machine entry candidates before alert policy filtering."""
    return {
        slug: _get_machine(slug).get_entry_candidates()
        for slug in PATTERN_LIBRARY
    }


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _phase_label(pattern_slug: str, phase_id: str) -> str:
    pattern = get_pattern(pattern_slug)
    for phase in pattern.phases:
        if phase.phase_id == phase_id:
            return phase.label
    return phase_id


def get_entry_candidate_records(pattern_slug: str | None = None) -> dict[str, list[dict[str, Any]]]:
    """Return rich entry candidates with durable transition linkage.

    This is the contract bridge for app Save Setup: legacy candidates answer
    "which symbols are entries"; candidate records answer "which transition
    should a CaptureRecord reference?"
    """
    slugs = [pattern_slug] if pattern_slug else list(PATTERN_LIBRARY.keys())
    records_by_pattern: dict[str, list[dict[str, Any]]] = {}

    for slug in slugs:
        pattern = get_pattern(slug)
        machine = _get_machine(slug)
        candidate_symbols = set(machine.get_entry_candidates())
        policy = ALERT_POLICY_STORE.load(slug)
        states = STATE_STORE.list_states(slug)
        outcomes_by_transition = {
            outcome.entry_transition_id: outcome
            for outcome in LEDGER_STORE.list_all(slug)
            if outcome.entry_transition_id
        }
        records: list[dict[str, Any]] = []

        for state in states:
            if state.timeframe != pattern.timeframe:
                continue
            if state.symbol not in candidate_symbols:
                continue
            if state.current_phase != pattern.entry_phase:
                continue

            transition = (
                STATE_STORE.get_transition(state.last_transition_id)
                if state.last_transition_id
                else None
            )
            transition_id = transition.transition_id if transition else state.last_transition_id
            matched_outcome = outcomes_by_transition.get(transition_id)
            alert_decision = evaluate_alert_policy(slug, matched_outcome)
            records.append(
                {
                    "symbol": state.symbol,
                    "slug": slug,
                    "pattern_slug": slug,
                    "pattern_version": state.pattern_version,
                    "phase": state.current_phase,
                    "phase_label": _phase_label(slug, state.current_phase),
                    "timeframe": state.timeframe,
                    "transition_id": transition_id,
                    "candidate_transition_id": transition_id,
                    "scan_id": transition.scan_id if transition else None,
                    "entered_at": _iso(state.entered_at),
                    "last_eval_at": _iso(state.last_eval_at),
                    "bars_in_phase": state.bars_in_phase,
                    "confidence": transition.confidence if transition else None,
                    "block_scores": transition.block_scores if transition else {},
                    "blocks_triggered": transition.blocks_triggered if transition else [],
                    "feature_snapshot": transition.feature_snapshot if transition else None,
                    "data_quality": transition.data_quality if transition else None,
                    "alert_mode": policy.mode,
                    "alert_visible": alert_decision.visible,
                    "alert_reason": alert_decision.reason,
                    "entry_ml_state": matched_outcome.entry_ml_state if matched_outcome else None,
                    "entry_p_win": matched_outcome.entry_p_win if matched_outcome else None,
                    "entry_threshold_passed": matched_outcome.entry_threshold_passed if matched_outcome else None,
                    "entry_rollout_state": matched_outcome.entry_rollout_state if matched_outcome else None,
                    "entry_model_version": matched_outcome.entry_model_version if matched_outcome else None,
                }
            )

        records_by_pattern[slug] = records

    return records_by_pattern
