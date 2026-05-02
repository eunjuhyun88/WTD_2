"""Alpha universe seed (W-0384) — 3-source symbol union.

Sources:
  1. ALPHA_WATCHLIST from data_cache/fetch_alpha_universe.py (curated)
  2. Binance Alpha official token list (1h cache)
  3. User watchlist from Supabase user_watchlist table (migration 043)

get_alpha_universe() is the single call for /alpha/scan universe and W-0378 /scan all.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

import httpx

log = logging.getLogger("engine.alpha.universe_seed")

_BINANCE_ALPHA_URL = (
    "https://www.binance.com/bapi/defi/v1/public/wallet-direct/"
    "buw/wallet/cex/alpha/all/token/list"
)
_HTTP_TIMEOUT = 3.0

_alpha_list_cache: tuple[float, list[str]] = (0.0, [])
_user_watchlist_cache: tuple[float, list[str]] = (0.0, [])


def _sb():
    from supabase import create_client
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )


async def _fetch_binance_alpha_symbols() -> list[str]:
    global _alpha_list_cache
    expire_ts, cached = _alpha_list_cache
    if time.time() < expire_ts:
        return cached
    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.get(_BINANCE_ALPHA_URL)
            resp.raise_for_status()
            data = resp.json()
        tokens = data.get("data", {}).get("tokens", [])
        symbols: list[str] = []
        for t in tokens:
            sym = t.get("symbol", "").upper()
            if not sym:
                continue
            symbols.append(sym if sym.endswith("USDT") else sym + "USDT")
        _alpha_list_cache = (time.time() + 3600, symbols)
        return symbols
    except Exception as e:
        log.debug("Binance Alpha list fetch failed: %s", e)
        return []


async def _fetch_user_watchlist() -> list[str]:
    global _user_watchlist_cache
    expire_ts, cached = _user_watchlist_cache
    if time.time() < expire_ts:
        return cached
    try:
        sb = _sb()
        result = sb.table("user_watchlist").select("symbol").execute()
        symbols = [row["symbol"].upper() for row in (result.data or [])]
        _user_watchlist_cache = (time.time() + 300, symbols)
        return symbols
    except Exception as e:
        log.debug("user_watchlist fetch failed: %s", e)
        return []


async def get_alpha_universe() -> list[str]:
    """Return deduplicated USDT-perp symbols from 3 sources, uppercase."""
    from data_cache.fetch_alpha_universe import get_watchlist_symbols

    base_symbols = get_watchlist_symbols()
    curated = [s if s.endswith("USDT") else s + "USDT" for s in base_symbols]

    alpha_list, user_list = await asyncio.gather(
        _fetch_binance_alpha_symbols(),
        _fetch_user_watchlist(),
    )

    seen: dict[str, None] = {}
    for sym in curated + alpha_list + user_list:
        seen[sym.upper()] = None
    return list(seen.keys())
