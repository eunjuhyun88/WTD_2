"""Confirmation: Open Interest declining (position unwinding).

Rationale:
    When funding flips, traders unwind positions. A decline in OI (>5% drop
    over 24h) confirms the flip is real, not a transient blip. OI reduction
    = positions closing, which typically accelerates the move.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def oi_contraction_confirm(
    ctx: Context,
    *,
    lookback_bars: int = 24,  # 24h at 1h
    min_decline_pct: float = 0.05,  # 5% decline
) -> pd.Series:
    """Return a bool Series where OI is declining (>5% over 24h).

    True when OI has contracted significantly over the lookback window,
    indicating position unwinding and confirmingtrend reversal.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have column
            ``open_interest``.
        lookback_bars: Window for OI change calculation (default 24 = 24h).
        min_decline_pct: Minimum decline as fraction (default 0.05 = 5%).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where OI declined.
    """
    if lookback_bars < 2:
        raise ValueError(f"lookback_bars must be >= 2, got {lookback_bars}")
    if min_decline_pct <= 0 or min_decline_pct >= 1:
        raise ValueError(
            f"min_decline_pct must be in (0, 1), got {min_decline_pct}"
        )

    feature_col = f"oi_change_{lookback_bars}h"
    if feature_col in ctx.features.columns:
        contracting = ctx.features[feature_col].astype(float) <= -min_decline_pct
        return contracting.reindex(ctx.features.index, fill_value=False).astype(bool)

    if "open_interest" not in ctx.klines.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)

    oi = ctx.klines["open_interest"].astype(float)

    # Prior OI (lookback_bars ago)
    prior_oi = oi.shift(lookback_bars)

    # Current OI
    current_oi = oi

    # Decline as fraction
    oi_change = (current_oi - prior_oi) / prior_oi.replace(0, float("nan"))

    # True where OI declined >= min_decline_pct
    contracting = oi_change <= -min_decline_pct

    return contracting.reindex(ctx.features.index, fill_value=False).astype(bool)
