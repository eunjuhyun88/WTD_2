"""Tests for building_blocks.disqualifiers.volume_below_average."""
from __future__ import annotations

import pytest

from building_blocks.disqualifiers import volume_below_average


def test_below_average_disqualifies(make_ctx):
    # 24 bars at vol=1000, bar 24 at vol=400 → 0.4 × baseline → disqualify at 0.5
    vols = [1000.0] * 24 + [400.0]
    ctx = make_ctx(close=[100.0] * 25, overrides={"volume": vols})
    mask = volume_below_average(ctx, multiple=0.5, vs_window=24)
    assert bool(mask.iloc[24]) is True


def test_above_average_does_not_disqualify(make_ctx):
    vols = [1000.0] * 24 + [800.0]
    ctx = make_ctx(close=[100.0] * 25, overrides={"volume": vols})
    mask = volume_below_average(ctx, multiple=0.5, vs_window=24)
    assert bool(mask.iloc[24]) is False


def test_insufficient_history_returns_false(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    mask = volume_below_average(ctx, multiple=0.5, vs_window=24)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 10)
    with pytest.raises(ValueError):
        volume_below_average(ctx, multiple=0.0)
    with pytest.raises(ValueError):
        volume_below_average(ctx, vs_window=0)
