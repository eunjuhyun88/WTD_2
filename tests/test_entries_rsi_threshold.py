"""Tests for building_blocks.entries.rsi_threshold."""
from __future__ import annotations

import pytest

from building_blocks.entries import rsi_threshold


def test_below_matches_oversold(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"rsi14": [50.0, 28.0, 35.0, 25.0]},
    )
    mask = rsi_threshold(ctx, threshold=30.0, direction="below")
    assert list(mask) == [False, True, False, True]


def test_above_matches_overbought(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100, 100],
        features={"rsi14": [50.0, 72.0, 65.0, 80.0]},
    )
    mask = rsi_threshold(ctx, threshold=70.0, direction="above")
    assert list(mask) == [False, True, False, True]


def test_exact_threshold_is_exclusive(make_ctx):
    # strict <, strict > — exactly 30 or exactly 70 does not count
    ctx = make_ctx(
        close=[100, 100],
        features={"rsi14": [30.0, 70.0]},
    )
    assert list(rsi_threshold(ctx, threshold=30.0, direction="below")) == [False, False]
    assert list(rsi_threshold(ctx, threshold=70.0, direction="above")) == [False, False]


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(
        close=[100, 100],
        features={"rsi14": [50.0, 50.0]},
    )
    with pytest.raises(ValueError):
        rsi_threshold(ctx, threshold=0.0)
    with pytest.raises(ValueError):
        rsi_threshold(ctx, threshold=100.0)
    with pytest.raises(ValueError):
        rsi_threshold(ctx, threshold=-5.0)
    with pytest.raises(ValueError):
        rsi_threshold(ctx, direction="sideways")  # type: ignore[arg-type]


def test_mask_index_aligns_with_features(make_ctx):
    ctx = make_ctx(
        close=[100, 100, 100],
        features={"rsi14": [20.0, 50.0, 80.0]},
    )
    mask = rsi_threshold(ctx, threshold=30.0, direction="below")
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
