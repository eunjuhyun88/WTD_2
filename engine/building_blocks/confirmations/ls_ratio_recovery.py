"""Confirmation: long/short ratio is recovering after a local dump low."""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def ls_ratio_recovery(
    ctx: Context,
    *,
    lookback: int = 8,
    recovery_threshold: float = 0.03,
) -> pd.Series:
    """Return True where long/short ratio recovered from a recent local low."""
    if lookback < 2:
        raise ValueError(f"lookback must be >= 2, got {lookback}")
    if recovery_threshold <= 0:
        raise ValueError(
            f"recovery_threshold must be > 0, got {recovery_threshold}"
        )

    ratio = ctx.features["long_short_ratio"].astype(float)
    rolling_min = ratio.rolling(lookback, min_periods=lookback).min()
    recovered = ratio >= rolling_min * (1.0 + recovery_threshold)
    return recovered.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
