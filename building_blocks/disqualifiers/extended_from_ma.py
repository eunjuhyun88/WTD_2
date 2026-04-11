"""Disqualifier: close is too far from a moving average.

Used to reject "stretched" setups where price has already extended well
beyond a reference EMA — mean-reversion risk is high and the trigger is
probably late.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def extended_from_ma(
    ctx: Context,
    *,
    ema_period: int = 50,
    max_pct: float = 0.10,
) -> pd.Series:
    """Return a bool Series where |close - EMA(period)| / EMA(period)
    exceeds `max_pct` (disqualify).

    Args:
        ctx: Per-symbol Context.
        ema_period: EMA span. Default 50.
        max_pct: Disqualify when fractional distance from EMA exceeds
            this. Default 0.10 = 10% from EMA.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = disqualify.
    """
    if ema_period <= 0:
        raise ValueError(f"ema_period must be > 0, got {ema_period}")
    if max_pct <= 0:
        raise ValueError(f"max_pct must be > 0, got {max_pct}")

    close = ctx.klines["close"]
    ema_val = close.ewm(span=ema_period, adjust=False).mean()
    distance = (close - ema_val).abs() / ema_val
    extended = distance > max_pct
    return extended.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
