"""Confirmation: funding rate flips from negative to positive.

Detects a long-switching signal where funding was negative over the past
`lookback` bars but is now positive. This indicates shorts have been
dominant but longs are taking over, often a precursor to a squeeze.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def funding_flip(
    ctx: Context,
    *,
    lookback: int = 3,
) -> pd.Series:
    """Return a bool Series where funding rate flipped from negative to positive.

    Conditions:
      - Current bar: funding_rate > 0
      - All of the past `lookback` bars: rolling max of shifted funding < 0
        (meaning every bar in the window was negative)

    Args:
        ctx: Per-symbol Context.
        lookback: Number of past bars that must have had negative funding.
            Must be >= 1.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if lookback < 1:
        raise ValueError(f"lookback must be >= 1, got {lookback}")

    funding = ctx.features["funding_rate"]
    currently_positive = funding > 0
    was_negative = (
        funding.shift(1).rolling(lookback, min_periods=lookback).max() < 0
    )
    mask = currently_positive & was_negative
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
