"""OHLCV kline resampling utilities.

Given a 1-hour klines DataFrame (the canonical raw format stored in the cache),
these helpers produce higher-timeframe DataFrames using standard OHLCV
aggregation rules:

    open   → first bar in the window
    high   → max high across all bars in the window
    low    → min low across all bars in the window
    close  → last bar in the window  (settlement price)
    volume → sum of all bar volumes
    taker_buy_base_volume → sum

This design means Binance is only ever queried for 1-hour data, and every
higher timeframe (4h, 8h, daily, …) is derived deterministically from the
same source — guaranteeing consistency across TFs and eliminating the need
to manage separate per-TF caches.

Public API
----------
resample_klines(df, target_minutes)       — resample to arbitrary TF
tf_string_to_minutes(tf)                  — Binance/human TF string → int
SUPPORTED_TF_STRINGS                      — frozenset of recognised labels
"""
from __future__ import annotations

import pandas as pd

# ---------------------------------------------------------------------------
# Timeframe string mapping  (Binance interval syntax + human aliases)
# ---------------------------------------------------------------------------

_TF_MINUTES: dict[str, int] = {
    # sub-hour (can also resample from finer data if ever supported)
    "1m": 1, "3m": 3, "5m": 5, "15m": 15, "30m": 30,
    # hour
    "1h": 60, "2h": 120, "4h": 240, "6h": 360, "8h": 480, "12h": 720,
    # day+
    "1d": 1440, "3d": 4320, "1w": 10080,
    # human aliases (lowercase for convenience)
    "4h": 240, "8h": 480, "1d": 1440, "1w": 10080,
}

SUPPORTED_TF_STRINGS: frozenset[str] = frozenset(_TF_MINUTES)


def tf_string_to_minutes(tf: str) -> int:
    """Convert a Binance-style timeframe string to integer minutes.

    Raises ValueError for unknown strings.
    """
    tf = tf.lower().strip()
    if tf not in _TF_MINUTES:
        raise ValueError(
            f"Unknown timeframe {tf!r}. "
            f"Supported: {sorted(SUPPORTED_TF_STRINGS)}"
        )
    return _TF_MINUTES[tf]


# ---------------------------------------------------------------------------
# Core resample function
# ---------------------------------------------------------------------------

def _minutes_to_pandas_freq(target_minutes: int) -> str:
    """Convert minutes to the appropriate pandas offset alias."""
    if target_minutes % 1440 == 0:
        return f"{target_minutes // 1440}D"
    if target_minutes % 60 == 0:
        return f"{target_minutes // 60}h"
    return f"{target_minutes}min"


def resample_klines(df: pd.DataFrame, target_minutes: int) -> pd.DataFrame:
    """Resample an OHLCV klines DataFrame to a higher timeframe.

    Parameters
    ----------
    df : pd.DataFrame
        Source klines with a UTC DatetimeIndex and columns:
        open, high, low, close, volume, taker_buy_base_volume.
        Typically the 1-hour klines loaded from the local cache.
    target_minutes : int
        Target bar size in minutes. Must be ≥ the source bar size.
        E.g. 240 for 4h, 1440 for daily.

    Returns
    -------
    pd.DataFrame
        Resampled OHLCV DataFrame. The index is the **open time** of each
        resulting bar (pandas resample default). Incomplete trailing windows
        (the current in-progress bar) are dropped via `dropna()` on OHLC
        columns so callers always receive only fully-closed bars.

    Notes
    -----
    taker_buy_base_volume is included when present; missing columns are
    silently skipped so the function works on plain OHLCV frames too.
    """
    if target_minutes <= 0:
        raise ValueError(f"target_minutes must be positive, got {target_minutes}")
    if df.empty:
        return df.copy()

    freq = _minutes_to_pandas_freq(target_minutes)

    _AGG: dict[str, str] = {
        "open":   "first",
        "high":   "max",
        "low":    "min",
        "close":  "last",
        "volume": "sum",
        "taker_buy_base_volume": "sum",
    }
    agg = {col: rule for col, rule in _AGG.items() if col in df.columns}

    resampled = df.resample(freq).agg(agg)

    # Drop windows where any OHLC column is NaN (incomplete / no-data window).
    ohlc_cols = [c for c in ("open", "high", "low", "close") if c in resampled.columns]
    resampled = resampled.dropna(subset=ohlc_cols)

    # Ensure the index is tz-aware UTC
    if resampled.index.tz is None:
        resampled.index = resampled.index.tz_localize("UTC")

    return resampled
