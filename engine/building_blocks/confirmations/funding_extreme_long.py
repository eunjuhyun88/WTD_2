"""Confirmation: Extreme positive funding rate detected (long overheat).

Rationale:
    When funding rate is extremely positive (>0.05% on most perps), it signals
    that traders are paying heavily to hold longs. This crowded long setup
    often precedes a reversal when funding flips or volume surges.

    funding_extreme_long triggers when:
    - Current funding rate > 95th percentile of recent history
    - AND funding rate is positive (long overheat, not short)
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def funding_extreme_long(
    ctx: Context,
    *,
    lookback_bars: int = 288,  # ~12 hours at 1h
    percentile_threshold: float = 0.95,
) -> pd.Series:
    """Return a bool Series where funding rate is extremely high (positive).

    True when current funding exceeds 95th percentile and is positive,
    indicating crowded long positions.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have column
            ``funding_rate``.
        lookback_bars: Historical window for percentile (default 288 = 12h).
        percentile_threshold: Percentile above which funding is "extreme".
            Default 0.95 (top 5%).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where funding
        is extremely high and positive.
    """
    if lookback_bars < 1:
        raise ValueError(f"lookback_bars must be >= 1, got {lookback_bars}")
    if not 0.0 < percentile_threshold < 1.0:
        raise ValueError(
            f"percentile_threshold must be in (0, 1), got {percentile_threshold}"
        )

    funding = ctx.klines["funding_rate"].astype(float)

    # Percentile of funding over lookback window
    funding_percentile = funding.rolling(
        lookback_bars, min_periods=lookback_bars
    ).apply(
        lambda x: pd.Series(x).rank(pct=True).iloc[-1], raw=False
    )

    # True where funding is extreme AND positive
    extreme_and_positive = (funding_percentile >= percentile_threshold) & (funding > 0)

    return extreme_and_positive.reindex(ctx.features.index, fill_value=False).astype(bool)
