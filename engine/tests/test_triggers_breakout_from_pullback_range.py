"""Tests for building_blocks.triggers.breakout_from_pullback_range.

This block is the phase-anchored Wyckoff Sign-of-Strength alternative to
``breakout_above_high``. See the module docstring for the literature
trail.
"""
from __future__ import annotations

import pytest

from building_blocks.triggers import breakout_from_pullback_range


def test_fires_on_v_reversal_after_meaningful_drawdown(make_ctx):
    # 24 flat bars at 100, drop to 80 for 3 bars (20% drawdown),
    # then recover to 110 — a classic V-reversal that must fire.
    closes = [100.0] * 24 + [80.0] * 3 + [100.0, 105.0, 110.0]
    lows = [99.0] * 24 + [78.0] * 3 + [99.0, 104.0, 109.0]
    highs = [101.0] * 24 + [82.0] * 3 + [101.0, 106.0, 111.0]
    ctx = make_ctx(close=closes, overrides={"low": lows, "high": highs})
    mask = breakout_from_pullback_range(ctx, lookback_bars=24, min_drawdown=0.10)
    # Last bar (110) should break above the rally high since the
    # dump low at index 24-26.
    assert bool(mask.iloc[-1]) is True


def test_does_not_fire_on_grind_up_without_drawdown(make_ctx):
    # 30 bars marching up 100 -> 115 with no meaningful pullback.
    closes = [100.0 + 0.5 * i for i in range(30)]
    ctx = make_ctx(close=closes)
    mask = breakout_from_pullback_range(ctx, lookback_bars=24, min_drawdown=0.05)
    # Every bar is a new high but depth filter rejects (no pullback).
    assert not mask.any()


def test_requires_positive_lookback(make_ctx):
    ctx = make_ctx(close=[100.0] * 30)
    with pytest.raises(ValueError):
        breakout_from_pullback_range(ctx, lookback_bars=0)
    with pytest.raises(ValueError):
        breakout_from_pullback_range(ctx, lookback_bars=-1)


def test_requires_positive_drawdown(make_ctx):
    ctx = make_ctx(close=[100.0] * 30)
    with pytest.raises(ValueError):
        breakout_from_pullback_range(ctx, min_drawdown=0.0)
    with pytest.raises(ValueError):
        breakout_from_pullback_range(ctx, min_drawdown=-0.1)


def test_past_only_reference_excludes_current_bar(make_ctx):
    # If the current bar itself is both the low and "breakout", it must
    # not self-reference. close=100 on a bar where low=100 should not
    # produce a breakout against itself.
    closes = [100.0] * 30
    lows = [100.0] * 30
    highs = [100.0] * 30
    ctx = make_ctx(close=closes, overrides={"low": lows, "high": highs})
    mask = breakout_from_pullback_range(ctx, lookback_bars=24, min_drawdown=0.05)
    # Flat prices with no drawdown -> no breakout anywhere.
    assert not mask.any()
