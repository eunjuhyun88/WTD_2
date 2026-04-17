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


def test_default_oi_spike_threshold_is_eight_percent(make_ctx):
    """Default must be 8% so TRADOOR-style V-reversals can detect REAL_DUMP.

    Empirical evidence (W-0086): TRADOORUSDT has a single -18.79% dump bar
    with oi_change_1h=9.57% peak over 4522 bars. The prior 12% default was
    structurally unreachable on TRADOOR's actual OI dynamics. 8% is
    anchored in Park-Hahn-Lee (2023) liquidation-cascade OI entry rates
    (5-15% per hour) and Koutmos (2019) crypto OI significance bands.
    """
    import inspect

    from building_blocks.confirmations.oi_spike_with_dump import (
        oi_spike_with_dump as fn,
    )

    signature = inspect.signature(fn)
    assert signature.parameters["oi_spike_threshold"].default == 0.08


def test_tradoor_style_oi_ramp_fires_with_default_threshold(make_ctx):
    """A dump bar with OI jump just under the old 12% ceiling still fires.

    TRADOOR's actual REAL_DUMP candidate bar has oi_change_1h=9.57%,
    price_change_1h=-6.18%, vol_zscore=3.75. Under the 8% default this
    must register as a valid oi_spike_with_dump; under the prior 12%
    default it did not.
    """
    ctx = make_ctx(
        close=[100, 100, 100],
        features={
            "price_change_1h": [0.0, 0.0, -0.0618],
            "oi_change_1h":    [0.0, 0.0,  0.0957],
            "vol_zscore":      [0.0, 0.0,  3.75],
        },
    )
    mask = oi_spike_with_dump(ctx)  # uses default thresholds
    assert bool(mask.iloc[-1]) is True


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
