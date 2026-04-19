"""Confirmation: liquidation squeeze setup — longs are over-crowded.

Detects when the market is loaded with long positions AND open interest is
still rising, creating a fragile state where a small price drop triggers
cascading long liquidations (or, from a contrarian view, a squeeze potential
when shorts try to push it down and fail).

Logic derived from 아카 Alpha Terminal L5 Liquidation Estimate:
  - funding_rate > threshold_fr → longs paying high funding (over-crowded)
  - oi_change_1h > threshold_oi → fresh long positions still being added

This is a confirmation block, not a reversal trigger: use in combination with
price-action blocks (e.g., recent_decline, reclaim_after_dump) to identify
when a bullish reversal will be amplified by short-squeeze dynamics.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def liq_zone_squeeze_setup(
    ctx: Context,
    *,
    threshold_fr: float = 0.0005,
    threshold_oi: float = 0.03,
) -> pd.Series:
    """Return a bool Series where funding_rate > threshold_fr AND
    oi_change_1h > threshold_oi (longs crowded, OI still rising).

    Args:
        ctx: Per-symbol Context.
        threshold_fr: Minimum funding_rate to qualify as long-crowded.
            Default 0.0005 (5 bps). 아카 L5 uses 0.05% = 0.0005. Must be > 0.
        threshold_oi: Minimum oi_change_1h fraction for fresh longs being
            added. Default 0.03 (3%). Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if threshold_fr <= 0:
        raise ValueError(f"threshold_fr must be > 0, got {threshold_fr}")
    if threshold_oi <= 0:
        raise ValueError(f"threshold_oi must be > 0, got {threshold_oi}")

    fr = ctx.features["funding_rate"]
    oi = ctx.features["oi_change_1h"]

    mask = (fr > threshold_fr) & (oi > threshold_oi)
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
