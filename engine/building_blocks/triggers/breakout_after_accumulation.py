"""Trigger: breakout after a recent real-dump accumulation structure.

This trigger is intentionally more specific than
``breakout_from_pullback_range``. The TRADOOR/PTB production issue is
that a generic rolling-low breakout can fire on the *pre-dump* final
rally, while the pattern's actual target is the post-dump move:

1. a recent ``oi_spike_with_dump`` event,
2. OI still held after the spike,
3. recent accumulation structure (higher lows / reclaim / compression),
4. and only then a breakout above the local accumulation range.

The block stays stateless so it can run inside the current block
evaluator, but it approximates the intended phase-anchor by requiring
recent dump + accumulation evidence *before* the breakout bar.
"""
from __future__ import annotations

import pandas as pd

from building_blocks.confirmations.higher_lows_sequence import higher_lows_sequence
from building_blocks.confirmations.oi_hold_after_spike import oi_hold_after_spike
from building_blocks.confirmations.oi_spike_with_dump import oi_spike_with_dump
from building_blocks.confirmations.post_dump_compression import post_dump_compression
from building_blocks.confirmations.reclaim_after_dump import reclaim_after_dump
from building_blocks.context import Context


def _scale_window_by_timeframe(ctx: Context, base_bars: int) -> int:
    if len(ctx.features.index) < 2:
        return base_bars
    deltas = ctx.features.index.to_series().diff().dropna()
    if deltas.empty:
        return base_bars
    minutes = max(deltas.dt.total_seconds().median() / 60.0, 1.0)
    scaled = int(round(base_bars * (60.0 / minutes)))
    return max(2, scaled)


def breakout_after_accumulation(
    ctx: Context,
    *,
    dump_lookback_bars: int = 36,
    accumulation_lookback_bars: int = 16,
    range_bars: int = 12,
    max_range_pct: float = 0.18,
    min_accumulation_supports: int = 2,
) -> pd.Series:
    """Return True where a local range breakout follows recent dump accumulation.

    Args:
        dump_lookback_bars: How far back a real dump may have occurred.
        accumulation_lookback_bars: Window to look for post-dump hold/structure.
        range_bars: Past-only local range used for the breakout threshold.
        max_range_pct: Reject overly wide "ranges" before breakout.
        min_accumulation_supports: Minimum count among higher-lows, reclaim,
            and compression supports seen before breakout.
    """
    if dump_lookback_bars < 2:
        raise ValueError(f"dump_lookback_bars must be >= 2, got {dump_lookback_bars}")
    if accumulation_lookback_bars < 2:
        raise ValueError(
            f"accumulation_lookback_bars must be >= 2, got {accumulation_lookback_bars}"
        )
    if range_bars < 2:
        raise ValueError(f"range_bars must be >= 2, got {range_bars}")
    if max_range_pct <= 0:
        raise ValueError(f"max_range_pct must be > 0, got {max_range_pct}")
    if min_accumulation_supports < 1:
        raise ValueError(
            f"min_accumulation_supports must be >= 1, got {min_accumulation_supports}"
        )

    dump_window = _scale_window_by_timeframe(ctx, dump_lookback_bars)
    accumulation_window = _scale_window_by_timeframe(ctx, accumulation_lookback_bars)
    breakout_range_window = _scale_window_by_timeframe(ctx, range_bars)

    had_recent_dump = oi_spike_with_dump(ctx).shift(1).rolling(
        dump_window, min_periods=1
    ).max()
    had_recent_oi_hold = oi_hold_after_spike(ctx).shift(1).rolling(
        accumulation_window, min_periods=1
    ).max()
    had_recent_higher_lows = higher_lows_sequence(ctx).shift(1).rolling(
        accumulation_window, min_periods=1
    ).max()
    had_recent_reclaim = reclaim_after_dump(ctx).shift(1).rolling(
        accumulation_window, min_periods=1
    ).max()
    had_recent_compression = post_dump_compression(ctx).shift(1).rolling(
        accumulation_window, min_periods=1
    ).max()

    accumulation_support_score = (
        had_recent_higher_lows.fillna(False).astype(bool).astype(int)
        + had_recent_reclaim.fillna(False).astype(bool).astype(int)
        + had_recent_compression.fillna(False).astype(bool).astype(int)
    )
    has_accumulation_support = accumulation_support_score >= min_accumulation_supports

    high = ctx.klines["high"]
    low = ctx.klines["low"]
    close = ctx.klines["close"]

    past_high = high.shift(1).rolling(
        breakout_range_window, min_periods=breakout_range_window
    ).max()
    past_low = low.shift(1).rolling(
        breakout_range_window, min_periods=breakout_range_window
    ).min()
    past_range_pct = (past_high - past_low) / past_low.replace(0, pd.NA)
    range_is_reasonable = past_range_pct <= max_range_pct
    local_breakout = close > past_high

    mask = (
        had_recent_dump.astype(bool)
        & had_recent_oi_hold.astype(bool)
        & has_accumulation_support.astype(bool)
        & range_is_reasonable.fillna(False)
        & local_breakout.fillna(False)
    )
    return mask.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
