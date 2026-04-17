"""Shared kline cache and Binance fetcher for cogochi-autoresearch.

Storage layout:
    cogochi-autoresearch/data_cache/cache/{SYMBOL}_1h.csv      ← on-disk only for 1h
    cogochi-autoresearch/data_cache/cache/{SYMBOL}_perp.csv

The cache directory lives inside this module (rather than at repo root) so
the library is self-contained — moving cogochi-autoresearch elsewhere takes
its cache with it, and there is no WTD_DATA_ROOT environment variable to
configure.

All higher timeframes (4h, 1d, 1w, …) are derived on the fly by resampling
the 1-hour base DataFrame; see data_cache.resample for details.

Public API:
    load_klines(symbol, timeframe="1h", *, offline=False) -> DataFrame
    load_perp(symbol, *, offline=False) -> DataFrame | None
    fetch_klines_max(symbol, timeframe="1h") -> DataFrame
    fetch_perp_max(symbol) -> DataFrame
    cache_path(symbol, timeframe) -> Path
    perp_cache_path(symbol) -> Path
    resample_klines(df, target_minutes) -> DataFrame
    tf_string_to_minutes(tf) -> int
    SUPPORTED_TF_STRINGS                        # frozenset of valid TF labels
    CacheMiss                                   # raised when offline=True
"""
from data_cache.fetch_binance import fetch_klines_max
from data_cache.fetch_binance_perp import fetch_futures_klines_max, fetch_perp_max
from data_cache.loader import (
    CacheMiss,
    cache_path,
    load_klines,
    load_perp,
    perp_cache_path,
)
from data_cache.resample import (
    SUPPORTED_TF_STRINGS,
    resample_klines,
    tf_string_to_minutes,
)

__all__ = [
    "CacheMiss",
    "SUPPORTED_TF_STRINGS",
    "cache_path",
    "fetch_futures_klines_max",
    "fetch_klines_max",
    "fetch_perp_max",
    "load_klines",
    "load_perp",
    "perp_cache_path",
    "resample_klines",
    "tf_string_to_minutes",
]
