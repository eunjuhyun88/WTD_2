"""Tests for building_blocks.triggers.recent_decline."""
from __future__ import annotations

import pytest

from building_blocks.triggers import recent_decline


def test_decline_exceeds_threshold(make_ctx):
    # 10% drop over 5 bars → match at bar 5 (5% threshold)
    ctx = make_ctx(close=[100, 100, 100, 100, 100, 90])
    mask = recent_decline(ctx, pct=0.05, lookback_bars=5)
    assert bool(mask.iloc[5]) is True


def test_decline_below_threshold_does_not_match(make_ctx):
    ctx = make_ctx(close=[100, 100, 100, 100, 100, 97])
    mask = recent_decline(ctx, pct=0.05, lookback_bars=5)
    assert bool(mask.iloc[5]) is False


def test_rally_does_not_match_decline(make_ctx):
    ctx = make_ctx(close=[100, 100, 100, 100, 100, 110])
    mask = recent_decline(ctx, pct=0.05, lookback_bars=5)
    assert bool(mask.iloc[5]) is False


def test_flat_price_never_matches(make_ctx):
    ctx = make_ctx(close=[100.0] * 10)
    mask = recent_decline(ctx, pct=0.01, lookback_bars=3)
    assert not mask.any()


def test_early_bars_lack_history(make_ctx):
    ctx = make_ctx(close=[100, 100, 100, 100, 50])
    mask = recent_decline(ctx, pct=0.05, lookback_bars=4)
    for i in range(4):
        assert bool(mask.iloc[i]) is False
    # Bar 4: 100 / 50 - 1 = 1.0, way above 0.05
    assert bool(mask.iloc[4]) is True


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        recent_decline(ctx, pct=0.0, lookback_bars=3)
    with pytest.raises(ValueError):
        recent_decline(ctx, pct=-0.1, lookback_bars=3)
    with pytest.raises(ValueError):
        recent_decline(ctx, pct=0.05, lookback_bars=0)


def test_mask_index_aligns_with_features(make_ctx):
    ctx = make_ctx(close=[100, 100, 95, 100, 100])
    mask = recent_decline(ctx, pct=0.01, lookback_bars=2)
    assert list(mask.index) == list(ctx.features.index)
    assert mask.dtype == bool
