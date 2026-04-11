"""Tests for building_blocks.triggers.gap_down."""
from __future__ import annotations

import pytest

from building_blocks.triggers import gap_down


def test_gap_down_exceeds_threshold(make_ctx):
    # prev_close=100, open=94 → gap = (100 - 94) / 94 ≈ 0.064
    ctx = make_ctx(close=[100, 94], overrides={"open": [100, 94]})
    mask = gap_down(ctx, min_pct=0.05)
    assert bool(mask.iloc[1]) is True


def test_gap_down_below_threshold_does_not_match(make_ctx):
    # prev_close=100, open=98 → gap ≈ 2%
    ctx = make_ctx(close=[100, 98], overrides={"open": [100, 98]})
    mask = gap_down(ctx, min_pct=0.05)
    assert bool(mask.iloc[1]) is False


def test_gap_up_does_not_match_gap_down(make_ctx):
    ctx = make_ctx(close=[100, 110], overrides={"open": [100, 110]})
    mask = gap_down(ctx, min_pct=0.05)
    assert bool(mask.iloc[1]) is False


def test_flat_never_matches(make_ctx):
    ctx = make_ctx(close=[100.0] * 5, overrides={"open": [100.0] * 5})
    mask = gap_down(ctx, min_pct=0.01)
    assert not mask.any()


def test_first_bar_has_no_prev_close(make_ctx):
    ctx = make_ctx(close=[100, 90], overrides={"open": [100, 90]})
    mask = gap_down(ctx, min_pct=0.05)
    assert bool(mask.iloc[0]) is False


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 3)
    with pytest.raises(ValueError):
        gap_down(ctx, min_pct=0.0)
    with pytest.raises(ValueError):
        gap_down(ctx, min_pct=-0.01)


def test_mask_index_aligns_with_features(make_ctx):
    ctx = make_ctx(close=[100, 92, 91])
    mask = gap_down(ctx, min_pct=0.05)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
