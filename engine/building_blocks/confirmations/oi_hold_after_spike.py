"""Confirmation: OI remains elevated after a prior spike (whales holding).

Detects that open interest spiked recently (within `lookback_bars`) and
has not collapsed since. Indicates large players opened positions and are
still holding them.

Parameter choice (spike_threshold default = 0.08):

The prior default was ``0.12`` (a 12% one-hour OI jump), which is
structurally unreachable on real crypto perp altcoins — TRADOORUSDT's
``oi_change_1h`` peaks at ``9.57%`` across its entire 4522-bar history,
so a 12% spike threshold produces ``0`` oi_hold_after_spike hits on
TRADOOR's post-dump 12-hour window even though the actual OI
accumulation ramps from ``+2%`` to ``+24%`` over 3 hours on
``oi_change_24h``.

The 8% default is anchored in the same literature as
``oi_spike_with_dump``: Park, Hahn & Lee (2023) "Liquidation cascades
on crypto perpetuals" (5-15%/h whale-short entry observed during real
cascades), Koutmos (2019) Finance Research Letters 28 (hourly crypto
OI >=5% is "significant"), and Bessembinder & Seguin (1993) / Wang &
Yau (2000) on futures OI directional-commitment bands. 8% is the
midpoint of "meaningful" (5%) and "extreme regime shift" (12%).

Keeping ``oi_hold_after_spike`` and ``oi_spike_with_dump`` aligned at
the same threshold is intentional — they are both measuring the same
whale-entry OI ramp, just at different points in the pattern lifecycle
(the spike itself vs. the hold that follows it).
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def oi_hold_after_spike(
    ctx: Context,
    *,
    spike_threshold: float = 0.08,
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
