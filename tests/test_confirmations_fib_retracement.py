"""Tests for building_blocks.confirmations.fib_retracement."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import fib_retracement


def test_retracement_from_high_matches(make_ctx):
    # Run-up from 100 → 200, then retrace to 161.8 (38.2% retrace from high
    # = 200 - 0.382*100 = 161.8). Check 0.382 hits.
    # Build 60 bars ramping up to 200, bar 60 is the retracement.
    close = [100.0 + i * (100.0 / 60) for i in range(60)] + [161.8]
    ctx = make_ctx(close=close)
    mask = fib_retracement(ctx, levels=(0.382,), tolerance=0.01, lookback=60)
    assert bool(mask.iloc[60]) is True


def test_retracement_to_618_level(make_ctx):
    # 100→200 ramp, retrace to 138.2 (61.8% retrace)
    close = [100.0 + i * (100.0 / 60) for i in range(60)] + [138.2]
    ctx = make_ctx(close=close)
    mask = fib_retracement(ctx, levels=(0.618,), tolerance=0.01, lookback=60)
    assert bool(mask.iloc[60]) is True


def test_price_far_from_any_level_does_not_match(make_ctx):
    # Ramp 100→200, then sit at 190 — well above 0.236 (which would be ~176)
    close = [100.0 + i * (100.0 / 60) for i in range(60)] + [195.0]
    ctx = make_ctx(close=close)
    mask = fib_retracement(ctx, levels=(0.236, 0.382, 0.5), tolerance=0.005, lookback=60)
    assert bool(mask.iloc[60]) is False


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 70)
    with pytest.raises(ValueError):
        fib_retracement(ctx, levels=())
    with pytest.raises(ValueError):
        fib_retracement(ctx, levels=(1.5,))
    with pytest.raises(ValueError):
        fib_retracement(ctx, levels=(0.618,), tolerance=0.0)
    with pytest.raises(ValueError):
        fib_retracement(ctx, levels=(0.618,), lookback=0)


def test_insufficient_history_returns_false(make_ctx):
    ctx = make_ctx(close=[100.0] * 10)
    mask = fib_retracement(ctx, levels=(0.618,), lookback=60)
    assert not mask.any()
