"""GET /ctx/status — view cached GlobalCtx state.
POST /ctx/refresh — force-refresh L0 global context data.

GlobalCtx provides data for 4 L2 layers that require market-wide context:
  L6 onchain  : BTC on-chain stats (n_tx, whale signal)
  L7 fg       : Crypto Fear & Greed Index (0-100)
  L8 kimchi   : Korean exchange premium (USD/KRW + Upbit/Bithumb prices)
  L12 sector  : Sector momentum scores

Without a populated cache, all 4 layers score 0 in every /deep call.
This endpoint allows the SvelteKit app or operators to inspect and trigger
a manual refresh without restarting the engine.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter

from market_engine.ctx_cache import cache_summary, refresh_global_ctx

log = logging.getLogger("engine.ctx")
router = APIRouter()


@router.get("/status")
async def ctx_status() -> dict:
    """Return a diagnostic snapshot of the current GlobalCtx cache."""
    return cache_summary()


@router.post("/refresh")
async def ctx_refresh() -> dict:
    """Force a full GlobalCtx refresh and return the updated summary.

    This blocks until all L0 fetches complete (typically 3-8 seconds).
    Concurrent calls share the single in-flight request.
    """
    log.info("Manual GlobalCtx refresh requested via API")
    await refresh_global_ctx()
    return {"refreshed": True, **cache_summary()}
