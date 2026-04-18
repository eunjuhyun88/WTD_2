"""Confirmation: taker buy ratio flips from below-neutral to above-neutral.

Rationale:
    Volume Absorption Reversal (VAR) ABSORPTION phase is confirmed when the
    aggregate order-flow direction switches from net-selling to net-buying.
    This is the CVD "delta flip": the rolling taker-buy ratio crosses above
    the neutral threshold (0.5) after spending the prior window below it.

    Market structure interpretation:
      - Sellers exhaust supply → taker-sell ratio falls.
      - Buyers begin to step in → taker-buy ratio rises above 0.5.
      - The transition (negative → positive delta) is the earliest sign that
        absorption is complete and markup may begin.

    Literature:
      - Easley, López de Prado & O'Hara (2021): order-flow imbalance is the
        highest-frequency leading indicator of short-term price moves.
      - Weis & Wyckoff (2013): "The buying wave after the selling climax is
        the first tangible evidence of demand entering the market."
      - ALPHA TERMINAL (2026-04-10): "CVD 방향 전환 = 세력 포지션 전환 신호"
        (CVD direction flip = smart money position change signal).

    Implementation:
      - `tbv_ratio[t]` = taker_buy_base_volume[t] / volume[t]  (per bar)
      - `neutral` = 0.5 (equal taker buy / sell)
      - True at bar t when:
          rolling_mean(tbv_ratio, flip_window)[t] > neutral_threshold  AND
          rolling_mean(tbv_ratio, flip_window)[t-1] <= neutral_threshold
        i.e. the window average just crossed above neutral this bar.

    Using a rolling mean (not per-bar) to smooth micro-noise from thin bars.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def delta_flip_positive(
    ctx: Context,
    *,
    flip_window: int = 3,
    neutral_threshold: float = 0.50,
) -> pd.Series:
    """Return a bool Series where the rolling taker-buy ratio crosses above neutral.

    True on bars where:
      - The `flip_window`-bar rolling mean of taker_buy_base_volume / volume
        is above `neutral_threshold` at bar t, AND
      - It was at or below `neutral_threshold` at bar t-1.

    This captures the exact transition bar where order-flow flips from
    net-selling to net-buying, the core evidence of completed absorption.

    Args:
        ctx: Per-symbol Context. ``ctx.klines`` must have columns
            ``taker_buy_base_volume`` and ``volume``.
        flip_window: Rolling window (bars) for averaging the taker-buy ratio.
            Must be >= 1. Default 3 (3-bar average reduces single-bar noise
            while staying responsive to the flip event).
        neutral_threshold: Taker-buy ratio threshold for "net-buying".
            Must be in (0, 1). Default 0.50.

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True only on the
        exact bar where the rolling ratio crosses above neutral (transition).
    """
    if flip_window < 1:
        raise ValueError(f"flip_window must be >= 1, got {flip_window}")
    if not 0.0 < neutral_threshold < 1.0:
        raise ValueError(
            f"neutral_threshold must be in (0, 1), got {neutral_threshold}"
        )

    tbv = ctx.klines["taker_buy_base_volume"].astype(float)
    vol = ctx.klines["volume"].astype(float)

    # Per-bar taker-buy ratio; treat zero-volume bars as neutral (0.5)
    per_bar_ratio = (tbv / vol.replace(0, float("nan"))).fillna(neutral_threshold)

    # Rolling mean over flip_window bars (current bar included, no shift)
    rolling_ratio = per_bar_ratio.rolling(flip_window, min_periods=flip_window).mean()

    above_now = rolling_ratio > neutral_threshold
    prev_ratio = rolling_ratio.shift(1)
    above_prev = prev_ratio > neutral_threshold
    # Require previous bar is known: the first bar in a window has no prior
    # history, so we cannot confirm a transition — suppress it.
    prev_known = prev_ratio.notna()

    # True only on the crossing bar (was not above, now is above, and we
    # have a prior bar to compare against)
    flip = above_now & ~above_prev & prev_known

    return flip.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
