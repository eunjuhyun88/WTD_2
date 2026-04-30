"""Multi-exchange ticker fetcher (MEXC + Bitget) — W-0330.

Fetches 24h ticker data from MEXC and Bitget to compute:
  - mexc_vol_ratio: MEXC 24h volume / Binance 24h volume
  - mexc_price_lead: (MEXC price - Binance price) / Binance price

Alpha Hunter S15 formula:
  mexcRatio > 5:                        +15pts (pure volume lead)
  mexcRatio > 2 AND mexcLead > 4%:      +15pts (price + volume lead)
  mexcRatio > 2:                        +10pts (moderate volume lead)

Cache: 30 seconds per symbol
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

import requests

log = logging.getLogger("engine.data_cache.fetch_multi_exchange")

_MEXC_TICKER_URL = "https://api.mexc.com/api/v3/ticker/24hr"
_BITGET_TICKER_URL = "https://api.bitget.com/api/spot/v1/market/ticker"
_BINANCE_TICKER_URL = "https://fapi.binance.com/fapi/v1/ticker/24hr"
_TTL = 30.0


@dataclass
class MultiExchangeSnapshot:
    mexc_vol_usd: float       # MEXC 24h quote volume
    mexc_price: float         # MEXC last price
    bitget_vol_usd: float     # Bitget 24h quote volume (0 if unavailable)
    binance_vol_usd: float    # Binance 24h quote volume (for ratio)
    binance_price: float      # Binance reference price
    mexc_vol_ratio: float     # mexc_vol_usd / binance_vol_usd
    mexc_price_lead: float    # (mexc_price - binance_price) / binance_price


_cache: dict[str, tuple[MultiExchangeSnapshot, float]] = {}
_binance_cache: dict[str, tuple[float, float, float]] = {}  # sym → (vol, price, expiry)


def _fetch_binance_vol(symbol: str, timeout: float = 5.0) -> tuple[float, float]:
    """Return (vol_usd, price) for symbol from Binance perp ticker."""
    now = time.monotonic()
    if symbol in _binance_cache:
        vol, price, exp = _binance_cache[symbol]
        if now < exp:
            return vol, price
    try:
        r = requests.get(_BINANCE_TICKER_URL, params={"symbol": symbol}, timeout=timeout)
        r.raise_for_status()
        d = r.json()
        vol = float(d.get("quoteVolume", 0))
        price = float(d.get("lastPrice", 0))
        _binance_cache[symbol] = (vol, price, now + _TTL)
        return vol, price
    except Exception as exc:
        log.debug("Binance ticker failed for %s: %s", symbol, exc)
        return 0.0, 0.0


def fetch_mexc_ticker(symbol: str, timeout: float = 5.0) -> Optional[tuple[float, float]]:
    """Return (vol_usd, price) from MEXC spot API for symbol. None on error."""
    try:
        r = requests.get(_MEXC_TICKER_URL, params={"symbol": symbol}, timeout=timeout)
        r.raise_for_status()
        d = r.json()
        vol = float(d.get("quoteVolume", 0))
        price = float(d.get("lastPrice", 0))
        return vol, price
    except Exception as exc:
        log.debug("MEXC ticker failed for %s: %s", symbol, exc)
        return None


def fetch_multi_exchange_snapshot(
    symbol: str,
    timeout: float = 5.0,
) -> Optional[MultiExchangeSnapshot]:
    """Fetch MEXC + Binance data for symbol and compute ratio/lead metrics.

    Returns None if MEXC fetch fails. Binance fallback uses cache.
    """
    cache_key = symbol
    now = time.monotonic()
    if cache_key in _cache:
        snap, exp = _cache[cache_key]
        if now < exp:
            return snap

    mexc_result = fetch_mexc_ticker(symbol, timeout=timeout)
    if mexc_result is None:
        return None

    mexc_vol, mexc_price = mexc_result
    binance_vol, binance_price = _fetch_binance_vol(symbol, timeout=timeout)

    if binance_vol == 0 or binance_price == 0:
        return None

    mexc_vol_ratio = mexc_vol / binance_vol
    mexc_price_lead = (mexc_price - binance_price) / binance_price

    snap = MultiExchangeSnapshot(
        mexc_vol_usd=mexc_vol,
        mexc_price=mexc_price,
        bitget_vol_usd=0.0,
        binance_vol_usd=binance_vol,
        binance_price=binance_price,
        mexc_vol_ratio=mexc_vol_ratio,
        mexc_price_lead=mexc_price_lead,
    )
    _cache[cache_key] = (snap, now + _TTL)
    return snap
