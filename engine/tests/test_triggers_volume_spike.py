"""Tests for building_blocks.triggers.volume_spike."""
from __future__ import annotations

import pytest

from building_blocks.triggers import volume_spike


def test_spike_detected_at_triple_volume(make_ctx):
    # 10 bars at volume=1000, then one at 4000 → 4x avg
    n_flat = 10
    vols = [1000.0] * n_flat + [4000.0]
    closes = [100.0] * (n_flat + 1)
    ctx = make_ctx(close=closes, overrides={"volume": vols})
    mask = volume_spike(ctx, multiple=3.0, vs_window=n_flat)
    assert bool(mask.iloc[n_flat]) is True


def test_below_multiple_does_not_match(make_ctx):
    vols = [1000.0] * 10 + [1500.0]
    ctx = make_ctx(close=[100.0] * 11, overrides={"volume": vols})
    mask = volume_spike(ctx, multiple=2.0, vs_window=10)
    assert bool(mask.iloc[10]) is False


def test_insufficient_history_returns_false(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    mask = volume_spike(ctx, multiple=2.0, vs_window=10)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        volume_spike(ctx, multiple=0.0, vs_window=3)
    with pytest.raises(ValueError):
        volume_spike(ctx, multiple=2.0, vs_window=0)


def test_exactly_at_multiple_matches(make_ctx):
    # volume exactly 2.0 * avg → >= comparison, so True
    vols = [1000.0] * 5 + [2000.0]
    ctx = make_ctx(close=[100.0] * 6, overrides={"volume": vols})
    mask = volume_spike(ctx, multiple=2.0, vs_window=5)
    assert bool(mask.iloc[5]) is True
