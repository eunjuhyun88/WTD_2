"""Shared numerical primitives used by multiple building blocks.

Thin copies of the helpers in scanner.feature_calc (which keeps them
private to Phase A.2). Duplication is deliberate: blocks must not reach
into feature_calc internals, and these formulas are stable (EMA, RSI,
Bollinger). If we later extract one shared module, it's a drop-in.

Only add a primitive here once ≥2 blocks use it. Otherwise inline.
"""
from __future__ import annotations

import numpy as np
import pandas as pd


def rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """Wilder-style RSI. Returns 0..100. NaN filled to 50 (neutral)."""
    delta = series.diff()
    gain = delta.clip(lower=0.0)
    loss = -delta.clip(upper=0.0)
    avg_gain = gain.ewm(alpha=1.0 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0.0, np.nan)
    r = 100.0 - (100.0 / (1.0 + rs))
    return r.fillna(50.0)
