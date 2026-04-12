"""Background scanner — L4 real-time alert engine.

Runs inside the FastAPI process via APScheduler (AsyncIOScheduler).
Every 15 minutes it scans every symbol in the Binance-30 universe,
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
from scanner.feature_calc import compute_features_table, compute_snapshot
from scoring.block_evaluator import evaluate_blocks
from scoring.lightgbm_engine import get_engine
from universe.loader import load_universe

log = logging.getLogger("engine.scanner")

_scheduler: AsyncIOScheduler | None = None

# ── Config ────────────────────────────────────────────────────────────────────

SCAN_INTERVAL = int(os.environ.get("SCAN_INTERVAL_SECONDS", "900"))
MIN_BLOCKS     = int(os.environ.get("SCAN_MIN_BLOCKS", "1"))
UNIVERSE_NAME  = os.environ.get("SCAN_UNIVERSE", "binance_30")

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
    universe = load_universe(UNIVERSE_NAME)
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

        # Reconstruct the last-bar SignalSnapshot (needed by evaluate_blocks)
        try:
            snap = compute_snapshot(klines_df, symbol, perp=perp_df)
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

        # Snapshot dict for context (serialisable subset)
        snap_dict = features_df.iloc[-1].to_dict()
        snap_dict["symbol"] = symbol

        payload: dict[str, Any] = {
            "symbol":           symbol,
            "timeframe":        "4h",
            "blocks_triggered": triggered,
            "snapshot":         snap_dict,
        }
        if p_win is not None:
            payload["p_win"] = round(p_win, 4)

        await _push_alert(payload)
        hits += 1

    elapsed = time.monotonic() - t_start
    log.info(
        "Scanner: scan complete in %.1fs — %d/%d symbols hit",
        elapsed, hits, len(universe),
    )


# ── Lifecycle API (called from api/main.py lifespan) ─────────────────────────

def start_scheduler() -> None:
    """Start the APScheduler background scan loop."""
    global _scheduler
    if _scheduler is not None:
        log.debug("Scheduler already running")
        return

    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(
        _scan_universe,
        trigger="interval",
        seconds=SCAN_INTERVAL,
        id="universe_scan",
        name="Universe block scanner",
        max_instances=1,          # never overlap
        coalesce=True,            # skip missed runs
        misfire_grace_time=120,
    )
    _scheduler.start()
    log.info(
        "Scanner started: interval=%ds universe=%s min_blocks=%d",
        SCAN_INTERVAL, UNIVERSE_NAME, MIN_BLOCKS,
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
