"""Confirmation: price broke above a past range and is now retesting it.

We split the past `2 * range_bars` into two halves:
  - OLD half (older, range_bars bars starting 2*range_bars ago):
      defines the range by its max high.
  - RECENT half (last range_bars bars, excluding current):
      must contain a close that broke above the old range high.

Current bar must be back near the old range high (±retest_tolerance).

This is an over-simplification of the real "breakout and retest" pattern
— it doesn't validate that the retest hasn't already been broken — but
it's tractable and vectorisable. The composer can pair it with a
short-term momentum filter to avoid stale retests.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def range_break_retest(
    ctx: Context,
    *,
    range_bars: int = 48,
    retest_tolerance: float = 0.005,
) -> pd.Series:
    """Return a bool Series where a prior range was broken in the recent
    past and the current close is back near the old range high.

    Args:
        ctx: Per-symbol Context.
        range_bars: Length of each half-window (old and recent). The
            effective history consumed is 2 * range_bars + 1 bars.
            Default 48.
        retest_tolerance: Max fractional distance between current close
            and the old range high. Default 0.005 (±0.5%).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if range_bars <= 0:
        raise ValueError(f"range_bars must be > 0, got {range_bars}")
    if retest_tolerance <= 0:
        raise ValueError(
            f"retest_tolerance must be > 0, got {retest_tolerance}"
        )

    close = ctx.klines["close"]
    high = ctx.klines["high"]

    # OLD half: bars at offset [range_bars+1, 2*range_bars] before current.
    old_high = high.shift(range_bars + 1).rolling(
        range_bars, min_periods=range_bars
    ).max()
    # RECENT half: bars at offset [1, range_bars] before current.
    recent_close_max = close.shift(1).rolling(
        range_bars, min_periods=range_bars
    ).max()

    broke = recent_close_max > old_high
    retesting = (close - old_high).abs() / old_high <= retest_tolerance
    mask = broke & retesting
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
