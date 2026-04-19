"""Confirmation: Price returns to/below the gap level (gap fill in progress).

Rationale:
    The ultimate goal of a gap-fade short is to return price to fair value
    (the prior close before the gap). This block detects when price has
    returned to or fallen below the gap level, indicating the gap fade
    is progressing as intended.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def return_to_gap_level(
    ctx: Context,
    *,
    lookback_bars: int = 50,
    min_return_pct: float = 0.50,  # Return 50% of gap
) -> pd.Series:
    """Return a bool Series where price returns toward/below the gap level.

    True when current price has closed at least min_return_pct of the gap,
    indicating the gap-fill trade is executing.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``open``, ``close``.
        lookback_bars: Window to find the gap (default 50 = recent gap).
        min_return_pct: Fraction of gap that must be filled (default 0.50 = 50%).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where gap return
        is detected.
    """
    if lookback_bars < 2:
        raise ValueError(f"lookback_bars must be >= 2, got {lookback_bars}")
    if min_return_pct <= 0 or min_return_pct > 1:
        raise ValueError(
            f"min_return_pct must be in (0, 1], got {min_return_pct}"
        )

    open_ = ctx.klines["open"].astype(float)
    close = ctx.klines["close"].astype(float)

    # Find the highest open and lowest close in lookback window (gap edges)
    highest_open = open_.rolling(lookback_bars, min_periods=lookback_bars).max()
    lowest_close = close.rolling(lookback_bars, min_periods=lookback_bars).min()

    # Gap size (from lowest close to highest open)
    gap_size = highest_open - lowest_close

    # How much of gap is filled (from lowest close up to current close)
    filled_amount = close - lowest_close

    # Percentage of gap filled
    gap_filled_pct = filled_amount / gap_size.replace(0, float("nan"))

    # True where gap is at least min_return_pct filled (and close is still below highest open)
    returning = (gap_filled_pct >= min_return_pct) & (close < highest_open)

    return returning.reindex(ctx.features.index, fill_value=False).astype(bool)
