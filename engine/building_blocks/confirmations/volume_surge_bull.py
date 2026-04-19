"""Confirmation: recent volume is surging AND price direction is bullish.

Reads `vol_acceleration` from `ctx.features` (= vol_ratio_3 / vol_ratio_24,
i.e. how the 3-bar average volume compares to the 24-bar average). When this
ratio exceeds `surge_factor` AND the current bar is green (close >= open),
it signals genuine bullish demand — the "SURGE + direction" composite used in
아카 Alpha Terminal L3 V-Surge.

Distinct from `volume_spike`: volume_spike is single-bar; volume_surge_bull
requires directional price confirmation so it is not triggered by panic dumps.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_surge_bull(
    ctx: Context,
    *,
    surge_factor: float = 1.8,
) -> pd.Series:
    """Return a bool Series where volume is surging AND the bar is bullish.

    Args:
        ctx: Per-symbol Context.
        surge_factor: vol_acceleration threshold. Default 1.8 (recent 3-bar
            avg volume is 1.8× the 24-bar avg) — matches 아카 L3 SURGE tier.
            Must be > 1.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if surge_factor <= 1:
        raise ValueError(f"surge_factor must be > 1, got {surge_factor}")

    vol_acc = ctx.features["vol_acceleration"]
    close = ctx.klines["close"]
    open_ = ctx.klines["open"]

    # Align klines to features index (features starts after warmup bars)
    close_f = close.reindex(ctx.features.index)
    open_f = open_.reindex(ctx.features.index)

    high_vol = vol_acc >= surge_factor
    bullish = close_f >= open_f

    mask = high_vol & bullish
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
