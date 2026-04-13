"""Tests for building_blocks.confirmations.oi_spike_with_dump."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import oi_spike_with_dump


def test_all_three_conditions_met_returns_true(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={
            "price_change_1h": [0.0, 0.0, -0.07, 0.0],
            "oi_change_1h":    [0.0, 0.0,  0.15, 0.0],
            "vol_zscore":      [0.0, 0.0,  2.0,  0.0],
        },
    )
    mask = oi_spike_with_dump(ctx)
    assert list(mask) == [False, False, True, False]


def test_price_drop_missing_returns_false(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "price_change_1h": [0.0, 0.02],   # no drop
            "oi_change_1h":    [0.0, 0.15],
            "vol_zscore":      [0.0, 2.0],
        },
    )
    mask = oi_spike_with_dump(ctx)
    assert not mask.any()


def test_oi_spike_missing_returns_false(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "price_change_1h": [0.0, -0.07],
            "oi_change_1h":    [0.0,  0.05],   # below threshold
            "vol_zscore":      [0.0,  2.0],
        },
    )
    mask = oi_spike_with_dump(ctx)
    assert not mask.any()


def test_vol_zscore_missing_returns_false(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "price_change_1h": [0.0, -0.07],
            "oi_change_1h":    [0.0,  0.15],
            "vol_zscore":      [0.0,  0.5],    # below threshold
        },
    )
    mask = oi_spike_with_dump(ctx)
    assert not mask.any()


def test_exact_boundary_values(make_ctx):
    # Exactly at threshold — should match
    ctx = make_ctx(
        close=[100, 100],
        features={
            "price_change_1h": [0.0, -0.05],
            "oi_change_1h":    [0.0,  0.12],
            "vol_zscore":      [0.0,  1.5],
        },
    )
    mask = oi_spike_with_dump(ctx)
    assert list(mask) == [False, True]


def test_custom_thresholds(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={
            "price_change_1h": [0.0, -0.03, -0.08],
            "oi_change_1h":    [0.0,  0.20,  0.20],
            "vol_zscore":      [0.0,  3.0,   3.0],
        },
    )
    # With stricter price_drop_threshold=0.05, bar 1 should not match
    mask = oi_spike_with_dump(ctx, price_drop_threshold=0.05)
    assert list(mask) == [False, False, True]


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "price_change_1h": [0.0, -0.07],
            "oi_change_1h":    [0.0,  0.15],
            "vol_zscore":      [0.0,  2.0],
        },
    )
    with pytest.raises(ValueError):
        oi_spike_with_dump(ctx, price_drop_threshold=0.0)
    with pytest.raises(ValueError):
        oi_spike_with_dump(ctx, oi_spike_threshold=-0.1)
    with pytest.raises(ValueError):
        oi_spike_with_dump(ctx, vol_zscore_threshold=0.0)
