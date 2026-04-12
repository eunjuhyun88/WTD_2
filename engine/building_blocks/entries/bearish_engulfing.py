"""Entry: current bar is a bearish engulfing candle.

Mirror of bullish_engulfing:
    1. Previous bar is green (close > open)
    2. Current bar is red (close < open)
    3. Current body engulfs previous body:
         open[t] >= close[t-1]  AND  close[t] <= open[t-1]
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def bearish_engulfing(
    ctx: Context,
) -> pd.Series:
    """Return a bool Series where the current bar is a bearish engulfing.

    Args:
        ctx: Per-symbol Context.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    open_ = ctx.klines["open"]
    close = ctx.klines["close"]

    prev_open = open_.shift(1)
    prev_close = close.shift(1)

    prev_green = prev_close > prev_open
    curr_red = close < open_
    engulfs = (open_ >= prev_close) & (close <= prev_open)

    mask = prev_green & curr_red & engulfs
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
