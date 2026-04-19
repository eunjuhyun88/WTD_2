"""Confirmation: order-book buy-side dollar volume significantly exceeds sell-side.

Rationale (Signal Radar v4.0 IMBALANCE 신호, 2026-04-19):
    Original JS: ``avgImbalance = recentImbalances.avg()`` where
    ``imbalance = bidVol / askVol``, ``bidVol = Σ bid[i].qty × bid[i].price``,
    ``askVol = Σ ask[i].qty × ask[i].price`` (top-15 levels from /depth?limit=20).
    Signal fires when ``avgImbalance >= 3.0 AND isPriceRising``.
    Translation: "Buy-side depth (dollar) is 3× sell-side — aggressive bids are
    stacking. Combined with rising price, this signals institutional demand."

This block requires ``ob_bid_usd`` and ``ob_ask_usd`` features in
``ctx.features``. These are NOT in the standard historical feature pipeline
(point-in-time OB depth is not available from Binance historical REST).

Live mode:
    A scanner job fetches ``/fapi/v1/depth?limit=20`` per symbol and populates
    ``ob_bid_usd`` / ``ob_ask_usd`` into ``ctx.features`` for the current bar.
    When present, this block fires normally.

Backtest / historical mode:
    ``ob_bid_usd``/``ob_ask_usd`` columns are absent — the block returns all
    False, which means it has no effect as a ``required_block`` (blocks the
    pattern) but is safe as a ``soft_block`` (simply contributes 0 score).
    Use as ``soft_block`` in ``radar-golden-entry-v1`` SIGNAL_ENTRY phase.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.context import Context


def orderbook_imbalance_ratio(
    ctx: Context,
    *,
    min_ratio: float = 3.0,
    smoothing: int = 3,
) -> pd.Series:
    """Return True where buy-side OB dollar volume >= min_ratio × sell-side.

    Args:
        ctx: Per-symbol Context. ``ctx.features`` should have columns
            ``ob_bid_usd`` and ``ob_ask_usd`` (top-N level dollar sums).
            If absent, returns all False (graceful fallback for backtest).
        min_ratio: Minimum bid$/ask$ ratio. Default 3.0
            (Signal Radar IMBALANCE signal: avgImbalance >= 3.0).
        smoothing: Rolling average window applied to the ratio before
            thresholding. Smooths single-bar noise in OB snapshots.
            Default 3 (Signal Radar: recentImbalances.avg() over ~3 snapshots).

    Returns:
        pd.Series[bool] aligned to ctx.features.index. True where buy-side
        depth dominates by at least min_ratio. All False when OB features
        are unavailable (historical backtest mode).

    Raises:
        ValueError: If min_ratio <= 0 or smoothing < 1.
    """
    if min_ratio <= 0:
        raise ValueError(f"min_ratio must be > 0, got {min_ratio}")
    if smoothing < 1:
        raise ValueError(f"smoothing must be >= 1, got {smoothing}")

    # Graceful fallback when OB depth features are not in the pipeline
    if "ob_bid_usd" not in ctx.features.columns or "ob_ask_usd" not in ctx.features.columns:
        return pd.Series(False, index=ctx.features.index, dtype=bool)

    bid = ctx.features["ob_bid_usd"].astype(float)
    ask = ctx.features["ob_ask_usd"].astype(float)

    # bid/ask ratio; protect against zero ask
    ratio = (bid / ask.replace(0, float("nan"))).fillna(1.0)

    if smoothing > 1:
        ratio = ratio.rolling(smoothing, min_periods=1).mean()

    return (ratio >= min_ratio).fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
