"""Confirmation: price breaks above 12-bar VWAP (se力 average cost basis).

From ALPHA TERMINAL v4 Layer 16.
vwap_ratio > 1.0 means price is above the volume-weighted average — buying
above average institutional cost. The 12-bar window (12h at 1h TF) tracks
the session average rather than daily.

Uses the pre-computed `vwap_ratio` feature from feature_calc.py, which is
the 24-bar VWAP ratio. vwap_ratio > 1 → price above VWAP → bullish structure.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def vwap_break(
    ctx: Context,
    *,
    min_ratio: float = 1.0,
    min_bars: int = 1,
) -> pd.Series:
    """Return True where price is above VWAP (bullish structure).

    Args:
        ctx:       Per-symbol Context.
        min_ratio: Minimum vwap_ratio to qualify (default 1.0 = above VWAP).
        min_bars:  Consecutive bars the condition must hold.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    feats = ctx.features
    if "vwap_ratio" not in feats.columns:
        return pd.Series(False, index=feats.index, dtype=bool)

    above = feats["vwap_ratio"] > min_ratio
    if min_bars > 1:
        above = above.rolling(min_bars, min_periods=min_bars).min().fillna(0).astype(bool)

    return above.reindex(feats.index, fill_value=False).astype(bool)
