"""OKX smart money signals cache refresh job (W-0109).

Extracted from scheduler.py (W-0386-D) to reduce scheduler size.
"""
from __future__ import annotations

import logging

from data_cache.fetch_okx_historical import fetch_and_cache_signals, SYMBOL_CHAIN_MAP

log = logging.getLogger("engine.scanner.jobs.okx_signals")


async def fetch_okx_signals_job() -> None:
    """Fetch and cache recent OKX smart money signals (every 6 hours).

    Populates historical cache for smart_money_accumulation block.
    """
    log.debug("Fetching OKX smart money signals...")
    results = []
    for symbol in list(SYMBOL_CHAIN_MAP.keys())[:20]:  # Limit to avoid rate limit
        result = fetch_and_cache_signals(
            symbol,
            wallet_types="1,2,3",
            min_amount_usd=1000.0,
            max_age_hours=24.0,
        )
        results.append(result)
        if result.get("signals_appended", 0) > 0:
            log.info("  %s: %d signals cached", symbol, result["signals_appended"])
    total_appended = sum(r.get("signals_appended", 0) for r in results)
    log.info("OKX signals job complete: %d total signals cached", total_appended)
