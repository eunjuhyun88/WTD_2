"""Shared kline cache and Binance fetcher for cogochi-autoresearch.

Storage layout:
    cogochi-autoresearch/data_cache/cache/{SYMBOL}_{TIMEFRAME}.csv

The cache directory lives inside this module (rather than at repo root) so
the library is self-contained — moving cogochi-autoresearch elsewhere takes
its cache with it, and there is no WTD_DATA_ROOT environment variable to
configure.

Public API:
    load_klines(symbol, timeframe="1h", *, offline=False) -> DataFrame
    fetch_klines_max(symbol, timeframe="1h") -> DataFrame
    cache_path(symbol, timeframe) -> Path
    CacheMiss                                   # raised when offline=True
"""
from data_cache.fetch_binance import fetch_klines_max
from data_cache.loader import CacheMiss, cache_path, load_klines

__all__ = [
    "CacheMiss",
    "cache_path",
    "fetch_klines_max",
    "load_klines",
]
