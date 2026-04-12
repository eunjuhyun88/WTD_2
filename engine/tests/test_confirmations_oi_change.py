"""Tests for building_blocks.confirmations.oi_change."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import oi_change


def test_increase_matches_above_threshold(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"oi_change_1h": [0.0, 0.05, 0.15, 0.08]},
    )
    mask = oi_change(ctx, threshold=0.10, direction="increase", window="1h")
    assert list(mask) == [False, False, True, False]


def test_decrease_matches_below_negative_threshold(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"oi_change_1h": [0.0, -0.05, -0.15, -0.08]},
    )
    mask = oi_change(ctx, threshold=0.10, direction="decrease", window="1h")
    assert list(mask) == [False, False, True, False]


def test_window_24h_uses_right_column(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={
            "oi_change_1h": [0.0, 0.50],   # would match 1h
            "oi_change_24h": [0.0, 0.05],  # would NOT match 24h @ 0.1
        },
    )
    mask_24h = oi_change(ctx, threshold=0.10, direction="increase", window="24h")
    assert list(mask_24h) == [False, False]
    mask_1h = oi_change(ctx, threshold=0.10, direction="increase", window="1h")
    assert list(mask_1h) == [False, True]


def test_increase_not_matched_by_decrease(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"oi_change_1h": [0.0, 0.20]},
    )
    mask = oi_change(ctx, threshold=0.10, direction="decrease", window="1h")
    assert not mask.any()


def test_zero_defaults_match_nothing_on_nonzero_threshold(make_ctx):
    # Simulates the current perp-stub state: oi_change all zeros → no match
    ctx = make_ctx(
        close=[100] * 5,
        features={"oi_change_1h": [0.0] * 5},
    )
    mask = oi_change(ctx, threshold=0.01, direction="increase", window="1h")
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"oi_change_1h": [0.0, 0.0]},
    )
    with pytest.raises(ValueError):
        oi_change(ctx, threshold=0.0)
    with pytest.raises(ValueError):
        oi_change(ctx, threshold=-0.05)
    with pytest.raises(ValueError):
        oi_change(ctx, direction="sideways")  # type: ignore[arg-type]
    with pytest.raises(ValueError):
        oi_change(ctx, window="4h")  # type: ignore[arg-type]
