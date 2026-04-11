"""Entry: price made a new low in the recent window but RSI did not.

Vectorised approximation of classic bullish divergence:
    recent_min  = min(close) over the last `recent_bars` bars
    past_min    = min(close) over the `lookback - recent_bars` bars
                  before that
    price_new_low = recent_min < past_min

    Same comparison for RSI. If price made a new low but RSI did not,
    call it a bullish divergence at this bar.

This is an intentional simplification of the catalog spec (which
defines divergence via explicit swing pivots) that trades precision for
vectorisability. The composer can combine it with an entry candle
filter (e.g., long_lower_wick) to reduce false positives.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.primitives import rsi as rsi_fn


def rsi_bullish_divergence(
    ctx: Context,
    *,
    lookback: int = 30,
    rsi_period: int = 14,
    recent_bars: int = 3,
) -> pd.Series:
    """Return a bool Series where a new price low was printed in the last
    `recent_bars` bars without a corresponding new RSI low.

    Args:
        ctx: Per-symbol Context.
        lookback: Total window (recent + past) for comparison. Default 30.
        rsi_period: RSI computation period. Default 14.
        recent_bars: How many trailing bars form the "recent" window.
            Default 3.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if lookback <= 0:
        raise ValueError(f"lookback must be > 0, got {lookback}")
    if rsi_period <= 0:
        raise ValueError(f"rsi_period must be > 0, got {rsi_period}")
    if recent_bars <= 0:
        raise ValueError(f"recent_bars must be > 0, got {recent_bars}")
    if recent_bars >= lookback:
        raise ValueError(
            f"recent_bars ({recent_bars}) must be < lookback ({lookback})"
        )

    close = ctx.klines["close"]
    rsi_ser = rsi_fn(close, period=rsi_period)

    past_window = lookback - recent_bars

    recent_price_min = close.rolling(recent_bars, min_periods=recent_bars).min()
    past_price_min = close.shift(recent_bars).rolling(
        past_window, min_periods=past_window
    ).min()
    price_new_low = recent_price_min < past_price_min

    recent_rsi_min = rsi_ser.rolling(recent_bars, min_periods=recent_bars).min()
    past_rsi_min = rsi_ser.shift(recent_bars).rolling(
        past_window, min_periods=past_window
    ).min()
    rsi_no_new_low = recent_rsi_min > past_rsi_min

    mask = price_new_low & rsi_no_new_low
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
