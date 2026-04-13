"""Tests for building_blocks.confirmations.funding_flip."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import funding_flip


def test_flip_detected_after_negative_streak(make_ctx):
    # lookback=2: need 2 prior negative bars, then a positive bar
    ctx = make_ctx(
        close=[100] * 5,
        features={"funding_rate": [-0.01, -0.01, -0.01, -0.01, 0.02]},
    )
    mask = funding_flip(ctx, lookback=2)
    # Only bar 4 should be True (positive after 2+ negative bars)
    assert list(mask) == [False, False, False, False, True]


def test_no_flip_when_already_positive(make_ctx):
    ctx = make_ctx(
        close=[100] * 4,
        features={"funding_rate": [0.01, 0.02, 0.03, 0.04]},
    )
    mask = funding_flip(ctx, lookback=2)
    assert not mask.any()


def test_no_flip_when_only_one_negative_bar(make_ctx):
    ctx = make_ctx(
        close=[100] * 3,
        features={"funding_rate": [-0.01, 0.02, 0.03]},
    )
    # lookback=2 requires 2 negative bars before the positive bar
    mask = funding_flip(ctx, lookback=2)
    assert not mask.any()


def test_no_flip_when_never_negative(make_ctx):
    ctx = make_ctx(
        close=[100] * 5,
        features={"funding_rate": [0.01, 0.02, 0.03, 0.04, 0.05]},
    )
    mask = funding_flip(ctx, lookback=3)
    assert not mask.any()


def test_funding_zero_not_considered_negative(make_ctx):
    # Zero funding should not be treated as negative
    ctx = make_ctx(
        close=[100] * 4,
        features={"funding_rate": [0.0, 0.0, 0.0, 0.01]},
    )
    mask = funding_flip(ctx, lookback=2)
    assert not mask.any()


def test_lookback_1_requires_single_negative_prior_bar(make_ctx):
    ctx = make_ctx(
        close=[100] * 3,
        features={"funding_rate": [-0.01, 0.02, 0.03]},
    )
    mask = funding_flip(ctx, lookback=1)
    # Bar 1 is positive and bar 0 was negative → True at index 1
    assert list(mask) == [False, True, False]


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"funding_rate": [-0.01, 0.01]},
    )
    with pytest.raises(ValueError):
        funding_flip(ctx, lookback=0)


def test_result_aligned_to_features_index(make_ctx):
    ctx = make_ctx(
        close=[100] * 6,
        features={"funding_rate": [-0.01, -0.01, -0.01, -0.01, -0.01, 0.01]},
    )
    mask = funding_flip(ctx, lookback=3)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
