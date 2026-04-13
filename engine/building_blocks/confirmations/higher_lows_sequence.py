"""Confirmation: recent swing lows are rising (accumulation phase signal).

Detects that the rolling minimum of lows over `window` bars is now higher
than it was `window` bars ago, indicating that the market is putting in
higher lows — a classic accumulation / uptrend structure.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def higher_lows_sequence(
    ctx: Context,
    *,
    window: int = 8,
    min_rise_count: int = 2,
) -> pd.Series:
    """Return a bool Series where the rolling low minimum is rising.

    A "higher lows" condition is defined as: the rolling minimum of
    ctx.klines["low"] over `window` bars is strictly greater than the
    rolling minimum from `window` bars ago.

    Args:
        ctx: Per-symbol Context.
        window: Number of bars for the rolling minimum look-back.
            Must be >= 2.
        min_rise_count: Kept for API symmetry / future use. Must be >= 1.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if window < 2:
        raise ValueError(f"window must be >= 2, got {window}")
    if min_rise_count < 1:
        raise ValueError(f"min_rise_count must be >= 1, got {min_rise_count}")

    roll_min = ctx.klines["low"].rolling(window, min_periods=window).min()
    rising = roll_min > roll_min.shift(window)
    return rising.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
