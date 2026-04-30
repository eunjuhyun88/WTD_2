"""MTF bullish alignment — True when EMA alignment is bullish across 2+ timeframes.

Alpha Terminal L10 MTF formula:
    timeframes = ['1H', '4H', '1D']
    for each TF: bullish = (ema20 > ema50 > ema200)
    mtf_confluence_score = bull_count - bear_count  (-3 to +3)
    score >= 2: bullish alignment (Alpha Terminal: +10 to +18 pts)

Uses mtf_confluence_score feature (computed from resampled klines).
Returns all-False when feature absent (historical mode without resampling).
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def mtf_bullish_alignment(ctx: Context, *, min_score: int = 2) -> pd.Series:
    """True when mtf_confluence_score >= min_score (≥2 TFs in bull EMA stack)."""
    if "mtf_confluence_score" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    return (ctx.features["mtf_confluence_score"] >= min_score).fillna(False)


def mtf_bearish_alignment(ctx: Context, *, max_score: int = -2) -> pd.Series:
    """True when mtf_confluence_score <= max_score (≥2 TFs in bear EMA stack)."""
    if "mtf_confluence_score" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)
    return (ctx.features["mtf_confluence_score"] <= max_score).fillna(False)
