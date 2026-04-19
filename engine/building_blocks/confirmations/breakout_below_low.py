"""Confirmation: Price breaks below a previous support level.

Rationale:
    For short entries, a break below a prior low (usually the recent swing low)
    signals the end of support and start of a fast move lower. This is the
    signal that a short setup has matured into an executable trade.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def breakout_below_low(
    ctx: Context,
    *,
    lookback_bars: int = 20,
) -> pd.Series:
    """Return a bool Series where price breaks below a prior low.

    True when current bar's low is below the lowest low of the lookback window
    (excluding current bar), indicating a breakdown below support.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have column ``low``.
        lookback_bars: Window for finding the prior low (default 20 = ~1 day).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where breakdown
        is detected.
    """
    if lookback_bars < 2:
        raise ValueError(f"lookback_bars must be >= 2, got {lookback_bars}")

    low = ctx.klines["low"].astype(float)

    # Lowest low of prior bars (exclude current)
    prior_low = low.shift(1).rolling(lookback_bars, min_periods=lookback_bars).min()

    # Current bar breaks below the prior low
    breakdown = low < prior_low

    return breakdown.reindex(ctx.features.index, fill_value=False).astype(bool)
