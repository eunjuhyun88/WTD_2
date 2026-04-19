"""Tests for building_blocks.triggers.volume_spike_down."""
from __future__ import annotations

import pytest

from building_blocks.triggers import volume_spike_down


def test_spike_with_drop_detected(make_ctx):
    """Down-bar with 4x average volume and 5% drop → True."""
    n_flat = 10
    closes = [100.0] * n_flat + [95.0]  # final bar drops from open 100 to 95
    opens_override = [100.0] * n_flat + [100.0]
    vols = [1000.0] * n_flat + [4000.0]
    ctx = make_ctx(
        close=closes,
        overrides={"volume": vols, "open": opens_override},
    )
    mask = volume_spike_down(
        ctx, multiple=3.0, vs_window=n_flat, price_drop_pct=0.03
    )
    assert bool(mask.iloc[n_flat]) is True


def test_spike_but_up_bar_does_not_match(make_ctx):
    """4x volume but price went UP → False."""
    n_flat = 10
    closes = [100.0] * n_flat + [105.0]
    opens_override = [100.0] * n_flat + [100.0]
    vols = [1000.0] * n_flat + [4000.0]
    ctx = make_ctx(
        close=closes,
        overrides={"volume": vols, "open": opens_override},
    )
    mask = volume_spike_down(
        ctx, multiple=3.0, vs_window=n_flat, price_drop_pct=0.03
    )
    assert bool(mask.iloc[n_flat]) is False


def test_drop_but_no_volume_spike_does_not_match(make_ctx):
    """5% drop but volume unchanged → False."""
    n_flat = 10
    closes = [100.0] * n_flat + [95.0]
    opens_override = [100.0] * n_flat + [100.0]
    vols = [1000.0] * (n_flat + 1)
    ctx = make_ctx(
        close=closes,
        overrides={"volume": vols, "open": opens_override},
    )
    mask = volume_spike_down(
        ctx, multiple=3.0, vs_window=n_flat, price_drop_pct=0.03
    )
    assert bool(mask.iloc[n_flat]) is False


def test_insufficient_history_returns_false(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    mask = volume_spike_down(ctx, multiple=2.0, vs_window=10, price_drop_pct=0.03)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        volume_spike_down(ctx, multiple=0.0, vs_window=3)
    with pytest.raises(ValueError):
        volume_spike_down(ctx, multiple=2.0, vs_window=0)
    with pytest.raises(ValueError):
        volume_spike_down(ctx, multiple=2.0, vs_window=3, price_drop_pct=0.0)


def test_small_drop_below_threshold_does_not_match(make_ctx):
    """Volume spikes but drop is only 1% (below 3% threshold) → False."""
    n_flat = 10
    closes = [100.0] * n_flat + [99.0]  # 1% drop
    opens_override = [100.0] * n_flat + [100.0]
    vols = [1000.0] * n_flat + [4000.0]
    ctx = make_ctx(
        close=closes,
        overrides={"volume": vols, "open": opens_override},
    )
    mask = volume_spike_down(
        ctx, multiple=3.0, vs_window=n_flat, price_drop_pct=0.03
    )
    assert bool(mask.iloc[n_flat]) is False
