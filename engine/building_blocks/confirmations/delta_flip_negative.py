"""Confirmation: Funding rate flips from positive to negative (delta flip event).

Rationale:
    A flip in funding direction signals a shift in market sentiment.
    Positive→negative flip = longs capitulating, shorts gaining control.
    This is a major event that often precedes a sharp sell-off.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def delta_flip_negative(
    ctx: Context,
    *,
    lookback_bars: int = 3,
) -> pd.Series:
    """Return a bool Series where funding flips from positive to negative.

    True when funding transitions from positive (or zero) to negative,
    indicating a shift from long-dominated to short-dominated sentiment.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have column
            ``funding_rate``.
        lookback_bars: Number of prior bars to check for positive funding.
            Default 3 (recent positive bias).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where flip occurs.
    """
    if lookback_bars < 1:
        raise ValueError(f"lookback_bars must be >= 1, got {lookback_bars}")

    funding = ctx.klines["funding_rate"].astype(float)

    # Check if recent history (prior bars) was positive
    prior_positive = funding.shift(1).fillna(0) >= 0
    for i in range(2, lookback_bars + 1):
        prior_positive = prior_positive | (funding.shift(i).fillna(0) >= 0)

    # Current bar is negative
    current_negative = funding < 0

    # Flip event: prior was positive, current is negative
    flip = prior_positive & current_negative

    return flip.reindex(ctx.features.index, fill_value=False).astype(bool)
