"""Trigger: tight range over past N bars, then breakout.

A bar matches if:
  1. Over the past `range_bars` (excluding the current bar), the
     (high - low) spread stayed within `range_pct` of the low; AND
  2. The current close exceeds the max high of that same past window.

This catches classic consolidation-breakout setups: a quiet coil
followed by an expansion bar.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def consolidation_then_breakout(
    ctx: Context,
    *,
    range_bars: int,
    range_pct: float,
) -> pd.Series:
    """Return a bool Series where the past `range_bars` formed a tight
    range and the current close broke above it.

    Past-only: the range window is [t-range_bars : t-1]. The current bar
    does not contribute to the range measurement but is compared against
    the resulting max high.

    Args:
        ctx: Per-symbol Context.
        range_bars: Length of the consolidation window. Must be > 0.
        range_pct: Max (high-low)/low allowed in the window. e.g. 0.03 =
            a 3% range. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if range_bars <= 0:
        raise ValueError(f"range_bars must be > 0, got {range_bars}")
    if range_pct <= 0:
        raise ValueError(f"range_pct must be > 0, got {range_pct}")

    high = ctx.klines["high"]
    low = ctx.klines["low"]
    close = ctx.klines["close"]

    past_high = high.shift(1).rolling(range_bars, min_periods=range_bars).max()
    past_low = low.shift(1).rolling(range_bars, min_periods=range_bars).min()
    ratio = (past_high - past_low) / past_low
    was_tight = ratio <= range_pct
    is_break = close > past_high
    hit = was_tight & is_break
    return hit.reindex(ctx.features.index, fill_value=False).astype(bool)
