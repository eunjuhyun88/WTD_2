"""Confirmation: Bollinger Band width is below width_pct AND has been for
at least half of the last `lookback` bars (sustained squeeze).

A transient squeeze (one bar) is common noise. Requiring sustained narrow
width detects the "coil" phase that typically precedes a volatility
expansion.

Uses standard 20-period / 2-sigma Bollinger Bands.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def bollinger_squeeze(
    ctx: Context,
    *,
    width_pct: float = 0.04,
    lookback: int = 20,
    bb_period: int = 20,
    bb_k: float = 2.0,
) -> pd.Series:
    """Return a bool Series where BB width (as fraction of midline) is
    below `width_pct` AND sustained — at least half of the past `lookback`
    bars also had width < width_pct.

    BB width = (upper - lower) / middle = (2 * bb_k * std) / mean

    Args:
        ctx: Per-symbol Context.
        width_pct: Max fractional BB width (relative to midline) to count
            as "squeezed". Default 0.04 = 4% of price.
        lookback: How many past bars to require sustained narrowness over.
            Default 20.
        bb_period: BB middle window (std + mean). Default 20.
        bb_k: BB standard deviation multiplier. Default 2.0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if width_pct <= 0:
        raise ValueError(f"width_pct must be > 0, got {width_pct}")
    if lookback <= 0:
        raise ValueError(f"lookback must be > 0, got {lookback}")
    if bb_period <= 1:
        raise ValueError(f"bb_period must be > 1, got {bb_period}")
    if bb_k <= 0:
        raise ValueError(f"bb_k must be > 0, got {bb_k}")

    close = ctx.klines["close"]
    mid = close.rolling(bb_period, min_periods=bb_period).mean()
    std = close.rolling(bb_period, min_periods=bb_period).std(ddof=0)
    width = (2.0 * bb_k * std) / mid

    tight = width < width_pct
    # Require at least half of the past `lookback` bars (inclusive of current)
    # to also be tight.
    sustained = tight.rolling(lookback, min_periods=lookback).sum() >= (lookback / 2)
    mask = tight & sustained
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
