"""Universe definition for Binance perp futures research pipeline.

Three tiers of 20 symbols total, plus supported timeframes.
All symbols are USDT-margined perpetual futures on Binance (USDT-M).
"""
from __future__ import annotations

# 5 highest-liquidity symbols — always included
TIER1: list[str] = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
]

# Mid-cap with deep OI + funding data
TIER2: list[str] = [
    "DOGEUSDT",
    "ADAUSDT",
    "AVAXUSDT",
    "LINKUSDT",
    "TRXUSDT",
    "DOTUSDT",
    "MATICUSDT",
    "TONUSDT",
    "SHIBUSDT",
    "LTCUSDT",
]

# Smaller but relevant for regime/OI signals
TIER3: list[str] = [
    "NEARUSDT",
    "ATOMUSDT",
    "UNIUSDT",
    "ETCUSDT",
    "XLMUSDT",
]

ALL_SYMBOLS: list[str] = TIER1 + TIER2 + TIER3

# Supported timeframes for OHLCV klines
TIMEFRAMES: list[str] = ["1m", "5m", "15m", "1h", "4h", "1d"]

# OI history periods supported by Binance /futures/data/openInterestHist
OI_PERIODS: list[str] = ["5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d"]

assert len(ALL_SYMBOLS) == 20, f"Expected 20 symbols, got {len(ALL_SYMBOLS)}"
assert len(set(ALL_SYMBOLS)) == 20, "Duplicate symbols in universe"
