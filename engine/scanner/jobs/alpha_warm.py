"""Alpha Universe WARM observation job (W-0116).

Runs every 30 minutes. Only processes symbols where alpha-presurge-v1 is in
an active phase (ACCUMULATION_ZONE or SQUEEZE_TRIGGER). Reuses cached DEX/chain
data — only refreshes klines + perp.

This gives near-realtime tracking of symbols close to entry without the full
4h refresh cost for the entire 37-token universe.
"""
from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("engine.scanner.jobs.alpha_warm")

ALPHA_PATTERN_SLUG = "alpha-presurge-v1"
WARM_PHASES = {"ACCUMULATION_ZONE", "SQUEEZE_TRIGGER"}


def _build_perp_dict(perp_df) -> dict | None:
    if perp_df is None or perp_df.empty:
        return None
    last = perp_df.iloc[-1]
    return {
        "funding_rate": float(last.get("funding_rate", 0.0)),
        "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
    }


async def scan_alpha_warm_job() -> dict[str, Any]:
    """WARM tier: re-evaluate active-phase Alpha symbols every 30 minutes.

    Skips COLD-only DEX/chain refresh — uses cached data to save API quota.
    """
    from data_cache.loader import load_klines, load_perp, load_dex_bundle, load_chain_bundle
    from data_cache.freshness import check_freshness
    from exceptions import CacheMiss
    from patterns.library import PATTERN_LIBRARY
    from patterns.scanner import _get_machine, replay_pattern_frames, STATE_STORE
    from patterns.state_store import PatternStateStore
    from scanner.feature_calc import compute_features_table, compute_snapshot
    from scoring.block_evaluator import evaluate_blocks

    t_start = time.monotonic()
    timestamp = datetime.now(timezone.utc)

    # Find symbols in active warm phases for this pattern
    try:
        active_states = STATE_STORE.list_states(pattern_slug=ALPHA_PATTERN_SLUG)
        warm_symbols = [
            s.symbol for s in active_states
            if s.current_phase in WARM_PHASES and not s.invalidated
        ]
    except Exception as exc:
        log.error("Failed to list alpha states: %s", exc)
        return {"error": str(exc)}

    if not warm_symbols:
        log.debug("Alpha WARM: no symbols in active phases — skipping")
        return {"n_symbols": 0, "processed": 0, "duration_sec": 0.0}

    log.info("Alpha WARM: evaluating %d active-phase symbols", len(warm_symbols))

    stats: dict[str, Any] = {
        "run_at": timestamp.isoformat(),
        "n_symbols": len(warm_symbols),
        "processed": 0,
        "phase_transitions": 0,
        "errors": 0,
    }

    for symbol in warm_symbols:
        try:
            try:
                klines_df = load_klines(symbol, offline=False)
            except CacheMiss:
                klines_df = None

            if klines_df is None or klines_df.empty or len(klines_df) < 500:
                stats["errors"] += 1
                continue

            try:
                perp_df = load_perp(symbol, offline=False)
            except Exception:
                perp_df = None

            # WARM: load DEX/chain from cache only (no refresh)
            try:
                dex_df = load_dex_bundle(symbol, offline=True)
            except Exception:
                dex_df = None

            try:
                chain_df = load_chain_bundle(symbol, offline=True)
            except Exception:
                chain_df = None

            try:
                features_df = compute_features_table(
                    klines_df, symbol,
                    perp=perp_df,
                    dex=dex_df,
                    chain=chain_df,
                )
            except Exception as exc:
                log.warning("Feature calc failed for %s: %s", symbol, exc)
                stats["errors"] += 1
                continue

            if features_df.empty:
                continue

            perp_dict = _build_perp_dict(perp_df)
            try:
                snap = compute_snapshot(klines_df, symbol, perp=perp_dict)
                triggered_blocks = evaluate_blocks(snap, features_df, klines_df)
            except Exception as exc:
                log.warning("Block eval failed for %s: %s", symbol, exc)
                stats["errors"] += 1
                continue

            feature_snapshot = None
            try:
                last_row = features_df.iloc[-1]
                feature_snapshot = {
                    k: float(v) if hasattr(v, "__float__") else str(v)
                    for k, v in last_row.items()
                }
            except Exception:
                pass

            freshness = check_freshness(symbol, klines_df=klines_df)
            data_quality = {
                "has_perp": perp_df is not None and not perp_df.empty,
                "freshness": freshness.to_dict(),
            }

            replay_cutoff = (
                features_df.index[-1].to_pydatetime()
                if hasattr(features_df.index[-1], "to_pydatetime")
                else features_df.index[-1]
            )

            if ALPHA_PATTERN_SLUG in PATTERN_LIBRARY:
                machine = _get_machine(ALPHA_PATTERN_SLUG)
                prev_phase = machine.get_current_phase(symbol)

                machine.evaluate(
                    symbol, triggered_blocks, timestamp,
                    feature_snapshot=feature_snapshot,
                    trigger_bar_ts=timestamp,
                    data_quality=data_quality,
                )
                state_record = machine.get_state_record(symbol, last_eval_at=timestamp)
                if state_record is not None:
                    STATE_STORE.upsert_state(state_record)

                new_phase = machine.get_current_phase(symbol)
                if new_phase != prev_phase:
                    log.info(
                        "Alpha WARM transition: %s %s → %s",
                        symbol, prev_phase, new_phase,
                    )
                    stats["phase_transitions"] += 1

            stats["processed"] += 1

        except Exception as exc:
            log.error("Unexpected error processing %s: %s", symbol, exc)
            stats["errors"] += 1

    elapsed = time.monotonic() - t_start
    stats["duration_sec"] = round(elapsed, 2)
    log.info(
        "Alpha WARM scan complete: %.1fs — %d processed, %d transitions",
        elapsed, stats["processed"], stats["phase_transitions"],
    )
    return stats
