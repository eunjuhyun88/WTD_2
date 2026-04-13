"""Background scanner — L4 real-time alert engine.

Runs inside the FastAPI process via APScheduler (AsyncIOScheduler).
Every 15 minutes it scans every symbol in the configured universe,
computes features, evaluates all building blocks, and pushes any
signal hit to the `engine_alerts` Supabase table.

Start/stop is controlled by the FastAPI lifespan hook in api/main.py.
The scan loop is intentionally sequential (not concurrent) to avoid
bursting Binance rate limits during the feature-calc phase.

Environment variables used:
  SUPABASE_URL             — Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY — Service-role key (bypasses RLS)
  SCAN_INTERVAL_SECONDS    — Override default 900 (15 min)
  SCAN_MIN_BLOCKS          — Minimum blocks to fire an alert (default 1)
  SCAN_UNIVERSE            — Universe name for load_universe() (default "binance_30")
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from data_cache.loader import load_klines, load_macro_bundle, load_perp
from exceptions import CacheMiss
from scanner.alerts import (
    send_pattern_engine_alert,
    send_pattern_scan_summary,
    send_scan_summary,
)
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from scoring.lightgbm_engine import get_engine
from universe.loader import load_universe, load_universe_async

log = logging.getLogger("engine.scanner")

_scheduler: AsyncIOScheduler | None = None

# ── Config ────────────────────────────────────────────────────────────────────

SCAN_INTERVAL = int(os.environ.get("SCAN_INTERVAL_SECONDS", "900"))
MIN_BLOCKS     = int(os.environ.get("SCAN_MIN_BLOCKS", "1"))
UNIVERSE_NAME  = os.environ.get("SCAN_UNIVERSE", "binance_30")
SCAN_TELEGRAM_ENABLED = os.environ.get("SCAN_TELEGRAM_ENABLED", "1").strip().lower() not in {
    "0", "false", "no", "off",
}

SUPABASE_URL      = os.environ.get("SUPABASE_URL", "")
SUPABASE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

# ── Supabase insert ───────────────────────────────────────────────────────────

async def _push_alert(payload: dict[str, Any]) -> None:
    """Insert one row into engine_alerts via Supabase REST API."""
    if not SUPABASE_URL or not SUPABASE_ROLE_KEY:
        log.warning("Supabase env vars not set — alert not pushed: %s", payload.get("symbol"))
        return

    url = f"{SUPABASE_URL}/rest/v1/engine_alerts"
    headers = {
        "apikey": SUPABASE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            log.info("Alert pushed: %s blocks=%s", payload["symbol"], payload["blocks_triggered"])
    except Exception as exc:
        log.error("Failed to push alert for %s: %s", payload.get("symbol"), exc)


# ── Core scan loop ────────────────────────────────────────────────────────────

async def _scan_universe() -> None:
    """Scan all universe symbols and push alerts for any block hits."""
    t_start = time.monotonic()
    universe = await load_universe_async(UNIVERSE_NAME)
    if not universe:
        log.warning("Empty universe '%s' — skipping scan", UNIVERSE_NAME)
        return

    log.info("Scanner: starting scan of %d symbols (universe=%s)", len(universe), UNIVERSE_NAME)

    # Macro bundle is shared across all symbols — load once per scan.
    macro = load_macro_bundle(offline=True)

    hits = 0
    for symbol in universe:
        try:
            klines_df = load_klines(symbol, offline=True)
            perp_df   = load_perp(symbol, offline=True)
        except CacheMiss:
            log.debug("Cache miss — skipping %s", symbol)
            continue
        except Exception as exc:
            log.warning("Load failed for %s: %s", symbol, exc)
            continue

        try:
            features_df = compute_features_table(
                klines_df, symbol, perp=perp_df, macro=macro
            )
        except Exception as exc:
            log.warning("Feature calc failed for %s: %s", symbol, exc)
            continue

        if features_df.empty:
            continue

        # Reconstruct the last-bar SignalSnapshot (needed by evaluate_blocks).
        # compute_snapshot expects perp as a plain dict — extract last row
        # of the perp DataFrame if available.
        perp_dict: dict | None = None
        if perp_df is not None and not perp_df.empty:
            last = perp_df.iloc[-1]
            perp_dict = {
                "funding_rate":    float(last.get("funding_rate", 0.0)),
                "long_short_ratio": float(last.get("long_short_ratio", 1.0)),
                # NOTE: We do NOT set oi_now/oi_1h_ago from change rates.
                # features_df has the correct oi_change columns for blocks.
            }

        try:
            snap = compute_snapshot(klines_df, symbol, perp=perp_dict)
        except Exception as exc:
            log.warning("Snapshot failed for %s: %s", symbol, exc)
            continue

        try:
            triggered = evaluate_blocks(snap, features_df, klines_df)
        except Exception as exc:
            log.warning("Block eval failed for %s: %s", symbol, exc)
            continue

        if len(triggered) < MIN_BLOCKS:
            continue

        # LightGBM score (may be None if untrained)
        p_win: float | None = None
        try:
            lgbm = get_engine()
            if lgbm.is_trained:
                p_win = lgbm.predict_one(snap)
        except Exception:
            pass

        # Snapshot dict — use Pydantic model_dump for guaranteed JSON-safety.
        # Avoids np.float64 / enum values that json.dumps can't serialise.
        snap_dict = snap.model_dump(mode="json")

        payload: dict[str, Any] = {
            "symbol":           symbol,
            "timeframe":        "4h",
            "blocks_triggered": triggered,
            "snapshot":         snap_dict,
        }
        if p_win is not None:
            payload["p_win"] = round(p_win, 4)

        await _push_alert(payload)
        if SCAN_TELEGRAM_ENABLED:
            await send_pattern_engine_alert(payload)
        hits += 1

    elapsed = time.monotonic() - t_start
    if SCAN_TELEGRAM_ENABLED:
        await send_scan_summary({
            "n_signals": hits,
            "n_symbols": len(universe),
            "duration_sec": elapsed,
        })
    log.info(
        "Scanner: scan complete in %.1fs — %d/%d symbols hit",
        elapsed, hits, len(universe),
    )


# ── Lifecycle API (called from api/main.py lifespan) ─────────────────────────

async def _pattern_scan_job() -> None:
    """Run pattern state machine scan across all symbols.

    This is a separate job from _scan_universe (block alerts).
    Pattern scan tracks multi-phase progression (FAKE_DUMP → BREAKOUT).
    """
    from patterns.scanner import run_pattern_scan, prewarm_perp_cache

    # Prewarm perp cache so OI/funding blocks have real data
    universe = await load_universe_async(UNIVERSE_NAME)
    prewarm_perp_cache(universe, max_workers=5)

    result = await run_pattern_scan(UNIVERSE_NAME, prewarm=False, symbols=universe)  # already prewarmed
    n_candidates = sum(len(v) for v in result.get("entry_candidates", {}).values())
    if SCAN_TELEGRAM_ENABLED and n_candidates > 0:
        await send_pattern_scan_summary(result, universe_name=UNIVERSE_NAME)
    log.info(
        "Pattern scan: %d symbols, %d evaluated, %d entry candidates, %dms",
        result.get("n_symbols", 0),
        result.get("n_evaluated", 0),
        n_candidates,
        result.get("elapsed_ms", 0),
    )


async def _auto_evaluate_job() -> None:
    """Auto-evaluate pending ledger outcomes past their 72h evaluation window."""
    from ledger.store import LedgerStore
    from patterns.library import PATTERN_LIBRARY

    store = LedgerStore()
    total_evaluated = 0
    for slug in PATTERN_LIBRARY:
        evaluated = store.auto_evaluate_pending(slug)
        total_evaluated += len(evaluated)

    if total_evaluated > 0:
        log.info("Auto-evaluate: %d outcomes evaluated across all patterns", total_evaluated)


def start_scheduler() -> None:
    """Start the APScheduler background scan loop."""
    global _scheduler
    if _scheduler is not None:
        log.debug("Scheduler already running")
        return

    _scheduler = AsyncIOScheduler(timezone="UTC")

    # Job 1: Universe block scanner (existing) — every 15 min
    _scheduler.add_job(
        _scan_universe,
        trigger="interval",
        seconds=SCAN_INTERVAL,
        id="universe_scan",
        name="Universe block scanner",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )

    # Job 2: Pattern state machine scan — every 15 min (offset by 5 min)
    _scheduler.add_job(
        _pattern_scan_job,
        trigger="interval",
        seconds=SCAN_INTERVAL,
        id="pattern_scan",
        name="Pattern state machine scanner",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=120,
    )

    # Job 3: Auto-evaluate pending ledger outcomes — every 1 hour
    _scheduler.add_job(
        _auto_evaluate_job,
        trigger="interval",
        seconds=3600,
        id="auto_evaluate",
        name="Ledger auto-evaluator",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )

    _scheduler.start()
    log.info(
        "Scanner started: block_scan=%ds pattern_scan=%ds auto_eval=3600s universe=%s",
        SCAN_INTERVAL, SCAN_INTERVAL, UNIVERSE_NAME,
    )


def stop_scheduler() -> None:
    """Gracefully shut down the scheduler."""
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    log.info("Scanner stopped")


def is_running() -> bool:
    return _scheduler is not None and _scheduler.running


def next_run_time() -> str | None:
    """ISO timestamp of the next scheduled scan, or None."""
    if _scheduler is None:
        return None
    job = _scheduler.get_job("universe_scan")
    if job is None or job.next_run_time is None:
        return None
    return job.next_run_time.isoformat()
