"""Confirmation: current close is near a Fibonacci retracement level.

Finds the rolling swing high and swing low over a lookback window and
checks whether the current close is within ±tolerance (fraction) of any
of the supplied fib levels measured from the move.

Because we don't know ahead of time whether the move was up→down or
down→up, this block over-matches by checking BOTH retracement directions
(fib_from_high and fib_from_low). The wizard composer can pair this with
a direction filter (e.g. trend alignment) to eliminate false sides.

Common levels: 0.382, 0.5, 0.618, 0.705 (OTE), 0.786, 0.886.
"""
from __future__ import annotations

from typing import Sequence

import pandas as pd

from building_blocks.context import Context


def fib_retracement(
    ctx: Context,
    *,
    levels: Sequence[float] = (0.618,),
    tolerance: float = 0.005,
    lookback: int = 60,
) -> pd.Series:
    """Return a bool Series where close is near any of the fib retracement
    levels of the rolling swing high/low over the past `lookback` bars.

    Args:
        ctx: Per-symbol Context.
        levels: Fib levels to check (0-1 exclusive). e.g. (0.618,) or
            (0.382, 0.5, 0.618, 0.786). Default: (0.618,).
        tolerance: Half-width of the price band around each fib price,
            as a fraction of the fib price. e.g. 0.005 = ±0.5%.
        lookback: Window (in bars) for swing high / low detection.
            Default: 60.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if not levels:
        raise ValueError("levels must not be empty")
    for lvl in levels:
        if not 0.0 < lvl < 1.0:
            raise ValueError(f"levels must be in (0, 1), got {lvl}")
    if tolerance <= 0:
        raise ValueError(f"tolerance must be > 0, got {tolerance}")
    if lookback <= 0:
        raise ValueError(f"lookback must be > 0, got {lookback}")

    close = ctx.klines["close"]
    high = ctx.klines["high"]
    low = ctx.klines["low"]

    # Swing pivots from the past `lookback` bars (past-only).
    swing_high = high.shift(1).rolling(lookback, min_periods=lookback).max()
    swing_low = low.shift(1).rolling(lookback, min_periods=lookback).min()
    move = swing_high - swing_low

    mask = pd.Series(False, index=close.index)
    for lvl in levels:
        fib_from_high = swing_high - move * lvl   # retrace DOWN from high
        fib_from_low = swing_low + move * lvl     # retrace UP from low
        near_from_high = (close - fib_from_high).abs() / fib_from_high <= tolerance
        near_from_low = (close - fib_from_low).abs() / fib_from_low <= tolerance
        mask = mask | near_from_high.fillna(False) | near_from_low.fillna(False)

    return mask.reindex(ctx.features.index, fill_value=False).astype(bool)
