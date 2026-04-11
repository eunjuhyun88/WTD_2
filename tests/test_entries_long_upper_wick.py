"""Tests for building_blocks.entries.long_upper_wick."""
from __future__ import annotations

import pytest

from building_blocks.entries import long_upper_wick


def test_shooting_star_detected(make_ctx):
    # open=100, close=99, high=105, low=99 → body=1, upper_wick=5
    ctx = make_ctx(
        close=[100.0, 99.0, 100.0],
        overrides={
            "open": [100.0, 100.0, 99.5],
            "high": [100.5, 105.0, 100.5],
            "low": [99.5, 99.0, 99.0],
        },
    )
    mask = long_upper_wick(ctx, body_ratio=2.0)
    assert bool(mask.iloc[1]) is True


def test_short_upper_wick_no_match(make_ctx):
    ctx = make_ctx(
        close=[100.0, 105.0],
        overrides={
            "open": [100.0, 100.0],
            "high": [100.5, 105.5],
            "low": [99.5, 99.5],
        },
    )
    mask = long_upper_wick(ctx, body_ratio=2.0)
    assert bool(mask.iloc[1]) is False


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        long_upper_wick(ctx, body_ratio=0.0)
