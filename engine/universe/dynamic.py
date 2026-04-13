"""Dynamic Binance USDT-M perpetual futures universe.

Fetches all active USDT-M perp symbols from Binance exchangeInfo,
filtered by minimum 24h volume. Falls back to binance_30 if fetch fails.
"""
from __future__ import annotations
import json
import urllib.request

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
    except Exception as e:
        if fallback:
            from universe.binance_30 import SYMBOLS
            return list(SYMBOLS)
        raise RuntimeError(f"Failed to load dynamic universe: {e}") from e
