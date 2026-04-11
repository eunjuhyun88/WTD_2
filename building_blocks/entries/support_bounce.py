"""Entry: price touched a support level and closed green.

Two modes:
    - support_level supplied: check every bar against the fixed level
    - support_level is None: auto-detect the rolling N-bar low as
      "support" for each bar (past-only)
"""
from __future__ import annotations

from typing import Optional

import pandas as pd

from building_blocks.context import Context


def support_bounce(
    ctx: Context,
    *,
    support_level: Optional[float] = None,
    tolerance: float = 0.01,
    lookback: int = 60,
) -> pd.Series:
    """Return a bool Series where the current low is within ±tolerance
    of the support level AND the bar closed above its open (bullish
    rejection candle).

    Args:
        ctx: Per-symbol Context.
        support_level: Fixed price level. If None, uses rolling past min
            of `low` over `lookback` bars.
        tolerance: Fractional half-width around the support level.
            Default 0.01 (±1%).
        lookback: Lookback for auto-detected support. Ignored when
            support_level is supplied. Default 60.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if tolerance <= 0:
        raise ValueError(f"tolerance must be > 0, got {tolerance}")
    if lookback <= 0:
        raise ValueError(f"lookback must be > 0, got {lookback}")
    if support_level is not None and support_level <= 0:
        raise ValueError(f"support_level must be > 0, got {support_level}")

    open_ = ctx.klines["open"]
    close = ctx.klines["close"]
    low = ctx.klines["low"]

    if support_level is not None:
        near_support = (low - support_level).abs() / support_level <= tolerance
    else:
        # Past-only rolling low (exclude current bar)
        auto_support = low.shift(1).rolling(lookback, min_periods=lookback).min()
        near_support = (low - auto_support).abs() / auto_support <= tolerance

    bullish_bar = close > open_
    mask = near_support & bullish_bar
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
