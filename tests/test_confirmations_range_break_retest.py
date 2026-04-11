"""Tests for building_blocks.confirmations.range_break_retest."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import range_break_retest


def test_break_then_retest(make_ctx):
    # OLD half (bars 0..9): trading 95-100, old_high=100
    # RECENT half (bars 10..19): breakout, recent_close_max=108
    # Current bar (20): back near 100
    old = [100.0, 99.0, 100.0, 98.0, 100.0, 97.0, 100.0, 99.5, 100.0, 99.0]
    recent = [101.0, 103.0, 105.0, 108.0, 106.0, 104.0, 102.0, 101.0, 102.0, 101.0]
    now = [100.2]
    close = old + recent + now
    # Overrides high to match close roughly
    high = [c * 1.005 for c in close]
    ctx = make_ctx(close=close, overrides={"high": high})
    mask = range_break_retest(ctx, range_bars=10, retest_tolerance=0.01)
    assert bool(mask.iloc[20]) is True


def test_no_break_means_no_match(make_ctx):
    # Flat throughout, no break
    close = [100.0] * 25
    ctx = make_ctx(close=close)
    mask = range_break_retest(ctx, range_bars=10, retest_tolerance=0.01)
    assert not mask.any()


def test_broke_but_not_retesting(make_ctx):
    # Break happened, current price still at the breakout level (far
    # from old_high)
    old = [100.0] * 10
    recent = [110.0] * 10
    now = [115.0]
    close = old + recent + now
    ctx = make_ctx(close=close)
    mask = range_break_retest(ctx, range_bars=10, retest_tolerance=0.005)
    # 115 is ~15% away from old_high (101); not retesting.
    assert bool(mask.iloc[20]) is False


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 30)
    with pytest.raises(ValueError):
        range_break_retest(ctx, range_bars=0)
    with pytest.raises(ValueError):
        range_break_retest(ctx, retest_tolerance=0.0)
