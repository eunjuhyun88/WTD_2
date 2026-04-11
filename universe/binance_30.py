"""Tier-balanced 30-coin Binance spot universe.

10 large + 10 mid + 10 small cap by common rankings as of late 2025.
Hardcoded so the autoresearch dataset stays reproducible across runs —
if we pulled "top 30 by volume right now" the set would drift month to
month and pattern scores would become non-comparable.

Originally defined in pattern-scanner-challenge/fetch.py. Moved here in
Phase D1 so multiple challenges can share one universe definition.
"""
from __future__ import annotations

LARGE_CAP: tuple[str, ...] = (
    "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT",
    "ADAUSDT", "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT",
)
MID_CAP: tuple[str, ...] = (
    "TRXUSDT", "LTCUSDT", "BCHUSDT", "NEARUSDT", "ATOMUSDT",
    "FILUSDT", "ETCUSDT", "ICPUSDT", "APTUSDT", "ARBUSDT",
)
SMALL_CAP: tuple[str, ...] = (
    "OPUSDT", "INJUSDT", "SEIUSDT", "SUIUSDT", "FTMUSDT",
    "ALGOUSDT", "MANAUSDT", "SANDUSDT", "AAVEUSDT", "LDOUSDT",
)

SYMBOLS: tuple[str, ...] = LARGE_CAP + MID_CAP + SMALL_CAP
