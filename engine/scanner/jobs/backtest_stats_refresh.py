"""Daily backtest stats cache refresh job (W-0369).

Refreshes PatternObject backtest stats for all universe symbols at 03:00 UTC.
Extracted from scheduler.py (W-0386-D) to eliminate research.* top-level imports.
"""
from __future__ import annotations

import asyncio
import logging

log = logging.getLogger("engine.scanner.jobs.backtest_stats_refresh")


async def backtest_stats_refresh_job() -> None:
    """Refresh backtest stats cache for all PatternObjects — runs at 03:00 UTC."""
    from research.ensemble.backtest_cache import refresh_all_patterns  # noqa: PLC0415
    from research.discovery.live_monitor import DEFAULT_UNIVERSE  # noqa: PLC0415  # W-0386-C sub-pkg

    log.info(
        "backtest_stats_refresh: starting daily refresh for %d universe symbols",
        len(DEFAULT_UNIVERSE),
    )
    results = await asyncio.to_thread(refresh_all_patterns, DEFAULT_UNIVERSE)
    ok = sum(1 for v in results.values() if v == "ok")
    err = sum(1 for v in results.values() if v == "error")
    log.info("backtest_stats_refresh: done — %d ok, %d errors", ok, err)
