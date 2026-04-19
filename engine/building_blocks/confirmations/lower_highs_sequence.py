"""Confirmation: Price forming a sequence of lower highs (downtrend structure).

Rationale:
    During a short reversal setup, price should form lower highs as sellers
    take control. A sequence of 2+ lower highs confirms the downside momentum
    and provides a clear short entry with stop above the most recent high.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def lower_highs_sequence(
    ctx: Context,
    *,
    min_sequence: int = 2,
    lookback_bars: int = 8,
) -> pd.Series:
    """Return a bool Series where price forms lower highs.

    True when current bar's high is lower than previous bar's high,
    repeated for min_sequence bars.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have column ``high``.
        min_sequence: Minimum number of consecutive lower highs (default 2).
        lookback_bars: Window to check (default 8).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where sequence
        is detected.
    """
    if min_sequence < 1 or min_sequence > lookback_bars:
        raise ValueError(
            f"min_sequence must be >= 1 and <= lookback_bars, got {min_sequence} vs {lookback_bars}"
        )

    high = ctx.klines["high"].astype(float)

    # Count how many times current high < prior high
    lower_high_count = 0
    for i in range(1, lookback_bars + 1):
        lower_high = high < high.shift(i)
        lower_high_count = lower_high_count + lower_high

    # True where at least min_sequence bars have lower high
    sequence = lower_high_count >= min_sequence

    return sequence.reindex(ctx.features.index, fill_value=False).astype(bool)
