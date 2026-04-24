"""Trigger: close breaks the local range high after accumulation.

This block is intentionally simple. It does not try to infer the whole
TRADOOR/PTB phase path from raw candles. The state machine supplies the
anchor by using this block only while attempting to advance from
ACCUMULATION to BREAKOUT.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def post_accumulation_range_breakout(
    ctx: Context,
    *,
    range_bars: int = 16,
    min_range_bars: int = 6,
    min_break_pct: float = 0.003,
    max_range_pct: float = 0.22,
) -> pd.Series:
    """Return true when close breaks above the prior local range high.

    The reference high is the high of the preceding range window, not the high
    since a rolling-low reset. That keeps the trigger local to the accumulation
    zone selected by the state machine.
    """
    if range_bars <= 0:
        raise ValueError(f"range_bars must be > 0, got {range_bars}")
    if min_range_bars <= 0:
        raise ValueError(f"min_range_bars must be > 0, got {min_range_bars}")
    if min_range_bars > range_bars:
        raise ValueError(
            f"min_range_bars must be <= range_bars, got {min_range_bars}>{range_bars}"
        )
    if min_break_pct < 0:
        raise ValueError(f"min_break_pct must be >= 0, got {min_break_pct}")
    if max_range_pct <= 0:
        raise ValueError(f"max_range_pct must be > 0, got {max_range_pct}")

    high = ctx.klines["high"]
    low = ctx.klines["low"]
    close = ctx.klines["close"]

    prior_high = high.shift(1).rolling(range_bars, min_periods=min_range_bars).max()
    prior_low = low.shift(1).rolling(range_bars, min_periods=min_range_bars).min()
    range_width = (prior_high - prior_low) / prior_low.replace(0, pd.NA)

    breakout = (close > prior_high * (1.0 + min_break_pct)) & (range_width <= max_range_pct)
    return breakout.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
