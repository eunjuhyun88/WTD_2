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
from data_cache.fetch_binance_perp import fetch_perp_max

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


def perp_cache_path(symbol: str) -> Path:
    """Return the CSV path for a symbol's merged perp series.

    Perp data is single-granularity (1h) since Binance's OI/LS history
    endpoints are 1h only, so we don't encode a timeframe in the name.
    """
    return CACHE_DIR / f"{symbol}_perp.csv"


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


def load_perp(
    symbol: str,
    *,
    offline: bool = False,
) -> pd.DataFrame | None:
    """Load merged perp series for a symbol from the local cache.

    Returns a DataFrame with columns:
        funding_rate, oi_change_1h, oi_change_24h, long_short_ratio

    Behaviour:
      - cached           → read the CSV and return the DataFrame
      - not cached, offline=False → fetch from Binance, persist, return
      - not cached, offline=True  → return None (caller falls back to
        neutral defaults — do NOT raise, because perp data is considered
        optional by the feature layer).

    Network fetch errors are caught and converted to `None` as well so
    that a failing Binance futures endpoint never breaks a challenge
    evaluation.
    """
    path = perp_cache_path(symbol)
    if path.exists():
        return pd.read_csv(path, index_col=0, parse_dates=True)

    if offline:
        return None

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        df = fetch_perp_max(symbol)
    except Exception:
        return None
    df.to_csv(path)
    return df
