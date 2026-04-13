"""Confirmation: price moves in a narrow horizontal range.

Detects the "bungee zone" / arch formation where price consolidates in a
tight range before a breakout. The range is measured as (rolling_high -
rolling_low) / rolling_mid over `lookback` bars.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def sideways_compression(
    ctx: Context,
    *,
    max_range_pct: float = 0.05,
    lookback: int = 8,
) -> pd.Series:
    """Return a bool Series where price is in a narrow horizontal range.

    Range is computed as:
        (rolling_high - rolling_low) / rolling_close_mean

    over `lookback` bars. A bar is flagged when this ratio is <= max_range_pct.

    Args:
        ctx: Per-symbol Context.
        max_range_pct: Maximum range as a fraction of midpoint price.
            Must be > 0.
        lookback: Number of bars to compute the rolling high/low/mean over.
            Must be >= 2.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if max_range_pct <= 0:
        raise ValueError(f"max_range_pct must be > 0, got {max_range_pct}")
    if lookback < 2:
        raise ValueError(f"lookback must be >= 2, got {lookback}")

    high = ctx.klines["high"].rolling(lookback, min_periods=lookback).max()
    low = ctx.klines["low"].rolling(lookback, min_periods=lookback).min()
    mid = ctx.klines["close"].rolling(lookback, min_periods=lookback).mean()

    range_pct = (high - low) / mid
    mask = range_pct <= max_range_pct
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
