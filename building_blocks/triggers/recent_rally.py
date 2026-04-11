"""Trigger: close has rallied ≥pct over the past lookback_bars.

Use case: "find bars where the coin has already moved meaningfully
recently" — so we're catching continuation/reversal candidates rather
than flat ranges.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def recent_rally(
    ctx: Context,
    *,
    pct: float,
    lookback_bars: int,
) -> pd.Series:
    """Return a bool Series (indexed like ctx.features) where close has
    risen by ≥`pct` over the last `lookback_bars` bars.

    Past-only: compares close[t] to close[t-lookback_bars].

    Args:
        ctx: Per-symbol Context.
        pct: Minimum fractional rise, e.g. 0.05 for 5%. Must be > 0.
        lookback_bars: Number of past bars. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = rally met.
        Bars without enough history evaluate to False.
    """
    if pct <= 0:
        raise ValueError(f"pct must be > 0, got {pct}")
    if lookback_bars <= 0:
        raise ValueError(f"lookback_bars must be > 0, got {lookback_bars}")

    close = ctx.klines["close"]
    past = close.shift(lookback_bars)
    rally = (close / past - 1.0) >= pct
    return rally.reindex(ctx.features.index, fill_value=False).astype(bool)
