"""MEXC volume lead — True when MEXC volume strongly exceeds Binance.

Alpha Hunter S15 formula:
  mexcRatio = mexcVol24h / binanceVol24h
  mexc_volume_lead fires when:
    mexcRatio > 5: pure volume lead (+15pts)
    mexcRatio > 2 AND mexcLead > 4%: price + volume lead (+15pts)

Uses mexc_vol_ratio and mexc_price_lead features (live, injected per-symbol).
Returns all-False in historical/offline mode when features absent.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context

_MEXC_STRONG_RATIO = 5.0   # Alpha Hunter S15 strong threshold
_MEXC_MOD_RATIO = 2.0      # moderate ratio threshold
_MEXC_PRICE_LEAD_PCT = 0.04  # 4% price lead threshold


def mexc_volume_lead(
    ctx: Context,
    *,
    strong_ratio: float = _MEXC_STRONG_RATIO,
    mod_ratio: float = _MEXC_MOD_RATIO,
    price_lead_pct: float = _MEXC_PRICE_LEAD_PCT,
) -> pd.Series:
    """True when MEXC shows strong volume or price+volume lead vs Binance."""
    if "mexc_vol_ratio" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)

    ratio = ctx.features["mexc_vol_ratio"]
    lead_pct = ctx.features.get("mexc_price_lead", pd.Series(0.0, index=ctx.features.index))

    strong_vol = ratio >= strong_ratio
    mod_vol_price = (ratio >= mod_ratio) & (lead_pct >= price_lead_pct)

    return (strong_vol | mod_vol_price).fillna(False)
