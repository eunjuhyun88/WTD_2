"""Entry: price made a new high in the recent window but RSI did not.

Mirror of rsi_bullish_divergence. See that module for full rationale.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context
from building_blocks.primitives import rsi as rsi_fn


def rsi_bearish_divergence(
    ctx: Context,
    *,
    lookback: int = 30,
    rsi_period: int = 14,
    recent_bars: int = 3,
) -> pd.Series:
    """Return a bool Series where a new price high was printed in the last
    `recent_bars` bars without a corresponding new RSI high.

    Args:
        ctx: Per-symbol Context.
        lookback: Total window. Default 30.
        rsi_period: RSI computation period. Default 14.
        recent_bars: Trailing-window length. Default 3.

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

    recent_price_max = close.rolling(recent_bars, min_periods=recent_bars).max()
    past_price_max = close.shift(recent_bars).rolling(
        past_window, min_periods=past_window
    ).max()
    price_new_high = recent_price_max > past_price_max

    recent_rsi_max = rsi_ser.rolling(recent_bars, min_periods=recent_bars).max()
    past_rsi_max = rsi_ser.shift(recent_bars).rolling(
        past_window, min_periods=past_window
    ).max()
    rsi_no_new_high = recent_rsi_max < past_rsi_max

    mask = price_new_high & rsi_no_new_high
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
