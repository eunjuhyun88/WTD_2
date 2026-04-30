"""Binance aggTrades fetcher — W-0327.

Fetches the most recent 1000 aggTrades for a symbol to compute:
  - True CVD (cumulative delta): if trade.m (buyer is maker) → sell, else buy
  - Volume velocity 1m: vol1m / avgVol1m (Signal Radar Vol Velocity)
  - Whale tick count: trades >= $50K buy (not isBuyerMaker)

Signal Radar formulas:
  CVD trigger: Δcvd >= $20K USDT per bar
  vol_velocity: vol1m / avgVol1m >= 2.5 AND vol1m >= $20K
               Force 5.0 if avgVol1m < $5K but vol1m > $50K
  whale_tick: single trade size * price >= $50K, not isBuyerMaker

TTL: 10 seconds per symbol (aggTrades are real-time; 1000 trades covers ~1–5min)
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

import requests

log = logging.getLogger("engine.data_cache.fetch_aggtrades")

_SPOT_URL = "https://api.binance.com/api/v3/aggTrades"
_PERP_URL = "https://fapi.binance.com/fapi/v1/aggTrades"
_TTL = 10.0  # seconds


@dataclass
class AggTradesSnapshot:
    cvd_usd: float          # cumulative delta in USD (buy - sell), last 1000 trades
    vol_1m_usd: float       # total USD volume in last ~60 seconds
    avg_vol_1m_usd: float   # average USD volume per 60s window (rolling over 1000 trades)
    vol_velocity: float     # vol_1m_usd / avg_vol_1m_usd
    whale_tick_count: int   # number of trades >= $50K buy


_cache: dict[str, tuple[AggTradesSnapshot, float]] = {}  # symbol → (snapshot, expiry)


def fetch_aggtrades_snapshot(
    symbol: str,
    *,
    perp: bool = True,
    limit: int = 1000,
    whale_threshold_usd: float = 50_000.0,
    vol_velocity_window_s: float = 60.0,
    timeout: float = 5.0,
) -> Optional[AggTradesSnapshot]:
    """Fetch recent aggTrades and compute CVD/velocity/whale metrics.

    Returns None on network error. Results cached for 10 seconds.
    """
    cache_key = f"{symbol}:{'p' if perp else 's'}"
    now = time.monotonic()
    if cache_key in _cache:
        snap, exp = _cache[cache_key]
        if now < exp:
            return snap

    url = _PERP_URL if perp else _SPOT_URL
    try:
        r = requests.get(url, params={"symbol": symbol, "limit": limit}, timeout=timeout)
        r.raise_for_status()
        trades = r.json()
    except Exception as exc:
        log.debug("AggTrades fetch failed for %s: %s", symbol, exc)
        return None

    if not trades:
        return None

    # Parse trades and compute metrics
    # Binance aggTrades fields: p=price, q=qty, T=time_ms, m=isBuyerMaker
    cvd_usd = 0.0
    vol_total_usd = 0.0
    whale_count = 0

    now_ms = trades[-1]["T"]
    window_start_ms = now_ms - int(vol_velocity_window_s * 1000)
    vol_1m_usd = 0.0

    for t in trades:
        price = float(t["p"])
        qty = float(t["q"])
        notional = price * qty
        is_buyer_maker = t["m"]  # True = sell order hit bid = sell-side

        if is_buyer_maker:
            cvd_usd -= notional  # sell
        else:
            cvd_usd += notional  # buy
            if notional >= whale_threshold_usd:
                whale_count += 1

        vol_total_usd += notional

        if t["T"] >= window_start_ms:
            vol_1m_usd += notional

    # Average volume: total / number of 60s windows in the sample
    total_time_s = max((trades[-1]["T"] - trades[0]["T"]) / 1000.0, 1.0)
    n_windows = max(total_time_s / vol_velocity_window_s, 1.0)
    avg_vol_1m_usd = vol_total_usd / n_windows

    # Vol velocity with force-5.0 rule (Signal Radar)
    if avg_vol_1m_usd < 5_000 and vol_1m_usd > 50_000:
        vol_velocity = 5.0
    elif avg_vol_1m_usd > 0:
        vol_velocity = vol_1m_usd / avg_vol_1m_usd
    else:
        vol_velocity = 0.0

    snap = AggTradesSnapshot(
        cvd_usd=cvd_usd,
        vol_1m_usd=vol_1m_usd,
        avg_vol_1m_usd=avg_vol_1m_usd,
        vol_velocity=vol_velocity,
        whale_tick_count=whale_count,
    )
    _cache[cache_key] = (snap, now + _TTL)
    return snap
