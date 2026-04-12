"""Trigger: this bar's open gapped ≥min_pct above the previous bar's close.

Crypto has fewer "real" gaps than equities (24/7 markets) but short
illiquid intervals or exchange halts can still produce them. This block
also works as a cheap "price jumped" detector at 1h resolution.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def gap_up(
    ctx: Context,
    *,
    min_pct: float = 0.05,
) -> pd.Series:
    """Return a bool Series where (open - prev_close) / prev_close ≥ min_pct.

    Args:
        ctx: Per-symbol Context.
        min_pct: Minimum fractional gap, e.g. 0.02 for a 2% gap. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if min_pct <= 0:
        raise ValueError(f"min_pct must be > 0, got {min_pct}")

    open_ = ctx.klines["open"]
    prev_close = ctx.klines["close"].shift(1)
    gap = (open_ / prev_close - 1.0) >= min_pct
    return gap.reindex(ctx.features.index, fill_value=False).astype(bool)
