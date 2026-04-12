"""Confirmation: recent 3 bars' average volume is ≤ threshold × baseline.

Typically used to confirm a compression/consolidation: "the recent
handful of bars have gone quiet compared to the prior baseline window,
suggesting sellers have exhausted and an expansion is nearby."
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def volume_dryup(
    ctx: Context,
    *,
    vs_window: int = 24,
    threshold: float = 0.5,
    recent_bars: int = 3,
) -> pd.Series:
    """Return a bool Series where the mean volume of the last `recent_bars`
    bars is ≤ `threshold` times the mean volume of the `vs_window` bars
    BEFORE them.

    Args:
        ctx: Per-symbol Context.
        vs_window: Baseline window length in bars. Default 24.
        threshold: Fraction of baseline that the recent average must be
            at or below. Default 0.5 (half the baseline).
        recent_bars: How many recent bars (including current) to average
            as the "dryup" measurement. Default 3.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if vs_window <= 0:
        raise ValueError(f"vs_window must be > 0, got {vs_window}")
    if threshold <= 0:
        raise ValueError(f"threshold must be > 0, got {threshold}")
    if recent_bars <= 0:
        raise ValueError(f"recent_bars must be > 0, got {recent_bars}")

    vol = ctx.klines["volume"]
    recent_mean = vol.rolling(recent_bars, min_periods=recent_bars).mean()
    # Baseline is the `vs_window` bars strictly BEFORE the recent window.
    baseline = vol.shift(recent_bars).rolling(vs_window, min_periods=vs_window).mean()
    dryup = recent_mean <= threshold * baseline
    return dryup.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
