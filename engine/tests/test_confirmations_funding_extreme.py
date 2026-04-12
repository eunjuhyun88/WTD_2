"""Tests for building_blocks.confirmations.funding_extreme."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import funding_extreme


def test_long_overheat_matches_positive_extreme(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"funding_rate": [0.0, 0.0005, 0.0015, 0.0010]},
    )
    mask = funding_extreme(ctx, threshold=0.0010, direction="long_overheat")
    # 0.0015 >= 0.0010 and 0.0010 >= 0.0010
    assert list(mask) == [False, False, True, True]


def test_short_overheat_matches_negative_extreme(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"funding_rate": [0.0, -0.0005, -0.0015, -0.0010]},
    )
    mask = funding_extreme(ctx, threshold=0.0010, direction="short_overheat")
    assert list(mask) == [False, False, True, True]


def test_long_not_matched_by_negative(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"funding_rate": [0.0, -0.005]},
    )
    mask = funding_extreme(ctx, threshold=0.0010, direction="long_overheat")
    assert not mask.any()


def test_zero_defaults_never_match(make_ctx):
    # Simulates the current perp-stub state: funding_rate all zero → no match
    ctx = make_ctx(
        close=[100] * 5,
        features={"funding_rate": [0.0] * 5},
    )
    mask = funding_extreme(ctx, threshold=0.0001, direction="long_overheat")
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"funding_rate": [0.0, 0.0]},
    )
    with pytest.raises(ValueError):
        funding_extreme(ctx, threshold=0.0)
    with pytest.raises(ValueError):
        funding_extreme(ctx, threshold=-0.001)
    with pytest.raises(ValueError):
        funding_extreme(ctx, direction="neutral")  # type: ignore[arg-type]
