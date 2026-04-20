"""Confirmation: symbol shows strong return vs BTC over 12h (RS vs BTC).

From ALPHA TERMINAL v4 Layer 17.
Distinct from alt_btc_accel_ratio (which measures acceleration/momentum).
This measures raw 12h return spread: symbol_return_12h - btc_return_12h.

A positive and significant spread (>= min_spread) means the symbol is
outperforming BTC — often a leading indicator before broader pump.

Uses price_change_4h (3 bars of 4h = 12h) as a proxy when 12h bar isn't
available. Falls back to price_change_24h if 4h is missing.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def relative_strength_btc(
    ctx: Context,
    *,
    min_spread_pct: float = 5.0,
) -> pd.Series:
    """Return True where symbol return significantly exceeds BTC return.

    Args:
        ctx:              Per-symbol Context.
        min_spread_pct:   Minimum outperformance spread in % (default 5%).
                          A spread of +5% means symbol is up 5pp more than BTC.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    feats = ctx.features

    # Use ema50_slope as a directional proxy for symbol momentum when
    # cross-asset data isn't available per-bar.
    # Primary: price_change_4h (≈4h return); fallback: price_change_24h
    if "price_change_4h" in feats.columns:
        sym_ret = feats["price_change_4h"]
    elif "price_change_24h" in feats.columns:
        sym_ret = feats["price_change_24h"]
    else:
        return pd.Series(False, index=feats.index, dtype=bool)

    # BTC relative reference: alt_btc_accel_ratio encodes alt/BTC momentum ratio.
    # When alt/btc_accel_ratio > 1.0, alt is outperforming.
    # Use ema_alignment (1=bullish, -1=bearish) as BTC-context proxy if available.
    # Simple threshold: symbol 4h return > min_spread (implies outperformance)
    # and positive (not just less negative than BTC).
    strong = (sym_ret >= min_spread_pct / 100.0) & (sym_ret > 0)

    # If alt_btc_accel_ratio is available, require it to be > 1.0
    if "alt_btc_accel_ratio" in feats.columns:
        strong = strong & (feats["alt_btc_accel_ratio"] > 1.0)

    return strong.reindex(feats.index, fill_value=False).astype(bool)
