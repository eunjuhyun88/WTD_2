"""Trigger: this bar's open gapped ≥min_pct below the previous bar's close.

Mirror of `gap_up` for the short side. Crypto has fewer "real" gaps than
equities (24/7 markets) but exchange halts / illiquid intervals can still
produce them. Also works as a cheap "price crashed" detector at 1h res.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def gap_down(
    ctx: Context,
    *,
    min_pct: float = 0.05,
) -> pd.Series:
    """Return a bool Series where (prev_close - open) / prev_close ≥ min_pct.

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
    gap = (prev_close / open_ - 1.0) >= min_pct
    return gap.reindex(ctx.features.index, fill_value=False).astype(bool)
