"""Tests for building_blocks.confirmations.higher_lows_sequence."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import higher_lows_sequence


def test_rising_lows_detected(make_ctx):
    # Lows rise steadily — rolling min over 3 bars should be higher than
    # rolling min from 3 bars ago once we have enough bars.
    # Bar 0-2: lows [10, 11, 12]  roll_min=10
    # Bar 3-5: lows [13, 14, 15]  roll_min=13  > 10  → True
    ctx = make_ctx(
        close=[100] * 6,
        overrides={"low": [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]},
    )
    mask = higher_lows_sequence(ctx, window=3)
    # First 3+3-1=5 bars may be False/NaN; bar 5 should be True
    assert mask.iloc[-1] is True or bool(mask.iloc[-1]) is True


def test_flat_lows_not_detected(make_ctx):
    ctx = make_ctx(
        close=[100] * 10,
        overrides={"low": [99.0] * 10},
    )
    mask = higher_lows_sequence(ctx, window=3)
    # roll_min is constant → roll_min > roll_min.shift(window) is always False
    assert not mask.any()


def test_falling_lows_not_detected(make_ctx):
    ctx = make_ctx(
        close=[100] * 8,
        overrides={"low": [20.0, 19.0, 18.0, 17.0, 16.0, 15.0, 14.0, 13.0]},
    )
    mask = higher_lows_sequence(ctx, window=3)
    assert not mask.any()


def test_insufficient_data_returns_false(make_ctx):
    # With window=8, need at least 16 bars for any True (8 for first roll_min,
    # 8 more to compare against shifted value)
    ctx = make_ctx(
        close=[100] * 10,
        overrides={"low": [float(i) for i in range(1, 11)]},
    )
    mask = higher_lows_sequence(ctx, window=8)
    # 10 bars < 8 + 8 = 16 required for a True
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100, 100, 100])
    with pytest.raises(ValueError):
        higher_lows_sequence(ctx, window=1)
    with pytest.raises(ValueError):
        higher_lows_sequence(ctx, min_rise_count=0)


def test_result_aligned_to_features_index(make_ctx):
    ctx = make_ctx(
        close=[100] * 10,
        overrides={"low": [float(i) for i in range(10)]},
    )
    mask = higher_lows_sequence(ctx, window=3)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
