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
    lookback_days: int,
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

    lookback_bars = lookback_days * 24
    close = ctx.klines["close"]
    high = ctx.klines["high"]
    prev_high_max = high.shift(1).rolling(lookback_bars, min_periods=lookback_bars).max()
    breakout = close > prev_high_max
    return breakout.reindex(ctx.features.index, fill_value=False).astype(bool)
