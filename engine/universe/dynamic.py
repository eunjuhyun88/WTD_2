"""Dynamic Binance USDT-M perpetual futures universe.

Two access paths exist on purpose:

- ``load_dynamic_universe()`` keeps a synchronous fallback path for legacy
  callers that need a quick top-volume symbol list.
- ``load_dynamic_universe_async()`` reuses the richer token-universe builder
  that already powers ``GET /universe`` so the background scanner and the
  UI operate on the same ranked symbol pool.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request

from data_cache.token_universe import get_universe
from universe.binance_30 import SYMBOLS as _BINANCE_30

_FUTURES_BASE = "https://fapi.binance.com"
_UA = "cogochi-universe/1.0"

def _fetch_json(path: str) -> dict | list:
    url = f"{_FUTURES_BASE}{path}"
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))

def fetch_active_usdt_perps(min_volume_usd: float = 500_000.0) -> list[str]:
    """Return all active USDT-M perp symbols with 24h volume >= min_volume_usd.

    Hits two endpoints:
    1. /fapi/v1/exchangeInfo → all active USDT symbols
    2. /fapi/v1/ticker/24hr → filter by quoteVolume

    Returns symbols sorted by volume descending.
    Raises RuntimeError on network failure (caller should fallback).
    """
    # Get all active symbols
    info = _fetch_json("/fapi/v1/exchangeInfo")
    active = {
        s["symbol"]
        for s in info["symbols"]
        if s["status"] == "TRADING" and s["quoteAsset"] == "USDT" and s["contractType"] == "PERPETUAL"
    }

    # Get 24h volume for each
    tickers = _fetch_json("/fapi/v1/ticker/24hr")
    result = []
    for t in tickers:
        sym = t["symbol"]
        if sym not in active:
            continue
        try:
            vol = float(t["quoteVolume"])
        except (KeyError, ValueError):
            continue
        if vol >= min_volume_usd:
            result.append((sym, vol))

    result.sort(key=lambda x: x[1], reverse=True)
    return [sym for sym, _ in result]


def load_dynamic_universe(
    min_volume_usd: float = 500_000.0,
    max_symbols: int = 300,
    fallback: bool = True,
) -> list[str]:
    """Load dynamic universe with fallback to binance_30.

    Args:
        min_volume_usd: Minimum 24h quote volume filter.
        max_symbols: Cap on total symbols returned.
        fallback: If True, return binance_30 on network failure.

    Returns:
        List of symbol strings (e.g. ["BTCUSDT", "ETHUSDT", ...])
    """
    try:
        symbols = fetch_active_usdt_perps(min_volume_usd)
        return symbols[:max_symbols]
    except Exception as exc:
        if fallback:
            return list(_BINANCE_30)
        raise RuntimeError(f"Failed to load dynamic universe: {exc}") from exc


def _select_symbols(
    rows: list[dict],
    *,
    min_volume_usd: float,
    max_symbols: int,
    sort: str,
) -> list[str]:
    filtered = [
        row
        for row in rows
        if row.get("symbol")
        and float(row.get("vol_24h_usd") or 0.0) >= min_volume_usd
    ]

    sort_keys = {
        "rank": lambda row: (float(row.get("rank") or 9999), -float(row.get("vol_24h_usd") or 0.0)),
        "trending": lambda row: (-float(row.get("trending_score") or 0.0), float(row.get("rank") or 9999)),
        "oi": lambda row: (-float(row.get("oi_usd") or 0.0), float(row.get("rank") or 9999)),
        "vol": lambda row: (-float(row.get("vol_24h_usd") or 0.0), float(row.get("rank") or 9999)),
    }
    filtered.sort(key=sort_keys.get(sort, sort_keys["vol"]))

    symbols = [str(row["symbol"]).upper() for row in filtered]
    if max_symbols <= 0:
        return symbols
    return symbols[:max_symbols]


async def load_dynamic_universe_async(
    min_volume_usd: float = 500_000.0,
    max_symbols: int = 300,
    *,
    sort: str = "vol",
    refresh: bool = False,
    fallback: bool = True,
) -> list[str]:
    """Load dynamic universe from the shared token-universe dataset.

    This keeps scanner symbol selection aligned with ``GET /universe`` so the
    dashboard, SymbolPicker, and background jobs all see the same ranked pool.
    """
    try:
        rows = await get_universe(force_refresh=refresh)
        symbols = _select_symbols(
            rows,
            min_volume_usd=min_volume_usd,
            max_symbols=max_symbols,
            sort=sort,
        )
        if symbols:
            return symbols
        raise RuntimeError("token universe returned no eligible symbols")
    except Exception as exc:
        if fallback:
            return list(_BINANCE_30)
        raise RuntimeError(f"Failed to load async dynamic universe: {exc}") from exc
