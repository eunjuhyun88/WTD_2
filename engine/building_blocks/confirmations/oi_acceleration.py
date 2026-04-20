"""Confirmation: OI acceleration — classifies OI × price action into 4 quadrants.

From ALPHA TERMINAL v4 Layer 19.
Distinct from oi_change (directional) and oi_expansion_confirm (magnitude).
This block identifies the causal direction of OI movement:

  Quadrant mapping (OI delta × price change):
    LONG_BUILD:     OI↑ + price↑  → buyers adding longs (most bullish)
    SHORT_SQUEEZE:  OI↓ + price↑  → shorts covering (bullish, momentum)
    SHORT_BUILD:    OI↑ + price↓  → sellers adding shorts (bearish)
    LONG_PANIC:     OI↓ + price↓  → longs exiting (bearish)

This block fires True for LONG_BUILD and SHORT_SQUEEZE (both bullish outcomes).
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context

# Minimum absolute OI change to count as meaningful movement (% of current OI)
_MIN_OI_DELTA = 0.005  # 0.5%


def oi_acceleration(
    ctx: Context,
    *,
    include_short_squeeze: bool = True,
) -> pd.Series:
    """Return True where OI acceleration indicates bullish accumulation.

    Fires when:
      - OI is rising AND price is rising (LONG_BUILD), OR
      - OI is falling AND price is rising (SHORT_SQUEEZE, if enabled)

    Args:
        ctx:                    Per-symbol Context.
        include_short_squeeze:  Also fire on short-squeeze quadrant (default True).

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    feats = ctx.features

    if "oi_change_1h" not in feats.columns or "price_change_1h" not in feats.columns:
        return pd.Series(False, index=feats.index, dtype=bool)

    oi_delta = feats["oi_change_1h"]
    price_delta = feats["price_change_1h"]

    # Non-trivial OI movement threshold
    meaningful_oi = oi_delta.abs() >= _MIN_OI_DELTA

    long_build = meaningful_oi & (oi_delta > 0) & (price_delta > 0)

    if include_short_squeeze:
        short_squeeze = meaningful_oi & (oi_delta < 0) & (price_delta > 0)
        result = long_build | short_squeeze
    else:
        result = long_build

    return result.reindex(feats.index, fill_value=False).astype(bool)
