"""Confirmation: Funding rate is persistently negative (short bias).

Rationale:
    After a funding flip, the negative bias should persist for at least a few
    bars to confirm the trend. A single negative bar is noise; 3+ bars confirms
    shorts are in control and the funding regime has shifted.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def negative_funding_bias(
    ctx: Context,
    *,
    min_bars: int = 3,
    lookback_bars: int = 5,
) -> pd.Series:
    """Return a bool Series where funding is persistently negative.

    True when most recent bars show negative funding, indicating a sustained
    short-dominated regime.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have column
            ``funding_rate``.
        min_bars: Minimum bars that must be negative (default 3).
        lookback_bars: Window to check (default 5).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where persistent
        negative funding is detected.
    """
    if min_bars < 1 or min_bars > lookback_bars:
        raise ValueError(
            f"min_bars must be >= 1 and <= lookback_bars, got {min_bars} vs {lookback_bars}"
        )

    funding = ctx.klines["funding_rate"].astype(float)

    # Count negative bars in lookback window
    negative_count = (
        (funding < 0).rolling(lookback_bars, min_periods=lookback_bars).sum()
    )

    # True where at least min_bars are negative
    persistent_negative = negative_count >= min_bars

    return persistent_negative.reindex(ctx.features.index, fill_value=False).astype(bool)
