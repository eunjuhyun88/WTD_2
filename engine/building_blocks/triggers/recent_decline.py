"""Trigger: close has declined ≥pct over the past lookback_bars.

Use case: "find bars where the coin has already dropped meaningfully
recently" — catching reversal/continuation-short candidates. Mirror of
`recent_rally` for the short side.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def recent_decline(
    ctx: Context,
    *,
    pct: float = 0.10,
    lookback_bars: int = 72,
) -> pd.Series:
    """Return a bool Series where close has fallen by ≥`pct` over the
    last `lookback_bars` bars.

    Past-only: compares close[t] to close[t-lookback_bars].

    Args:
        ctx: Per-symbol Context.
        pct: Minimum fractional drop, e.g. 0.10 for 10%. Must be > 0.
            The comparison is (past - close) / past >= pct, so pass the
            drop as a positive number.
        lookback_bars: Number of past bars. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True = decline met.
        Bars without enough history evaluate to False.
    """
    if pct <= 0:
        raise ValueError(f"pct must be > 0, got {pct}")
    if lookback_bars <= 0:
        raise ValueError(f"lookback_bars must be > 0, got {lookback_bars}")

    close = ctx.klines["close"]
    past = close.shift(lookback_bars)
    decline = (past / close - 1.0) >= pct
    return decline.reindex(ctx.features.index, fill_value=False).astype(bool)
