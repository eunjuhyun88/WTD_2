"""Confirmation: funding is persistently positive over a recent window."""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def positive_funding_bias(
    ctx: Context,
    *,
    lookback: int = 4,
) -> pd.Series:
    """Return True where recent average funding is positive.

    This is a softer alternative to `funding_flip`: instead of requiring a
    single-bar negative-to-positive sign change, it checks whether funding
    has already shifted to a sustained positive bias.
    """
    if lookback < 1:
        raise ValueError(f"lookback must be >= 1, got {lookback}")

    funding = ctx.features["funding_rate"]
    bias = funding.rolling(lookback, min_periods=lookback).mean() > 0
    return bias.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
