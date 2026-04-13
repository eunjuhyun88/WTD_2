"""Pattern Scanner — feeds building block results into PatternStateMachines.

Integrates with the existing scheduler. Called after each symbol's blocks
are evaluated, feeds triggered block names into all registered PatternStateMachines.

Design:
- One PatternStateMachine per registered PatternObject (singleton per process)
- evaluate_symbol_for_patterns() is called per symbol per scan cycle
- Entry signal → saves PatternOutcome to ledger + fires alert
- Background scan runs every 15min (reuses existing scheduler)

Key difference from scheduler.py scan:
- evaluate_blocks() requires (snap, features_df, klines_df) — all three args
- This scanner follows the same load/compute pattern as _scan_universe()
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from data_cache.loader import load_klines, load_macro_bundle, load_perp
from exceptions import CacheMiss
from ledger.store import LedgerStore
from ledger.types import PatternOutcome
from patterns.library import PATTERN_LIBRARY, get_pattern
from patterns.state_machine import PatternStateMachine
from patterns.types import PhaseTransition
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from universe.loader import load_universe

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


def _on_entry_signal(transition: PhaseTransition) -> None:
    """Called when a symbol enters the entry phase (ACCUMULATION)."""
    log.info(
        "ENTRY SIGNAL: %s -> %s [%s]",
        transition.symbol,
        transition.to_phase,
        transition.pattern_slug,
    )
    outcome = PatternOutcome(
        pattern_slug=transition.pattern_slug,
        symbol=transition.symbol,
        accumulation_at=transition.timestamp,
    )
    LEDGER_STORE.save(outcome)


def _on_success(transition: PhaseTransition) -> None:
    """Called when a symbol reaches the target phase (BREAKOUT)."""
    log.info(
        "SUCCESS: %s -> BREAKOUT [%s]",
        transition.symbol,
        transition.pattern_slug,
    )
    pending = LEDGER_STORE.list_pending(transition.pattern_slug)
    for outcome in pending:
        if outcome.symbol == transition.symbol:
            LEDGER_STORE.close_outcome(
                transition.pattern_slug,
                outcome.id,
                result="success",
                breakout_at=transition.timestamp,
            )
            break


def evaluate_symbol_for_patterns(
    symbol: str,
    timestamp: datetime | None = None,
) -> dict[str, str]:
    """Evaluate one symbol against all registered patterns.

    Follows the same load pattern as scanner.scheduler._scan_universe():
      load_klines + load_perp → compute_features_table → compute_snapshot
      → evaluate_blocks(snap, features_df, klines_df) → feed to state machines

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

    # Load macro bundle (offline — no network call)
    macro = load_macro_bundle(offline=True)

    try:
        features_df = compute_features_table(klines_df, symbol, perp=perp_df, macro=macro)
    except Exception as exc:
        log.warning("Feature calc failed for %s: %s", symbol, exc)
        return {}

    if features_df.empty:
        return {}

    # Build SignalSnapshot for last bar (same approach as scheduler)
    perp_dict: dict | None = None
    if perp_df is not None and not perp_df.empty:
        last = perp_df.iloc[-1]
        perp_dict = {
            "funding_rate": float(last.get("funding_rate", 0.0)),
            "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
            "oi_now": float(last.get("oi_change_1h", 0.0)),
            "oi_1h_ago": 0.0,
        }

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

    # Feed into each pattern's state machine
    results: dict[str, str] = {}
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        machine.evaluate(symbol, triggered_blocks, timestamp)
        results[slug] = machine.get_current_phase(symbol)

    return results


async def run_pattern_scan(universe_name: str | None = None) -> dict:
    """Scan all symbols in the universe for pattern phase states.

    Returns a summary of current states, entry candidates, and error count.
    This is called by the FastAPI endpoint and can also be scheduled.
    """
    universe_name = universe_name or os.environ.get("SCAN_UNIVERSE", "binance_30")
    symbols = load_universe(universe_name)

    timestamp = datetime.now(timezone.utc)
    results: dict[str, dict[str, str]] = {}
    errors: list[str] = []

    for symbol in symbols:
        try:
            phases = evaluate_symbol_for_patterns(symbol, timestamp)
            if phases:
                results[symbol] = phases
        except Exception as exc:
            errors.append(f"{symbol}: {exc}")
            log.warning("Pattern scan error for %s: %s", symbol, exc)

    # Collect entry candidates across all patterns
    entry_candidates: dict[str, list[str]] = {}
    for slug in PATTERN_LIBRARY:
        machine = _get_machine(slug)
        candidates = machine.get_entry_candidates()
        if candidates:
            entry_candidates[slug] = candidates

    return {
        "scanned_at": timestamp.isoformat(),
        "n_symbols": len(symbols),
        "n_evaluated": len(results),
        "n_errors": len(errors),
        "entry_candidates": entry_candidates,
        "all_states": {
            slug: _get_machine(slug).get_all_states()
            for slug in PATTERN_LIBRARY
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
