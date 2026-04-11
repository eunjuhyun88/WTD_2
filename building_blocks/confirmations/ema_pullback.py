"""Confirmation: price pulled back to an EMA from above.

Two conditions must both hold:
  1. Current close is within ±tolerance of EMA(period)
  2. Previous bar's close was strictly above EMA(period)

The second condition rules out crossovers from below — we only flag
pullbacks where price was above the MA and has come back to touch it.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def ema_pullback(
    ctx: Context,
    *,
    ema_period: int = 50,
    tolerance: float = 0.01,
) -> pd.Series:
    """Return a bool Series where the current close is within ±tolerance
    of EMA(ema_period) AND the previous bar's close was above it.

    Args:
        ctx: Per-symbol Context.
        ema_period: EMA span. Default 50.
        tolerance: Half-width of the "near EMA" band as a fraction of the
            EMA value. e.g. 0.01 = within ±1%. Default 0.01.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if ema_period <= 0:
        raise ValueError(f"ema_period must be > 0, got {ema_period}")
    if tolerance <= 0:
        raise ValueError(f"tolerance must be > 0, got {tolerance}")

    close = ctx.klines["close"]
    ema_val = close.ewm(span=ema_period, adjust=False).mean()

    near_ema = (close - ema_val).abs() / ema_val <= tolerance
    prev_above = close.shift(1) > ema_val.shift(1)
    mask = near_ema & prev_above
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
