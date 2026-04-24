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

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query

from api.schemas import TokenInfo, UniverseResponse
from data_cache.market_search import (
    get_market_search_index_status,
    search_market_candidates,
)
from data_cache.raw_store import CanonicalRawStore
from data_cache.token_universe import (
    get_cached_universe,
    get_universe,
    get_universe_updated_at,
)

log = logging.getLogger("engine.universe")
router = APIRouter()


def _search_candidate_to_token(rank: int, candidate, market_row: dict | None) -> TokenInfo:  # noqa: ANN001
    if market_row is not None:
        return TokenInfo(
            rank=rank,
            symbol=str(market_row["symbol"]),
            base=str(market_row["base"]),
            name=str(market_row["name"]),
            sector=str(market_row["sector"]),
            price=float(market_row["price"]),
            pct_24h=float(market_row["pct_24h"]),
            vol_24h_usd=float(market_row["vol_24h_usd"]),
            market_cap=float(market_row["market_cap"]),
            oi_usd=float(market_row["oi_usd"]),
            is_futures=bool(market_row["is_futures"]),
            trending_score=float(market_row["trending_score"]),
        )
    return TokenInfo(
        rank=rank,
        symbol=candidate.canonical_symbol,
        base=candidate.base_symbol,
        name=candidate.base_name,
        sector=candidate.chain.upper() or "SEARCH",
        price=0.0,
        pct_24h=float(candidate.price_change_h24),
        vol_24h_usd=float(candidate.volume_h24),
        market_cap=0.0,
        oi_usd=0.0,
        is_futures=bool(candidate.futures_listed),
        trending_score=float(candidate.liquidity_usd),
    )


@router.get("", response_model=UniverseResponse)
async def universe(
    limit: int  = Query(default=200,  ge=1,  le=500),
    sector: str = Query(default="",   description="Filter by sector (empty = all)"),
    sort:   str = Query(default="rank", description="rank | vol | trending | oi | pct24h"),
    refresh: bool = Query(default=False, description="Force cache refresh"),
    q: str = Query(default="", description="Token symbol, name, or contract search"),
    live_fallback: bool = Query(default=False, description="Allow live provider fallback on local index miss"),
) -> UniverseResponse:
    """Return ranked token universe.

    Query params:
        limit   : max tokens to return (default 200, max 500)
        sector  : sector filter (e.g. "DeFi", "AI", "Meme") — empty = all
        sort    : sort field — rank | vol | trending | oi | pct24h
        refresh : set true to force-rebuild the cache
    """
    search_query = q.strip()
    if search_query:
        store = CanonicalRawStore()
        try:
            candidates = await asyncio.to_thread(
                search_market_candidates,
                search_query,
                limit=limit,
                store=store,
                allow_live_fallback=live_fallback,
            )
            index_status = await asyncio.to_thread(get_market_search_index_status, store=store)
        except Exception as exc:
            log.error("universe search failed: %s", exc)
            raise HTTPException(status_code=503, detail=f"Market search unavailable: {exc}")
        cached_rows = get_cached_universe()
        if refresh:
            try:
                cached_rows = await get_universe(force_refresh=True)
            except Exception as exc:
                log.warning("universe refresh skipped during search enrichment: %s", exc)
        candidate_symbols = {candidate.canonical_symbol for candidate in candidates}
        market_by_symbol = {
            str(row["symbol"]): row
            for row in cached_rows
            if str(row["symbol"]) in candidate_symbols
        }
        tokens = [
            _search_candidate_to_token(index + 1, candidate, market_by_symbol.get(candidate.canonical_symbol))
            for index, candidate in enumerate(candidates)
        ]
        return UniverseResponse(
            total=len(tokens),
            tokens=tokens,
            updated_at=index_status.updated_at or get_universe_updated_at(),
        )

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


@router.get("/search/status")
async def market_search_status() -> dict[str, object]:
    store = CanonicalRawStore()
    status = await asyncio.to_thread(get_market_search_index_status, store=store)
    return status.to_dict()
