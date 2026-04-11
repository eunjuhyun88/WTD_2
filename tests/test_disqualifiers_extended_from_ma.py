"""Tests for building_blocks.disqualifiers.extended_from_ma."""
from __future__ import annotations

import pytest

from building_blocks.disqualifiers import extended_from_ma


def test_stretched_above_ma_disqualifies(make_ctx):
    # 50 bars flat at 100, then bars spiking to 130 → >10% above EMA50
    close = [100.0] * 50 + [130.0] * 10
    ctx = make_ctx(close=close)
    mask = extended_from_ma(ctx, ema_period=50, max_pct=0.10)
    # After the EMA warms up to ~100 and price jumps to 130,
    # distance = |130-100|/100 ~= 30% > 10% → disqualify
    assert mask.iloc[50:].any()


def test_near_ma_does_not_disqualify(make_ctx):
    close = [100.0] * 60
    ctx = make_ctx(close=close)
    mask = extended_from_ma(ctx, ema_period=50, max_pct=0.10)
    assert not mask.any()


def test_stretched_below_also_disqualifies(make_ctx):
    # Going the other way — price dumps 20% below EMA
    close = [100.0] * 50 + [75.0] * 10
    ctx = make_ctx(close=close)
    mask = extended_from_ma(ctx, ema_period=50, max_pct=0.10)
    assert mask.iloc[50:].any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 30)
    with pytest.raises(ValueError):
        extended_from_ma(ctx, ema_period=0)
    with pytest.raises(ValueError):
        extended_from_ma(ctx, max_pct=0.0)
