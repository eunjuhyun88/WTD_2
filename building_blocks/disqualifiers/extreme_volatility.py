"""Disqualifier: ATR as a fraction of price is above a threshold.

Chaotic/high-volatility regimes produce many false signals. This block
returns True where ATR14 / close > threshold so the composer can reject
bars that sit in a high-ATR regime.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def extreme_volatility(
    ctx: Context,
    *,
    atr_pct_threshold: float = 0.05,
    atr_period: int = 14,
) -> pd.Series:
    """Return a bool Series where ATR / close exceeds the threshold.

    Args:
        ctx: Per-symbol Context.
        atr_pct_threshold: Disqualify when ATR/close > this fraction.
            Default 0.05 = 5% of price.
        atr_period: ATR computation period. Default 14.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = disqualify.
    """
    if atr_pct_threshold <= 0:
        raise ValueError(
            f"atr_pct_threshold must be > 0, got {atr_pct_threshold}"
        )
    if atr_period <= 0:
        raise ValueError(f"atr_period must be > 0, got {atr_period}")

    high = ctx.klines["high"]
    low = ctx.klines["low"]
    close = ctx.klines["close"]

    prev_close = close.shift(1)
    tr = pd.concat(
        [(high - low).abs(), (high - prev_close).abs(), (low - prev_close).abs()],
        axis=1,
    ).max(axis=1)
    atr = tr.ewm(alpha=1.0 / atr_period, adjust=False).mean()
    atr_pct = atr / close

    extreme = atr_pct > atr_pct_threshold
    return extreme.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
