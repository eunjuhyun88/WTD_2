"""Entry: current bar is a bullish engulfing candle.

Requirements:
    1. Previous bar is red (close < open)
    2. Current bar is green (close > open)
    3. Current body engulfs previous body:
         open[t] <= close[t-1]  AND  close[t] >= open[t-1]
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def bullish_engulfing(
    ctx: Context,
) -> pd.Series:
    """Return a bool Series where the current bar is a bullish engulfing.

    Args:
        ctx: Per-symbol Context.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    open_ = ctx.klines["open"]
    close = ctx.klines["close"]

    prev_open = open_.shift(1)
    prev_close = close.shift(1)

    prev_red = prev_close < prev_open
    curr_green = close > open_
    engulfs = (open_ <= prev_close) & (close >= prev_open)

    mask = prev_red & curr_green & engulfs
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
