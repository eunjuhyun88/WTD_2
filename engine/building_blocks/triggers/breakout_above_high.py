"""Trigger: close breaks above the max high of the past N days.

Use case: classic trend-following trigger — "something just made a new
multi-day high, worth looking at." Past-only: the reference high window
does NOT include the current bar.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def breakout_above_high(
    ctx: Context,
    *,
    lookback_days: int = 20,
) -> pd.Series:
    """Return a bool Series where close > max(high) over the past
    `lookback_days` days (converted to 1h bars via ×24).

    Past-only: the comparison window is strictly [t-lookback_days*24 : t-1].
    A bar that is itself the new high will evaluate to True (since its
    high is not yet in the comparison window).

    Args:
        ctx: Per-symbol Context.
        lookback_days: Lookback length in days. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if lookback_days <= 0:
        raise ValueError(f"lookback_days must be > 0, got {lookback_days}")

    # Infer bar duration from klines index to convert days → bars correctly.
    # For 1H klines: 24 bars/day; for 4H: 6; for 1D: 1. Fall back to 24 (1H).
    idx = ctx.klines.index
    if len(idx) >= 2:
        delta = (idx[1] - idx[0]).total_seconds()
        bars_per_day = max(1, round(86400 / delta))
    else:
        bars_per_day = 24
    lookback_bars = lookback_days * bars_per_day
    close = ctx.klines["close"]
    high = ctx.klines["high"]
    prev_high_max = high.shift(1).rolling(lookback_bars, min_periods=lookback_bars).max()
    breakout = close > prev_high_max
    return breakout.reindex(ctx.features.index, fill_value=False).astype(bool)
