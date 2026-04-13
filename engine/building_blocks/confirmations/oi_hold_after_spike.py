"""Confirmation: OI remains elevated after a prior spike (whales holding).

Detects that open interest spiked recently (within `lookback_bars`) and
has not collapsed since. Indicates large players opened positions and are
still holding them.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def oi_hold_after_spike(
    ctx: Context,
    *,
    spike_threshold: float = 0.12,
    lookback_bars: int = 24,
    decay_threshold: float = -0.05,
) -> pd.Series:
    """Return a bool Series where a recent OI spike is still being held.

    Conditions:
      - The rolling maximum of oi_change_1h over the past `lookback_bars`
        bars is >= spike_threshold (a spike occurred recently).
      - Current oi_change_24h >= decay_threshold (OI has not collapsed).

    Args:
        ctx: Per-symbol Context.
        spike_threshold: Minimum 1h OI change fraction to count as a spike.
            Must be > 0.
        lookback_bars: Rolling window to look for the prior spike. Must be >= 1.
        decay_threshold: Minimum 24h OI change allowed (negative = some
            decay tolerated). Must be < 0 or 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if spike_threshold <= 0:
        raise ValueError(f"spike_threshold must be > 0, got {spike_threshold}")
    if lookback_bars < 1:
        raise ValueError(f"lookback_bars must be >= 1, got {lookback_bars}")

    oi_1h = ctx.features["oi_change_1h"]
    had_spike = oi_1h.rolling(lookback_bars, min_periods=1).max() >= spike_threshold

    oi_24h = ctx.features["oi_change_24h"]
    oi_not_collapsed = oi_24h >= decay_threshold

    mask = had_spike & oi_not_collapsed
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
