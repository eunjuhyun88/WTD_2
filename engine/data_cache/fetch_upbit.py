"""Upbit BTC/KRW + USD/KRW fetcher for kimchi premium calculation."""
from __future__ import annotations

import time
from typing import Optional

import requests

_upbit_cache: dict[str, tuple[float, float]] = {}  # key → (value, expiry_ts)
_TTL = 300.0  # 5 min


def _cached(key: str, fn) -> float:
    now = time.time()
    if key in _upbit_cache:
        val, exp = _upbit_cache[key]
        if now < exp:
            return val
    val = fn()
    _upbit_cache[key] = (val, now + _TTL)
    return val


def fetch_upbit_btc_krw() -> Optional[float]:
    """Return latest BTC/KRW price from Upbit public API. Returns None on error."""
    def _fetch() -> float:
        r = requests.get(
            "https://api.upbit.com/v1/ticker",
            params={"markets": "KRW-BTC"},
            timeout=5,
        )
        r.raise_for_status()
        return float(r.json()[0]["trade_price"])
    try:
        return _cached("upbit_btc_krw", _fetch)
    except Exception:
        return None


def fetch_usd_krw_rate() -> Optional[float]:
    """Return USD/KRW rate from Yahoo Finance (15-min delayed). Returns None on error."""
    def _fetch() -> float:
        r = requests.get(
            "https://query1.finance.yahoo.com/v8/finance/chart/KRW=X",
            headers={"User-Agent": "Mozilla/5.0"},
            timeout=5,
        )
        r.raise_for_status()
        data = r.json()
        return float(data["chart"]["result"][0]["meta"]["regularMarketPrice"])
    try:
        return _cached("usd_krw", _fetch)
    except Exception:
        return None
