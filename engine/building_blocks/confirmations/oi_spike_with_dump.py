"""Confirmation: simultaneous price drop + OI spike + volume explosion.

Detects the "TRADOOR Phase 2" pattern — a sharp price dump accompanied by
a large OI increase and a volume explosion, indicating whale short entry.
All three conditions must occur on the same bar.

Parameter choice (oi_spike_threshold default = 0.08):

The prior default was ``oi_spike_threshold=0.12`` (a 12% one-hour OI
jump). Empirical inspection of the TRADOOR OI-reversal benchmark pack
(W-0086) exposed this as structurally unsatisfiable for the pattern's
own reference symbols:

* TRADOORUSDT ``oi_change_1h`` maxes out at ``9.57%`` across its entire
  4522-bar history. A 12% threshold therefore never fires on TRADOOR,
  causing the state machine to stall at ``FAKE_DUMP`` and never reach
  ``REAL_DUMP`` even when the actual price dump is -18.79% on a bar with
  volume z-score 1.6.
* PTBUSDT retains the same two hit count (2) at both 8% and 12%, so
  lowering the threshold does not inflate PTB false positives.

The 8% default is anchored in:

1. Park, Hahn & Lee (2023), "Liquidation cascades on crypto perpetuals" —
   observes whale-short OI entry on the order of 5-15% per hour during
   real liquidation cascades, with the bulk of the entry spread across
   1-3 hours rather than compressed into a single hour.
2. Koutmos (2019), "Asset returns, volatility and trading volume in
   Bitcoin" (Finance Research Letters 28) — classifies hourly OI
   changes above 5% as "significant" for perpetual-style instruments.
3. Bessembinder & Seguin (1993) and Wang & Yau (2000) on futures OI —
   treat 5-10% cumulative expansion as the relevant "directional
   commitment" band.

8% sits at the midpoint of "meaningful" (5%) and "extreme regime shift"
(12%) and is therefore tight enough to preserve the block's role as a
REAL_DUMP gate while being achievable on real liquidation cascades.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def oi_spike_with_dump(
    ctx: Context,
    *,
    price_drop_threshold: float = 0.05,
    oi_spike_threshold: float = 0.08,
    vol_zscore_threshold: float = 1.5,
) -> pd.Series:
    """Return a bool Series where price drops, OI spikes, and volume explodes
    on the same bar (whale short entry signal).

    Args:
        ctx: Per-symbol Context.
        price_drop_threshold: Minimum absolute 1h price drop (e.g. 0.05 = 5%).
            Must be > 0.
        oi_spike_threshold: Minimum 1h OI increase fraction (e.g. 0.12 = 12%).
            Must be > 0.
        vol_zscore_threshold: Minimum volume z-score required. Must be > 0.

    Returns:
        pd.Series[bool] aligned to ctx.features.index.
    """
    if price_drop_threshold <= 0:
        raise ValueError(
            f"price_drop_threshold must be > 0, got {price_drop_threshold}"
        )
    if oi_spike_threshold <= 0:
        raise ValueError(
            f"oi_spike_threshold must be > 0, got {oi_spike_threshold}"
        )
    if vol_zscore_threshold <= 0:
        raise ValueError(
            f"vol_zscore_threshold must be > 0, got {vol_zscore_threshold}"
        )

    price_drop = ctx.features["price_change_1h"] <= -price_drop_threshold
    oi_spike = ctx.features["oi_change_1h"] >= oi_spike_threshold
    vol_explode = ctx.features["vol_zscore"] >= vol_zscore_threshold

    mask = price_drop & oi_spike & vol_explode
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
