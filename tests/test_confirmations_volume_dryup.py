"""Tests for building_blocks.confirmations.volume_dryup."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import volume_dryup


def test_dryup_detected(make_ctx):
    # 24 bars at vol=1000, then 3 bars at 300 → recent_mean=300, baseline=1000
    # ratio = 300/1000 = 0.3 ≤ 0.5 → match
    vols = [1000.0] * 24 + [300.0, 300.0, 300.0]
    ctx = make_ctx(close=[100.0] * 27, overrides={"volume": vols})
    mask = volume_dryup(ctx, vs_window=24, threshold=0.5, recent_bars=3)
    # Match at bar 26 (index 26)
    assert bool(mask.iloc[26]) is True


def test_no_dryup_when_recent_above_threshold(make_ctx):
    vols = [1000.0] * 24 + [600.0, 600.0, 600.0]
    ctx = make_ctx(close=[100.0] * 27, overrides={"volume": vols})
    mask = volume_dryup(ctx, vs_window=24, threshold=0.5, recent_bars=3)
    assert bool(mask.iloc[26]) is False


def test_insufficient_history_returns_false(make_ctx):
    vols = [1000.0] * 5 + [100.0, 100.0, 100.0]
    ctx = make_ctx(close=[100.0] * 8, overrides={"volume": vols})
    mask = volume_dryup(ctx, vs_window=24, threshold=0.5, recent_bars=3)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 10)
    with pytest.raises(ValueError):
        volume_dryup(ctx, vs_window=0)
    with pytest.raises(ValueError):
        volume_dryup(ctx, threshold=0.0)
    with pytest.raises(ValueError):
        volume_dryup(ctx, recent_bars=0)
