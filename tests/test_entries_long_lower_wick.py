"""Tests for building_blocks.entries.long_lower_wick."""
from __future__ import annotations

import pytest

from building_blocks.entries import long_lower_wick


def test_hammer_detected(make_ctx):
    # Build a hammer bar: open=100, close=101, low=95 (body=1, wick=5, ratio=5)
    ctx = make_ctx(
        close=[100.0, 101.0, 100.5],
        overrides={
            "open": [100.0, 100.0, 100.5],
            "high": [100.5, 101.5, 101.0],
            "low": [99.5, 95.0, 100.0],
        },
    )
    mask = long_lower_wick(ctx, body_ratio=2.0)
    assert bool(mask.iloc[1]) is True


def test_short_wick_does_not_match(make_ctx):
    ctx = make_ctx(
        close=[100.0, 105.0],
        overrides={
            "open": [100.0, 100.0],
            "high": [100.5, 105.5],
            "low": [99.5, 99.5],
        },
    )
    mask = long_lower_wick(ctx, body_ratio=2.0)
    assert bool(mask.iloc[1]) is False  # body=5, wick=0.5, ratio 0.1


def test_doji_with_wick_matches(make_ctx):
    # open == close → body = 0. Any positive lower wick should match.
    ctx = make_ctx(
        close=[100.0],
        overrides={
            "open": [100.0],
            "high": [100.1],
            "low": [99.0],
        },
    )
    mask = long_lower_wick(ctx, body_ratio=2.0)
    assert bool(mask.iloc[0]) is True


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        long_lower_wick(ctx, body_ratio=0.0)
    with pytest.raises(ValueError):
        long_lower_wick(ctx, body_ratio=-1.0)
