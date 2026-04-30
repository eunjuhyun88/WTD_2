"""Binance orderbook depth5 snapshot fetcher — W-0326.

Fetches /fapi/v1/depth (perpetual) or /api/v3/depth (spot) to populate
ob_bid_usd / ob_ask_usd features for the current bar.

Signal Radar IMBALANCE formula:
    bidVol = Σ bid[i].qty × bid[i].price  (top-5 levels)
    askVol = Σ ask[i].qty × ask[i].price  (top-5 levels)
    imbalance = bidVol / askVol

5-second TTL per symbol to avoid hammering the API in concurrent scanner.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

import requests

log = logging.getLogger("engine.data_cache.fetch_orderbook_depth")

_SPOT_URL = "https://api.binance.com/api/v3/depth"
_PERP_URL = "https://fapi.binance.com/fapi/v1/depth"
_TTL = 5.0  # seconds

_cache: dict[str, tuple[float, float, float]] = {}  # symbol → (bid_usd, ask_usd, expiry)


def fetch_orderbook_depth5(
    symbol: str,
    *,
    perp: bool = True,
    limit: int = 5,
    timeout: float = 3.0,
) -> Optional[tuple[float, float]]:
    """Return (ob_bid_usd, ob_ask_usd) snapshot for `symbol`, or None on error.

    Args:
        symbol: Binance symbol, e.g. 'BTCUSDT'
        perp: Use perpetual futures endpoint if True, spot if False
        limit: Depth levels to sum (default 5 = Signal Radar top-5)
        timeout: HTTP request timeout in seconds

    Returns:
        (ob_bid_usd, ob_ask_usd) or None if API error / unavailable
    """
    cache_key = f"{symbol}:{'p' if perp else 's'}"
    now = time.monotonic()
    if cache_key in _cache:
        bid, ask, exp = _cache[cache_key]
        if now < exp:
            return bid, ask

    url = _PERP_URL if perp else _SPOT_URL
    try:
        r = requests.get(url, params={"symbol": symbol, "limit": limit}, timeout=timeout)
        r.raise_for_status()
        data = r.json()
        bid_usd = sum(float(p) * float(q) for p, q in data.get("bids", []))
        ask_usd = sum(float(p) * float(q) for p, q in data.get("asks", []))
        _cache[cache_key] = (bid_usd, ask_usd, now + _TTL)
        return bid_usd, ask_usd
    except Exception as exc:
        log.debug("Orderbook fetch failed for %s: %s", symbol, exc)
        return None
