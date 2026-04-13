"""Tests for building_blocks.confirmations.sideways_compression."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import sideways_compression


def test_flat_price_detected_as_compressed(make_ctx):
    # Constant close/high/low → zero range → should be flagged
    ctx = make_ctx(
        close=[100.0] * 10,
        overrides={
            "high": [100.5] * 10,
            "low":  [99.5] * 10,
        },
    )
    # range = (100.5 - 99.5) / 100.0 = 0.01 <= 0.05 → True once window fills
    mask = sideways_compression(ctx, max_range_pct=0.05, lookback=3)
    # First 2 bars are NaN (window=3, min_periods=3); bars 2-9 should be True
    assert mask.iloc[-1] is True or bool(mask.iloc[-1]) is True
    assert not mask.iloc[0]
    assert not mask.iloc[1]


def test_wide_range_not_compressed(make_ctx):
    ctx = make_ctx(
        close=[100.0] * 10,
        overrides={
            "high": [120.0] * 10,  # 20% above
            "low":  [80.0] * 10,   # 20% below → range_pct = 40%
        },
    )
    mask = sideways_compression(ctx, max_range_pct=0.05, lookback=3)
    assert not mask.any()


def test_custom_thresholds(make_ctx):
    # Tight range: (high-low)/mid = (102 - 98) / 100 = 0.04
    ctx = make_ctx(
        close=[100.0] * 10,
        overrides={
            "high": [102.0] * 10,
            "low":  [98.0] * 10,
        },
    )
    # Should not match with max_range_pct=0.03
    mask_strict = sideways_compression(ctx, max_range_pct=0.03, lookback=3)
    assert not mask_strict.any()

    # Should match with max_range_pct=0.05
    mask_loose = sideways_compression(ctx, max_range_pct=0.05, lookback=3)
    assert mask_loose.iloc[-1] is True or bool(mask_loose.iloc[-1]) is True


def test_insufficient_data_returns_false(make_ctx):
    ctx = make_ctx(
        close=[100.0] * 3,
        overrides={
            "high": [101.0] * 3,
            "low":  [99.0] * 3,
        },
    )
    # window=5 > len(data)=3 → no valid windows
    mask = sideways_compression(ctx, max_range_pct=0.05, lookback=5)
    assert not mask.any()


def test_volatile_then_flat(make_ctx):
    # First 5 bars are volatile, next 5 are flat
    ctx = make_ctx(
        close=[100.0] * 10,
        overrides={
            "high": [120.0, 118.0, 115.0, 112.0, 110.0, 101.0, 101.0, 101.0, 101.0, 101.0],
            "low":  [80.0,  82.0,  85.0,  88.0,  90.0,  99.0,  99.0,  99.0,  99.0,  99.0],
        },
    )
    mask = sideways_compression(ctx, max_range_pct=0.05, lookback=3)
    # Last 3 bars should be True (flat range = 2/100 = 0.02 <= 0.05)
    assert bool(mask.iloc[-1]) is True
    # First bars should be False (high range)
    assert not mask.iloc[0]


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        sideways_compression(ctx, max_range_pct=0.0)
    with pytest.raises(ValueError):
        sideways_compression(ctx, max_range_pct=-0.1)
    with pytest.raises(ValueError):
        sideways_compression(ctx, lookback=1)


def test_result_aligned_to_features_index(make_ctx):
    ctx = make_ctx(
        close=[100.0] * 8,
        overrides={
            "high": [101.0] * 8,
            "low":  [99.0] * 8,
        },
    )
    mask = sideways_compression(ctx)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
