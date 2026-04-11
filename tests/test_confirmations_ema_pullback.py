"""Tests for building_blocks.confirmations.ema_pullback."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import ema_pullback


def test_bump_up_then_return_fires(make_ctx):
    # Bars 0-19 flat at 100 → EMA10 stabilises at 100.
    # Bar 20 jumps to 105 → close above EMA (which drifts slightly up).
    # Bar 21 returns to 100 → close is near EMA (~100.7) AND previous
    # bar's close (105) was above EMA (~100.9).
    close = [100.0] * 20 + [105.0, 100.0] + [100.0] * 10
    ctx = make_ctx(close=close)
    mask = ema_pullback(ctx, ema_period=10, tolerance=0.02)
    # The match fires at bar 21 (pullback from the 105 bump).
    assert bool(mask.iloc[21]) is True


def test_below_ema_no_match(make_ctx):
    # Always below EMA → prev_above never true
    close = [100.0 - i * 0.5 for i in range(50)]
    ctx = make_ctx(close=close)
    mask = ema_pullback(ctx, ema_period=20, tolerance=0.01)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 50)
    with pytest.raises(ValueError):
        ema_pullback(ctx, ema_period=0)
    with pytest.raises(ValueError):
        ema_pullback(ctx, tolerance=0.0)
