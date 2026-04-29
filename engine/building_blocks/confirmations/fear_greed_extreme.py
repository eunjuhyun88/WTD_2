"""Fear & Greed extreme — fires when market sentiment is at extreme fear.

Formula (Alpha Terminal L7):
  fear_greed_norm = (50 - fg) / 50   [+1 = extreme fear, -1 = extreme greed]
  extreme fear: fg <= 15  (norm >= 0.70)
  fear zone:    fg <= 30  (norm >= 0.40)

Fires True when fg <= 30 (fear zone), meaning contrarian long setup exists.
Uses neutral default (0.0) when macro bundle is unavailable.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def fear_greed_extreme(ctx: Context) -> pd.Series:
    """True when Fear & Greed index is in fear zone (fg <= 30, norm >= 0.40)."""
    if "fear_greed_norm" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    norm = ctx.features["fear_greed_norm"]
    # norm >= 0.40 corresponds to fg <= 30 (fear zone)
    return (norm >= 0.40).fillna(False)
