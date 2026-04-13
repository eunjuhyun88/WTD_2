"""GET /universe — CoinMarketCap-level token universe.

Returns a ranked list of all active Binance USDT perpetuals, enriched with:
  - CoinGecko market cap + display name + global rank
  - 24h volume, price, OI (USD-denominated)
  - Sector classification (L1, DeFi, AI, Meme, Gaming, ...)
  - Composite trending score

Used by:
  - TerminalLeftRail (movers panel)
  - Scanner universe picker
  - Token search / autocomplete
  - Sector heatmap

Cache: 10-minute refresh. First call triggers an async build (~15s).
       Subsequent calls return cached data instantly.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from api.schemas import TokenInfo, UniverseResponse
from data_cache.token_universe import (
    get_universe,
    get_universe_updated_at,
)

log = logging.getLogger("engine.universe")
router = APIRouter()


@router.get("", response_model=UniverseResponse)
async def universe(
    limit: int  = Query(default=200,  ge=1,  le=500),
    sector: str = Query(default="",   description="Filter by sector (empty = all)"),
    sort:   str = Query(default="rank", description="rank | vol | trending | oi | pct24h"),
    refresh: bool = Query(default=False, description="Force cache refresh"),
) -> UniverseResponse:
    """Return ranked token universe.

    Query params:
        limit   : max tokens to return (default 200, max 500)
        sector  : sector filter (e.g. "DeFi", "AI", "Meme") — empty = all
        sort    : sort field — rank | vol | trending | oi | pct24h
        refresh : set true to force-rebuild the cache
    """
    try:
        rows = await get_universe(force_refresh=refresh)
    except Exception as exc:
        log.error("universe get failed: %s", exc)
        raise HTTPException(status_code=503, detail=f"Token universe unavailable: {exc}")

    # --- Filter by sector ----------------------------------------------------
    if sector:
        rows = [r for r in rows if r.get("sector", "").lower() == sector.lower()]

    # --- Sort ----------------------------------------------------------------
    _sort_keys = {
        "rank":     lambda r: r["rank"],
        "vol":      lambda r: -r["vol_24h_usd"],
        "trending": lambda r: -r["trending_score"],
        "oi":       lambda r: -r["oi_usd"],
        "pct24h":   lambda r: -abs(r["pct_24h"]),
    }
    key_fn = _sort_keys.get(sort, _sort_keys["rank"])
    rows = sorted(rows, key=key_fn)

    # --- Slice ---------------------------------------------------------------
    rows = rows[:limit]

    # --- Serialise -----------------------------------------------------------
    tokens = [
        TokenInfo(
            rank=r["rank"],
            symbol=r["symbol"],
            base=r["base"],
            name=r["name"],
            sector=r["sector"],
            price=r["price"],
            pct_24h=r["pct_24h"],
            vol_24h_usd=r["vol_24h_usd"],
            market_cap=r["market_cap"],
            oi_usd=r["oi_usd"],
            is_futures=r["is_futures"],
            trending_score=r["trending_score"],
        )
        for r in rows
    ]

    return UniverseResponse(
        total=len(tokens),
        tokens=tokens,
        updated_at=get_universe_updated_at(),
    )


@router.get("/sectors")
async def sectors() -> dict:
    """Return list of distinct sectors in the current universe."""
    try:
        rows = await get_universe()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    seen: dict[str, int] = {}
    for r in rows:
        s = r.get("sector", "Other")
        seen[s] = seen.get(s, 0) + 1

    return {
        "sectors": sorted(seen.items(), key=lambda x: -x[1]),  # desc by count
    }
