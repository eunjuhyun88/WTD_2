"""Confirmation: simultaneous price drop + OI spike + volume explosion.

Detects the "TRADOOR Phase 2" pattern — a sharp price dump accompanied by
a large OI increase and a volume explosion, indicating whale short entry.
All three conditions must occur on the same bar.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def oi_spike_with_dump(
    ctx: Context,
    *,
    price_drop_threshold: float = 0.05,
    oi_spike_threshold: float = 0.12,
    vol_zscore_threshold: float = 1.5,
) -> pd.Series:
    """Return a bool Series where price drops, OI spikes, and volume explodes
    on the same bar (whale short entry signal).

    Args:
        ctx: Per-symbol Context.
        price_drop_threshold: Minimum absolute 1h price drop (e.g. 0.05 = 5%).
            Must be > 0.
        oi_spike_threshold: Minimum 1h OI increase fraction (e.g. 0.12 = 12%).
            Must be > 0.
        vol_zscore_threshold: Minimum volume z-score required. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if price_drop_threshold <= 0:
        raise ValueError(
            f"price_drop_threshold must be > 0, got {price_drop_threshold}"
        )
    if oi_spike_threshold <= 0:
        raise ValueError(
            f"oi_spike_threshold must be > 0, got {oi_spike_threshold}"
        )
    if vol_zscore_threshold <= 0:
        raise ValueError(
            f"vol_zscore_threshold must be > 0, got {vol_zscore_threshold}"
        )

    price_drop = ctx.features["price_change_1h"] <= -price_drop_threshold
    oi_spike = ctx.features["oi_change_1h"] >= oi_spike_threshold
    vol_explode = ctx.features["vol_zscore"] >= vol_zscore_threshold

    mask = price_drop & oi_spike & vol_explode
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
