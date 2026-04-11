"""Lazy read-or-fetch loader for kline CSV cache.

The key design decision: `load_klines(..., offline=False)` will silently
fetch missing data from Binance, but `load_klines(..., offline=True)`
raises `CacheMiss` immediately. Challenge prepare.py should call the
former during setup (prewarm) and the latter during evaluate() so that a
long-running experiment cannot silently stall on network I/O halfway
through.
"""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from data_cache.fetch_binance import fetch_klines_max

# On-disk storage — resolves to cogochi-autoresearch/data_cache/cache/.
# This is gitignored. See cogochi-autoresearch/.gitignore handling in
# the repo-root .gitignore.
CACHE_DIR = Path(__file__).parent / "cache"

_SUPPORTED_TIMEFRAMES = frozenset({"1h"})


class CacheMiss(RuntimeError):
    """Raised when load_klines(..., offline=True) hits an empty cache."""


def cache_path(symbol: str, timeframe: str) -> Path:
    """Return the CSV path for (symbol, timeframe) — does NOT check existence."""
    return CACHE_DIR / f"{symbol}_{timeframe}.csv"


def load_klines(
    symbol: str,
    timeframe: str = "1h",
    *,
    offline: bool = False,
) -> pd.DataFrame:
    """Load OHLCV klines for (symbol, timeframe) from the local cache.

    Behaviour:
      - cached           → read the CSV and return the DataFrame
      - not cached, offline=False → fetch from Binance, persist, return
      - not cached, offline=True  → raise CacheMiss

    Args:
        symbol: Binance pair, e.g. "BTCUSDT".
        timeframe: kline interval. Only "1h" is implemented for Phase D.
        offline: if True, never hits the network. Use during evaluate().

    Raises:
        NotImplementedError: if timeframe is anything other than "1h".
        CacheMiss: if offline=True and the CSV does not exist.
        RuntimeError: if fetching from Binance fails.
    """
    if timeframe not in _SUPPORTED_TIMEFRAMES:
        raise NotImplementedError(
            f"timeframe={timeframe!r} not supported yet; "
            f"only {sorted(_SUPPORTED_TIMEFRAMES)}"
        )

    path = cache_path(symbol, timeframe)
    if path.exists():
        return pd.read_csv(path, index_col="timestamp", parse_dates=True)

    if offline:
        raise CacheMiss(
            f"{symbol}_{timeframe} not cached at {path} and offline=True"
        )

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    df = fetch_klines_max(symbol, timeframe)
    df.to_csv(path)
    return df
