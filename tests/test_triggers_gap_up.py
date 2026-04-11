"""Tests for building_blocks.triggers.gap_up."""
from __future__ import annotations

import pytest

from building_blocks.triggers import gap_up


def test_gap_up_detected(make_ctx):
    # Bar 2 opens at 105 while prev close was 100 → 5% gap
    ctx = make_ctx(
        close=[100, 100, 108, 108],
        overrides={"open": [100, 100, 105, 108]},
    )
    mask = gap_up(ctx, min_pct=0.03)
    assert bool(mask.iloc[2]) is True


def test_small_gap_below_threshold(make_ctx):
    # 1% gap, threshold 2%
    ctx = make_ctx(
        close=[100, 100, 102, 102],
        overrides={"open": [100, 100, 101, 102]},
    )
    mask = gap_up(ctx, min_pct=0.02)
    assert bool(mask.iloc[2]) is False


def test_no_gap_flat_prices(make_ctx):
    ctx = make_ctx(close=[100.0] * 10)
    mask = gap_up(ctx, min_pct=0.01)
    assert not mask.any()


def test_first_bar_has_no_gap(make_ctx):
    # First bar has no prev_close → NaN → False
    ctx = make_ctx(close=[100, 105], overrides={"open": [99, 105]})
    mask = gap_up(ctx, min_pct=0.01)
    assert bool(mask.iloc[0]) is False


def test_invalid_min_pct_raises(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        gap_up(ctx, min_pct=0.0)
    with pytest.raises(ValueError):
        gap_up(ctx, min_pct=-0.01)
