"""Recorded API response fixtures for ingest tests.

All timestamps represent real Binance USDT-M format but use a fixed
reference time (2024-01-15 00:00 UTC = 1705276800000 ms) for determinism.
No live HTTP calls are made.
"""
from __future__ import annotations

# Reference start: 2024-01-15 00:00:00 UTC in milliseconds
_T0 = 1705276800000
_1H_MS = 3_600_000
_8H_MS = 28_800_000
_5M_MS = 300_000


def make_klines_fixture(
    n: int = 5,
    interval_ms: int = _1H_MS,
    base_price: float = 42000.0,
) -> list[list]:
    """Generate n synthetic klines in Binance API format.

    Format: [open_time, open, high, low, close, volume, close_time,
             quote_volume, trades, taker_buy_base, taker_buy_quote, ignore]
    """
    rows = []
    for i in range(n):
        open_time = _T0 + i * interval_ms
        close_time = open_time + interval_ms - 1
        price = base_price + i * 10
        rows.append([
            open_time,
            str(price),
            str(price + 100),
            str(price - 50),
            str(price + 50),
            "1234.567",
            close_time,
            "51852345.678",
            1500,
            "617.283",
            "25926172.839",
            "0",
        ])
    return rows


def make_oi_fixture(n: int = 5, period_ms: int = _5M_MS) -> list[dict]:
    """Generate n synthetic OI history records in Binance API format."""
    rows = []
    for i in range(n):
        ts = _T0 + i * period_ms
        oi = 50000.0 + i * 100
        rows.append({
            "symbol": "BTCUSDT",
            "sumOpenInterest": str(oi),
            "sumOpenInterestValue": str(oi * 42000),
            "timestamp": ts,
        })
    return rows


def make_funding_fixture(n: int = 5) -> list[dict]:
    """Generate n synthetic funding rate records in Binance API format."""
    rows = []
    for i in range(n):
        ts = _T0 + i * _8H_MS
        rows.append({
            "symbol": "BTCUSDT",
            "fundingTime": ts,
            "fundingRate": str(0.0001 + i * 0.00001),
            "markPrice": str(42000.0 + i * 10),
        })
    return rows
