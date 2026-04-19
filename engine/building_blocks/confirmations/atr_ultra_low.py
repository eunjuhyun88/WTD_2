"""Confirmation: ATR (14-bar) is abnormally low relative to longer ATR (50-bar).

Reads `atr_ratio_short_long` from `ctx.features`, which is pre-computed as
atr14 / atr50. A ratio below `threshold` (default 0.60) means recent
volatility has compressed to less than 60% of the medium-term baseline —
the "coil before spring" state described in Minervini VCP and ATR L15 of the
아카 Alpha Terminal 15-layer system.

Complements `bollinger_squeeze`: BB squeeze detects band compression relative
to price; ATR ultra-low confirms that true-range magnitude has independently
dried up, reducing the chance of a false squeeze signal.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def atr_ultra_low(
    ctx: Context,
    *,
    threshold: float = 0.60,
    lookback: int = 3,
) -> pd.Series:
    """Return a bool Series where ATR ratio is below `threshold` for at least
    `lookback` consecutive bars.

    Args:
        ctx: Per-symbol Context.
        threshold: atr14/atr50 must be below this to qualify as ultra-low.
            Default 0.60 — matches 아카 L15 ULTRA_LOW criterion (<60% of
            medium-term ATR). Must be in (0, 1].
        lookback: Minimum consecutive bars the ratio must stay below
            threshold. Default 3 (avoid single-bar noise).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if not 0 < threshold <= 1:
        raise ValueError(f"threshold must be in (0, 1], got {threshold}")
    if lookback < 1:
        raise ValueError(f"lookback must be >= 1, got {lookback}")

    ratio = ctx.features["atr_ratio_short_long"]
    low = ratio < threshold
    # Require sustained: all of the past `lookback` bars (incl. current) must
    # have had ratio < threshold.
    sustained = low.rolling(lookback, min_periods=lookback).min().astype(bool)
    return sustained.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
