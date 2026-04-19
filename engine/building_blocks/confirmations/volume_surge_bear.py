"""Confirmation: recent volume is surging AND price direction is bearish.

Mirror of `volume_surge_bull`. Reads `vol_acceleration` from `ctx.features`
and confirms the surge is accompanied by a red candle (close < open).

Used in SHORT pattern phases to confirm genuine selling pressure rather than
high-volume doji indecision.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_surge_bear(
    ctx: Context,
    *,
    surge_factor: float = 1.8,
) -> pd.Series:
    """Return a bool Series where volume is surging AND the bar is bearish.

    Args:
        ctx: Per-symbol Context.
        surge_factor: vol_acceleration threshold. Default 1.8. Must be > 1.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if surge_factor <= 1:
        raise ValueError(f"surge_factor must be > 1, got {surge_factor}")

    vol_acc = ctx.features["vol_acceleration"]
    close = ctx.klines["close"]
    open_ = ctx.klines["open"]

    close_f = close.reindex(ctx.features.index)
    open_f = open_.reindex(ctx.features.index)

    high_vol = vol_acc >= surge_factor
    bearish = close_f < open_f

    mask = high_vol & bearish
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
