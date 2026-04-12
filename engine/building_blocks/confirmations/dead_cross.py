"""Confirmation: EMA(fast) crossed below EMA(slow) on the current bar.

A "dead cross" is the moment the fast EMA transitions from >= slow to
< slow. This block flags only the bar at which the crossover happens,
not the subsequent bars where fast remains below slow.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def dead_cross(
    ctx: Context,
    *,
    fast: int = 50,
    slow: int = 200,
) -> pd.Series:
    """Return a bool Series where EMA(fast) < EMA(slow) on this bar AND
    was >= EMA(slow) on the previous bar.

    Args:
        ctx: Per-symbol Context.
        fast: Span of the fast EMA. Must be > 0.
        slow: Span of the slow EMA. Must be > fast.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True only on the
        single bar where the crossover happens.
    """
    if fast <= 0:
        raise ValueError(f"fast must be > 0, got {fast}")
    if slow <= fast:
        raise ValueError(f"slow must be > fast ({fast}), got {slow}")

    close = ctx.klines["close"]
    ema_fast = close.ewm(span=fast, adjust=False).mean()
    ema_slow = close.ewm(span=slow, adjust=False).mean()

    now_below = ema_fast < ema_slow
    prev_at_or_above = ema_fast.shift(1) >= ema_slow.shift(1)
    cross = now_below & prev_at_or_above
    return cross.reindex(ctx.features.index, fill_value=False).astype(bool)
