"""Sector momentum strong — True when symbol's sector has avg 24h gain > +20%.

Alpha Hunter S12/L12 Sector formula:
    8 sectors: AI, DeFi, Gaming, Meme, Layer1, Layer2, RWA, DePIN
    sector_avg > +20%: +5pts per symbol in that sector

Uses sector_score_norm feature (z-score within sector) and
sector_avg_pct feature (raw sector average pct change).
Returns all-False in historical mode when features are absent.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context

_SECTOR_STRONG_THRESHOLD_PCT = 20.0  # Alpha Hunter S12: sector_avg > +20%


def sector_momentum_strong(
    ctx: Context,
    *,
    threshold_pct: float = _SECTOR_STRONG_THRESHOLD_PCT,
) -> pd.Series:
    """True when the symbol's sector has avg 24h pct change > threshold_pct."""
    if "sector_avg_pct" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    return (ctx.features["sector_avg_pct"] >= threshold_pct).fillna(False)
