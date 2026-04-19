"""Disqualifier: Coinbase Premium Index is weak (negative or near-zero).

Rationale:
    A persistently negative or flat Coinbase premium indicates US/institutional
    buyers are NOT paying above-market prices on Binance spot — retail-driven
    or leveraged price action without genuine institutional demand. Long entries
    in this environment carry higher fade risk.

Detection:
    Reads ``coinbase_premium`` from ``ctx.features`` (set by
    ``data_cache.fetch_coinbase``). If the column is absent (e.g., test
    environments or non-BTC symbols without CPI data), returns all-False
    (graceful fallback — do NOT disqualify when data is unavailable).

    Disqualify when ``coinbase_premium`` stays below ``max_premium`` for
    at least ``min_bars`` consecutive bars.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def coinbase_premium_weak(
    ctx: Context,
    *,
    max_premium: float = 0.0,
    min_bars: int = 2,
) -> pd.Series:
    """Return True where the Coinbase Premium Index is weak (≤ max_premium).

    Args:
        ctx: Per-symbol Context.
        max_premium: Threshold below which the premium is considered weak.
            Default 0.0 (negative premium). Use a small positive value
            (e.g. 0.0002) for a tighter gate.
        min_bars: Minimum consecutive bars the premium must be weak.
            Default 2 (avoids disqualifying on a single anomalous bar).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = disqualify.
        Returns all-False when ``coinbase_premium`` is not in ctx.features.
    """
    if min_bars < 1:
        raise ValueError(f"min_bars must be >= 1, got {min_bars}")

    # Graceful fallback: data not available for this symbol
    if "coinbase_premium" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)

    premium = ctx.features["coinbase_premium"].fillna(0.0)
    weak = premium <= max_premium

    if min_bars <= 1:
        sustained = weak
    else:
        sustained = (
            weak.rolling(min_bars, min_periods=min_bars).sum() >= min_bars
        ).astype(bool)

    return sustained.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
