"""Confirmation: price reclaimed a meaningful portion of a recent dump range."""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def reclaim_after_dump(
    ctx: Context,
    *,
    lookback: int = 12,
    reclaim_threshold: float = 0.35,
) -> pd.Series:
    """Return True where close reclaimed part of the recent dump range."""
    if lookback < 2:
        raise ValueError(f"lookback must be >= 2, got {lookback}")
    if not 0 < reclaim_threshold < 1:
        raise ValueError(
            f"reclaim_threshold must be between 0 and 1, got {reclaim_threshold}"
        )

    rolling_high = ctx.klines["high"].rolling(lookback, min_periods=lookback).max()
    rolling_low = ctx.klines["low"].rolling(lookback, min_periods=lookback).min()
    rolling_range = (rolling_high - rolling_low).replace(0, pd.NA)
    close_position = (ctx.klines["close"] - rolling_low) / rolling_range
    reclaimed = close_position >= reclaim_threshold
    return reclaimed.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
