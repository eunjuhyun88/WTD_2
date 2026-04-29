"""Whale tick buy — True when ≥1 single trade >= $50K buy is detected.

Signal Radar Whale Tick formula:
  whale_tick: trade.size * trade.price >= $50K AND NOT trade.isBuyerMaker
  (isBuyerMaker=False means the buyer was the aggressive taker = buy order)

Uses whale_tick_count feature (injected from live aggTrades snapshot).
Returns all-False in historical/offline mode when feature is absent.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def whale_tick_buy(ctx: Context, *, min_count: int = 1) -> pd.Series:
    """True on last bar when whale_tick_count >= min_count."""
    if "whale_tick_count" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    return (ctx.features["whale_tick_count"] >= min_count).fillna(False)
