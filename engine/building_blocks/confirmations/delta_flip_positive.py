"""Confirmation: CVD delta flips from net-selling to net-buying.

Detects the "absorption → markup" handoff where taker-buy aggression
returns above a positive threshold after being below a neutral baseline
in the immediately preceding window. Used in Phase 3 of the Volume
Absorption Reversal (VAR) pattern:

    SELLING_CLIMAX → ABSORPTION → DELTA_FLIP (this block) → MARKUP

Distinct from ``cvd_state_eq(state='buying')``:
  - ``cvd_state_eq`` fires on any bar that is currently net-buying.
  - ``delta_flip_positive`` fires only on the transition bar: the
    previous ``window`` bars had a taker-buy ratio below
    ``flip_from_below``, and the current ``window`` bars are at or above
    ``flip_to_at_least``. That transition carries more information than
    absolute state.

References:
  - Easley, López de Prado & O'Hara (2012), "The Volume Clock: Insights
    into the High Frequency Paradigm" — establishes order-flow imbalance
    shifts as leading indicators of short-horizon reversals.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def delta_flip_positive(
    ctx: Context,
    *,
    window: int = 6,
    flip_from_below: float = 0.50,
    flip_to_at_least: float = 0.55,
) -> pd.Series:
    """Return a bool Series where the rolling taker-buy ratio just flipped
    from below ``flip_from_below`` to at or above ``flip_to_at_least``.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``taker_buy_base_volume`` and ``volume``.
        window: Rolling window (bars) used for both the "prior" and
            "current" taker-buy ratios. Must be >= 2. Default 6.
        flip_from_below: The prior window ratio must be strictly less
            than this. Range (0, 1). Default 0.50 (neutral).
        flip_to_at_least: The current window ratio must be at or above
            this. Range (0, 1), and must be >= ``flip_from_below``.
            Default 0.55.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True on the bar
        where the flip is first observable given the rolling windows.
    """
    if window < 2:
        raise ValueError(f"window must be >= 2, got {window}")
    if not 0.0 < flip_from_below < 1.0:
        raise ValueError(
            f"flip_from_below must be in (0, 1), got {flip_from_below}"
        )
    if not 0.0 < flip_to_at_least < 1.0:
        raise ValueError(
            f"flip_to_at_least must be in (0, 1), got {flip_to_at_least}"
        )
    if flip_to_at_least < flip_from_below:
        raise ValueError(
            f"flip_to_at_least ({flip_to_at_least}) must be >= "
            f"flip_from_below ({flip_from_below})"
        )

    tbv = ctx.klines["taker_buy_base_volume"].astype(float)
    vol = ctx.klines["volume"].astype(float)

    # Rolling taker-buy ratio over `window` bars. Zero-volume windows are
    # neutral (0.5).
    rolling_tbv = tbv.rolling(window, min_periods=window).sum()
    rolling_vol = vol.rolling(window, min_periods=window).sum()
    current_ratio = (rolling_tbv / rolling_vol.replace(0, float("nan"))).fillna(0.5)

    # Prior window = same rolling ratio shifted back by `window` bars so
    # the two windows do not overlap.
    prior_ratio = current_ratio.shift(window)

    flipped = (prior_ratio < flip_from_below) & (current_ratio >= flip_to_at_least)
    return flipped.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
