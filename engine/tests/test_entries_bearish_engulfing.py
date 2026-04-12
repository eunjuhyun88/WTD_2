"""Tests for building_blocks.entries.bearish_engulfing."""
from __future__ import annotations

from building_blocks.entries import bearish_engulfing


def test_engulfing_detected(make_ctx):
    # Bar 0: green (open=99, close=101). Bar 1: red (open=102, close=98)
    # open[1]=102 >= close[0]=101 ✓   close[1]=98 <= open[0]=99 ✓
    ctx = make_ctx(
        close=[101.0, 98.0],
        overrides={"open": [99.0, 102.0]},
    )
    mask = bearish_engulfing(ctx)
    assert bool(mask.iloc[1]) is True


def test_prev_red_no_bearish_engulfing(make_ctx):
    # Prev red, not green → bearish engulfing requires prev green
    ctx = make_ctx(
        close=[99.0, 97.0],
        overrides={"open": [101.0, 101.0]},
    )
    mask = bearish_engulfing(ctx)
    assert bool(mask.iloc[1]) is False


def test_body_not_engulfing(make_ctx):
    # Prev green, curr red, but body smaller
    ctx = make_ctx(
        close=[101.0, 100.0],
        overrides={"open": [99.0, 100.5]},
    )
    mask = bearish_engulfing(ctx)
    assert bool(mask.iloc[1]) is False
