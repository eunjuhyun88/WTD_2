"""Confirmation: Intraday gap up detected (gap from prior close to current open).

Rationale:
    A large gap up at market open (opening well above prior close) creates
    a liquidity void. If the gap persists but then rejects, it becomes a
    short setup: sellers return to fill the gap and return price to fair value.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def intraday_gap_up(
    ctx: Context,
    *,
    min_gap_pct: float = 0.02,  # 2% gap
) -> pd.Series:
    """Return a bool Series where price gapped up from prior close.

    True when current bar's open is >= min_gap_pct higher than prior close,
    indicating a significant overnight or gap-up move.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``open`` and ``close`` (prior).
        min_gap_pct: Minimum gap as fraction of prior close (default 0.02 = 2%).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where gap up
        is detected.
    """
    if min_gap_pct <= 0 or min_gap_pct >= 1:
        raise ValueError(
            f"min_gap_pct must be in (0, 1), got {min_gap_pct}"
        )

    open_ = ctx.klines["open"].astype(float)
    close = ctx.klines["close"].astype(float)

    # Prior close
    prior_close = close.shift(1)

    # Gap as fraction
    gap_pct = (open_ - prior_close) / prior_close.replace(0, float("nan"))

    # True where gap is >= min_gap_pct
    gap_up = gap_pct >= min_gap_pct

    return gap_up.reindex(ctx.features.index, fill_value=False).astype(bool)
