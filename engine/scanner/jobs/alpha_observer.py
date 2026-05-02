"""Alpha Universe COLD observation job (W-0116).

Runs every 4 hours. For each of the 37 Alpha Universe tokens:
  1. Refresh klines + perp (Binance)
  2. Refresh DEX snapshot (DexScreener)
  3. Refresh chain holder data (BSCScan — optional, skips on missing key)
  4. Build features table with dex/chain columns
  5. Run pattern state machine for alpha-presurge-v1
  6. Detect anomalies
  7. Persist freshness metadata alongside pattern state

Integrated into the scheduler via scanner/scheduler.py.
"""
from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("engine.scanner.jobs.alpha_observer")

ALPHA_PATTERN_SLUG = "alpha-presurge-v1"


def _build_perp_dict(perp_df) -> dict | None:
    if perp_df is None or perp_df.empty:
        return None
    last = perp_df.iloc[-1]
    return {
        "funding_rate": float(last.get("funding_rate", 0.0)),
        "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
    }


async def scan_alpha_observer_job() -> dict[str, Any]:
    """COLD tier: full-pipeline scan of the Alpha Universe.

    Returns a summary dict (for testing and logging).
    """
    from data_cache.fetch_alpha_universe import get_watchlist_symbols
    from data_cache.loader import load_klines, load_perp, load_dex_bundle, load_chain_bundle
    from data_cache.freshness import check_freshness
    from exceptions import CacheMiss
    from patterns.anomaly import detect_anomalies
    from patterns.confidence import compute_phase_confidence
    from patterns.library import PATTERN_LIBRARY
    from patterns.scanner import _get_machine, replay_pattern_frames, STATE_STORE
    from scanner.feature_calc import compute_features_table, compute_snapshot
    from scoring.block_evaluator import evaluate_blocks

    t_start = time.monotonic()
    symbols = get_watchlist_symbols()
    timestamp = datetime.now(timezone.utc)

    stats: dict[str, Any] = {
        "run_at": timestamp.isoformat(),
        "n_symbols": len(symbols),
        "processed": 0,
        "skipped": 0,
        "errors": 0,
        "phase_counts": {},
    }

    for symbol in symbols:
        try:
            # 1. Load klines + perp (fresh fetch, not offline-only)
            try:
                klines_df = load_klines(symbol, offline=False)
            except CacheMiss:
                klines_df = None

            if klines_df is None or klines_df.empty or len(klines_df) < 500:
                log.debug("Insufficient klines for %s — skipping", symbol)
                stats["skipped"] += 1
                continue

            try:
                perp_df = load_perp(symbol, offline=False)
            except Exception:
                perp_df = None

            # 2. Refresh DEX snapshot
            try:
                dex_df = load_dex_bundle(symbol, refresh=True)
            except Exception as e:
                log.debug("DEX fetch failed for %s: %s", symbol, e)
                dex_df = None

            # 3. Refresh chain holder data (optional)
            try:
                chain_df = load_chain_bundle(symbol, refresh=True)
            except Exception as e:
                log.debug("Chain fetch failed for %s: %s", symbol, e)
                chain_df = None

            # 4. Build features including DEX + chain columns
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
                stats["skipped"] += 1
                continue

            # 5. Build snapshot + evaluate blocks
            perp_dict = _build_perp_dict(perp_df)
            try:
                snap = compute_snapshot(klines_df, symbol, perp=perp_dict)
                triggered_blocks = evaluate_blocks(snap, features_df, klines_df)
            except Exception as exc:
                log.warning("Block eval failed for %s: %s", symbol, exc)
                stats["errors"] += 1
                continue

            # Feature snapshot for state store
            feature_snapshot: dict | None = None
            try:
                last_row = features_df.iloc[-1]
                feature_snapshot = {
                    k: float(v) if hasattr(v, "__float__") else str(v)
                    for k, v in last_row.items()
                }
            except Exception:
                pass

            # Data freshness metadata
            freshness = check_freshness(symbol, klines_df=klines_df)
            data_quality = {
                "has_perp": perp_df is not None and not perp_df.empty,
                "freshness": freshness.to_dict(),
            }

            # 5b. Run alpha-presurge pattern state machine
            replay_cutoff = (
                features_df.index[-1].to_pydatetime()
                if hasattr(features_df.index[-1], "to_pydatetime")
                else features_df.index[-1]
            )

            if ALPHA_PATTERN_SLUG in PATTERN_LIBRARY:
                machine = _get_machine(ALPHA_PATTERN_SLUG)
                replay_pattern_frames(
                    machine, symbol,
                    features_df=features_df,
                    klines_df=klines_df,
                    timestamp_limit=replay_cutoff,
                    lookback_bars=336,
                    data_quality=data_quality,
                )
                machine.evaluate(
                    symbol, triggered_blocks, timestamp,
                    feature_snapshot=feature_snapshot,
                    trigger_bar_ts=timestamp,
                    data_quality=data_quality,
                )
                state_record = machine.get_state_record(symbol, last_eval_at=timestamp)
                if state_record is not None:
                    # Inject freshness into state record if field exists
                    try:
                        state_record.data_quality_json = json.dumps(data_quality)
                    except AttributeError:
                        pass
                    STATE_STORE.upsert_state(state_record)
                current_phase = machine.get_current_phase(symbol)
                stats["phase_counts"][current_phase] = (
                    stats["phase_counts"].get(current_phase, 0) + 1
                )

            # 6. Anomaly detection
            try:
                detect_anomalies(symbol, features_df)
            except Exception as exc:
                log.debug("Anomaly detection failed for %s: %s", symbol, exc)

            stats["processed"] += 1

        except Exception as exc:
            log.error("Unexpected error processing %s: %s", symbol, exc)
            stats["errors"] += 1

    elapsed = time.monotonic() - t_start
    stats["duration_sec"] = round(elapsed, 2)
    log.info(
        "Alpha COLD scan complete: %.1fs — %d processed, %d skipped, %d errors",
        elapsed, stats["processed"], stats["skipped"], stats["errors"],
    )
    return stats


# ── Job Protocol class (W-0386-D) ─────────────────────────────────────────────

from scanner.jobs.protocol import Job, JobContext, JobResult  # noqa: E402


class AlphaObserverJob:
    """Job Protocol wrapper for alpha cold observation (W-0386-D)."""
    name: str = "alpha_observer"
    schedule: str = "0 */4 * * *"

    async def run(self, ctx: JobContext) -> JobResult:
        try:
            result = await scan_alpha_observer_job()
            processed = result.get("processed", 0) if isinstance(result, dict) else 0
            return JobResult(name=self.name, ok=True, processed=processed)
        except Exception as exc:
            return JobResult(name=self.name, ok=False, error=str(exc))
