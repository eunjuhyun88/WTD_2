"""Tests for building_blocks.entries.bullish_engulfing."""
from __future__ import annotations

from building_blocks.entries import bullish_engulfing


def test_engulfing_detected(make_ctx):
    # Bar 0: red (open=101, close=99). Bar 1: green (open=98, close=102)
    # Body engulfs: 98 <= 99 and 102 >= 101 ✓
    ctx = make_ctx(
        close=[99.0, 102.0],
        overrides={"open": [101.0, 98.0]},
    )
    mask = bullish_engulfing(ctx)
    assert bool(mask.iloc[1]) is True


def test_not_engulfing_when_bodies_misaligned(make_ctx):
    # Bar 0 red (101 → 99). Bar 1 green but open=99.5 (doesn't engulf lower)
    ctx = make_ctx(
        close=[99.0, 100.0],
        overrides={"open": [101.0, 99.5]},
    )
    mask = bullish_engulfing(ctx)
    # open[1]=99.5, close[0]=99, open[1] <= close[0]? 99.5 <= 99 False → no engulf
    assert bool(mask.iloc[1]) is False


def test_prev_green_means_no_bullish_engulfing(make_ctx):
    # Bar 0 green (open=99, close=101). Bar 1 green engulfing. NOT a bullish
    # engulfing because prev bar wasn't red.
    ctx = make_ctx(
        close=[101.0, 103.0],
        overrides={"open": [99.0, 98.0]},
    )
    mask = bullish_engulfing(ctx)
    assert bool(mask.iloc[1]) is False


def test_first_bar_no_match(make_ctx):
    ctx = make_ctx(close=[100.0], overrides={"open": [99.0]})
    mask = bullish_engulfing(ctx)
    assert bool(mask.iloc[0]) is False
