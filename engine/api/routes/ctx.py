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

from fastapi import APIRouter, HTTPException, Query

from market_engine.fact_plane import FactContextBuildError, build_fact_context
from market_engine.indicator_catalog import build_indicator_catalog, normalize_indicator_catalog_filters
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


@router.get("/fact")
async def ctx_fact(
    symbol: str = Query(..., min_length=3),
    timeframe: str = Query("1h"),
    offline: bool = Query(True),
) -> dict:
    """Return a bounded engine-owned fact context for one symbol/timeframe."""
    try:
        return build_fact_context(symbol=symbol, timeframe=timeframe, offline=offline)
    except FactContextBuildError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.to_detail()) from exc


@router.get("/indicator-catalog")
async def ctx_indicator_catalog(
    status: str | None = Query(None),
    family: str | None = Query(None),
    stage: str | None = Query(None),
    query: str | None = Query(None),
) -> dict:
    """Return the canonical engine-owned 100-metric indicator inventory."""
    try:
        filters = normalize_indicator_catalog_filters(
            status=status,
            family=family,
            stage=stage,
            query=query,
        )
    except ValueError as exc:
        message = str(exc)
        code = "invalid_filter"
        if message.startswith("status must be one of"):
            code = "invalid_status"
        elif message.startswith("family must be one of"):
            code = "invalid_family"
        elif message.startswith("stage must be one of"):
            code = "invalid_stage"
        raise HTTPException(
            status_code=400,
            detail={
                "code": code,
                "message": message,
            },
        ) from exc
    return build_indicator_catalog(
        status=filters["status"],
        family=filters["family"],
        stage=filters["stage"],
        query=filters["query"],
    )
