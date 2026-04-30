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

import asyncio
import logging
import time
from functools import lru_cache

import requests
from fastapi import APIRouter, HTTPException, Query

from market_engine.fact_plane import FactContextBuildError, build_fact_context
from market_engine.ctx_cache import cache_summary, refresh_global_ctx
from features.compute import calc_kimchi_premium

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


@router.get("/kimchi-premium")
async def ctx_kimchi_premium() -> dict:
    """Return current Kimchi Premium % (Upbit BTC/KRW vs Binance BTC/USDT × USD/KRW).

    30s server-side cache (function-level). Returns zeros on fetch failure.
    Response: { premium_pct, source, usd_krw, ts }
    """
    return await asyncio.to_thread(_kimchi_premium_cached)


# 30-second simple TTL cache
_KIMCHI_CACHE: dict = {}
_KIMCHI_CACHE_TTL = 30


def _kimchi_premium_cached() -> dict:
    now = time.time()
    if _KIMCHI_CACHE.get("ts", 0) + _KIMCHI_CACHE_TTL > now:
        return _KIMCHI_CACHE["data"]

    binance_btc: float = 0.0
    try:
        r = requests.get(
            "https://api.binance.com/api/v3/ticker/price",
            params={"symbol": "BTCUSDT"},
            timeout=4,
        )
        r.raise_for_status()
        binance_btc = float(r.json()["price"])
    except Exception:
        pass

    result = calc_kimchi_premium(binance_btc)
    usd_krw: float | None = None
    try:
        from data_cache.fetch_upbit import fetch_usd_krw_rate
        usd_krw = fetch_usd_krw_rate()
    except Exception:
        pass

    data = {
        "premium_pct": result.get("kimchi_premium_pct", 0.0),
        "source": "upbit",
        "binance_btc_usdt": binance_btc,
        "usd_krw": usd_krw,
        "ts": now,
    }
    _KIMCHI_CACHE["ts"] = now
    _KIMCHI_CACHE["data"] = data
    return data


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
