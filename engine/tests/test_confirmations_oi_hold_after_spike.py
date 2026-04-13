"""Tests for building_blocks.confirmations.oi_hold_after_spike."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import oi_hold_after_spike


def test_spike_then_hold_detected(make_ctx):
    # Spike at bar 1, followed by stable OI
    ctx = make_ctx(
        close=[100] * 5,
        features={
            "oi_change_1h":  [0.0, 0.15, 0.02, 0.01, 0.0],
            "oi_change_24h": [0.0,  0.10, 0.05, 0.03, 0.02],
        },
    )
    mask = oi_hold_after_spike(ctx, spike_threshold=0.12, lookback_bars=4)
    # Bars 1-4 should all be True (spike visible in rolling window, OI not collapsed)
    assert list(mask) == [False, True, True, True, True]


def test_no_spike_returns_false(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "oi_change_1h":  [0.0, 0.05, 0.05, 0.05],
            "oi_change_24h": [0.0, 0.05, 0.05, 0.05],
        },
    )
    mask = oi_hold_after_spike(ctx, spike_threshold=0.12)
    assert not mask.any()


def test_spike_then_collapse_returns_false(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "oi_change_1h":  [0.0, 0.15, 0.0, 0.0],
            "oi_change_24h": [0.0,  0.10, -0.10, -0.10],  # collapsed
        },
    )
    mask = oi_hold_after_spike(ctx, spike_threshold=0.12, decay_threshold=-0.05)
    # Bar 1: spike just occurred, 24h OI > -0.05 → True
    # Bar 2-3: spike visible, but 24h OI = -0.10 < -0.05 → False
    assert list(mask) == [False, True, False, False]


def test_spike_outside_lookback_not_counted(make_ctx):
    # Spike at bar 0, lookback_bars=2: by bar 3 spike is out of window
    ctx = make_ctx(
        close=[100] * 5,
        features={
            "oi_change_1h":  [0.15, 0.0, 0.0, 0.0, 0.0],
            "oi_change_24h": [0.10, 0.05, 0.02, 0.01, 0.0],
        },
    )
    mask = oi_hold_after_spike(ctx, spike_threshold=0.12, lookback_bars=2)
    # Bars 0-1: spike within window → True (24h OK)
    # Bar 2+: spike at bar 0 is >2 bars ago → rolling(2).max() no longer sees it
    assert mask.iloc[0] is True or bool(mask.iloc[0]) is True
    assert mask.iloc[1] is True or bool(mask.iloc[1]) is True
    assert not mask.iloc[3]
    assert not mask.iloc[4]


def test_exact_boundary_values(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "oi_change_1h":  [0.12, 0.0],
            "oi_change_24h": [-0.05, -0.05],
        },
    )
    mask = oi_hold_after_spike(ctx, spike_threshold=0.12, decay_threshold=-0.05)
    assert list(mask) == [True, True]


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "oi_change_1h":  [0.0, 0.15],
            "oi_change_24h": [0.0, 0.05],
        },
    )
    with pytest.raises(ValueError):
        oi_hold_after_spike(ctx, spike_threshold=0.0)
    with pytest.raises(ValueError):
        oi_hold_after_spike(ctx, lookback_bars=0)


def test_result_aligned_to_features_index(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={
            "oi_change_1h":  [0.15, 0.0, 0.0, 0.0],
            "oi_change_24h": [0.05, 0.05, 0.05, 0.05],
        },
    )
    mask = oi_hold_after_spike(ctx)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
