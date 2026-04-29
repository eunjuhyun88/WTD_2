"""CVD surge long — True when last-bar CVD is strongly net positive.

Signal Radar CVD formula:
  if trade.m (buyer is maker): cvd -= notional  # sell
  else: cvd += notional                         # buy
  Fire when cvd_usd >= $20K (net buy pressure in recent trades window)

Uses cvd_1m_usd feature (injected from live aggTrades snapshot into last bar).
Returns all-False in historical/offline mode when feature is absent.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context

_CVD_TRIGGER_USD = 20_000.0


def cvd_surge_long(ctx: Context, *, threshold_usd: float = _CVD_TRIGGER_USD) -> pd.Series:
    """True on last bar when net buy CVD exceeds threshold_usd."""
    if "cvd_1m_usd" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    return (ctx.features["cvd_1m_usd"] >= threshold_usd).fillna(False)
