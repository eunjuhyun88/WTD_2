"""Feature windows prefetcher — keeps the FeatureWindowStore populated.

Runs on APScheduler (every 6 hours by default).  Iterates BINANCE_30
with timeframes [15m, 1h, 4h] using locally cached CSVs.
Symbols without local data are silently skipped.

Design mirrors kline_prefetcher.py:
  - Sync build offloaded via asyncio.to_thread (won't block the event loop)
  - Logs a summary at the end (written, skipped, errors)
  - Safe to call multiple times (UPSERT is idempotent)
"""
from __future__ import annotations

import asyncio
import logging

from universe.binance_30 import SYMBOLS as BINANCE_30

log = logging.getLogger("engine.feature_windows_prefetcher")

# Timeframes to populate
_BUILD_TFS = ("15m", "1h", "4h")

# How many days of history to (re)build on each run
_SINCE_DAYS = 90


def _build_sync() -> dict[str, int]:
    """Blocking build — must be called from a thread (not the event loop)."""
    from research.feature_windows_builder import build_for_universe

    results = build_for_universe(
        symbols=list(BINANCE_30),
        timeframes=list(_BUILD_TFS),
        since_days=_SINCE_DAYS,
    )

    written = sum(r.get("rows_written", 0) for r in results)
    skipped = sum(r.get("rows_skipped", 0) for r in results)
    errors = [r for r in results if r.get("error")]

    log.info(
        "feature_windows_prefetcher: written=%d skipped=%d errors=%d",
        written, skipped, len(errors),
    )
    for e in errors[:5]:
        log.warning(
            "feature_windows_prefetcher error: %s/%s — %s",
            e.get("symbol"), e.get("timeframe"), e.get("error"),
        )

    return {"written": written, "skipped": skipped, "errors": len(errors)}


async def prefetch_feature_windows() -> dict[str, int]:
    """Async entry point — offloads the sync build to a thread."""
    return await asyncio.to_thread(_build_sync)
