"""Shared kline cache and Binance fetcher for cogochi-autoresearch.

Storage layout:
    cogochi-autoresearch/data_cache/cache/{SYMBOL}_{TIMEFRAME}.csv
    cogochi-autoresearch/data_cache/cache/{SYMBOL}_perp.csv

The cache directory lives inside this module (rather than at repo root) so
the library is self-contained — moving cogochi-autoresearch elsewhere takes
its cache with it, and there is no WTD_DATA_ROOT environment variable to
configure.

Public API:
    load_klines(symbol, timeframe="1h", *, offline=False) -> DataFrame
    load_perp(symbol, *, offline=False) -> DataFrame | None
    fetch_klines_max(symbol, timeframe="1h") -> DataFrame
    fetch_perp_max(symbol) -> DataFrame
    cache_path(symbol, timeframe) -> Path
    perp_cache_path(symbol) -> Path
    CacheMiss                                   # raised when offline=True
"""
from data_cache.fetch_binance import fetch_klines_max
from data_cache.fetch_binance_perp import fetch_perp_max
from data_cache.loader import (
    CacheMiss,
    cache_path,
    load_klines,
    load_perp,
    perp_cache_path,
)

__all__ = [
    "CacheMiss",
    "cache_path",
    "fetch_klines_max",
    "fetch_perp_max",
    "load_klines",
    "load_perp",
    "perp_cache_path",
]
