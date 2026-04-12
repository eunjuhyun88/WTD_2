"""Confirmation: Bollinger Band width just expanded.

True when current BB width is >= expansion_factor × the width `ago` bars
earlier. Detects the "BB just started opening up" moment, typically right
after a squeeze breaks.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def bollinger_expansion(
    ctx: Context,
    *,
    expansion_factor: float = 1.5,
    ago: int = 5,
    bb_period: int = 20,
    bb_k: float = 2.0,
) -> pd.Series:
    """Return a bool Series where current BB width >= expansion_factor
    times the width `ago` bars earlier.

    Args:
        ctx: Per-symbol Context.
        expansion_factor: Required multiplier vs past width. Default 1.5.
        ago: How many bars back to compare against. Default 5.
        bb_period: BB middle window. Default 20.
        bb_k: BB standard deviation multiplier. Default 2.0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if expansion_factor <= 1.0:
        raise ValueError(
            f"expansion_factor must be > 1.0, got {expansion_factor}"
        )
    if ago <= 0:
        raise ValueError(f"ago must be > 0, got {ago}")
    if bb_period <= 1:
        raise ValueError(f"bb_period must be > 1, got {bb_period}")
    if bb_k <= 0:
        raise ValueError(f"bb_k must be > 0, got {bb_k}")

    close = ctx.klines["close"]
    mid = close.rolling(bb_period, min_periods=bb_period).mean()
    std = close.rolling(bb_period, min_periods=bb_period).std(ddof=0)
    width = (2.0 * bb_k * std) / mid

    past_width = width.shift(ago)
    expanding = width >= expansion_factor * past_width
    return expanding.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
