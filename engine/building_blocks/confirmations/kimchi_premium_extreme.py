"""Kimchi premium extreme — fires when KRW premium is deeply negative (contrarian long).

Formula (Alpha Terminal L8):
  kimchi_pct = (upbit_krw / (binance_usd × usd_krw) - 1) × 100
  negative premium < -4%: contrarian bullish (+8pts)
  negative premium < -2%: weak bullish (+4pts)

Note: kimchi_premium is a live/real-time feature (Upbit API, 5-min TTL).
In historical backtests, kimchi_premium column is absent → returns all-False.
Register runtime_only=True to skip in offline scans.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context

runtime_only = True  # no historical kimchi data available


def kimchi_premium_extreme(ctx: Context) -> pd.Series:
    """True when kimchi premium is deeply negative (< -4%), contrarian bullish."""
    if "kimchi_premium" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    pct = ctx.features["kimchi_premium"]
    return (pct < -4.0).fillna(False)
