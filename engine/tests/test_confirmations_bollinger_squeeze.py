"""Tests for building_blocks.confirmations.bollinger_squeeze."""
from __future__ import annotations

import pytest

from building_blocks.confirmations import bollinger_squeeze


def test_flat_prices_are_squeezed(make_ctx):
    # Totally flat prices → std=0 → width=0 → always < width_pct
    close = [100.0] * 60
    ctx = make_ctx(close=close)
    mask = bollinger_squeeze(ctx, width_pct=0.01, lookback=20, bb_period=20)
    # Bars 0..18 lack BB history; from bar 19 onwards, width=0, sustained
    # kicks in once 20 tight bars accumulate (bar 38).
    assert bool(mask.iloc[38]) is True
    assert bool(mask.iloc[59]) is True


def test_volatile_prices_not_squeezed(make_ctx):
    # Alternating 100/120 → large BB width, never below 1%
    close = [100.0 if i % 2 == 0 else 120.0 for i in range(60)]
    ctx = make_ctx(close=close)
    mask = bollinger_squeeze(ctx, width_pct=0.01, lookback=20, bb_period=20)
    assert not mask.any()


def test_transient_squeeze_does_not_sustain(make_ctx):
    # 20 volatile bars, then 5 flat bars → tight but not sustained 10+ bars
    noisy = [100.0 if i % 2 == 0 else 110.0 for i in range(20)]
    flat = [100.0] * 5
    close = noisy + flat + [100.0] * 30
    ctx = make_ctx(close=close)
    mask = bollinger_squeeze(ctx, width_pct=0.005, lookback=20, bb_period=20)
    # The 5 flat bars immediately after noisy section cannot yet satisfy
    # "half of last 20 bars are tight" since 15 of them were noisy.
    # Only once enough flat bars accumulate does sustained fire.
    assert bool(mask.iloc[24]) is False


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 50)
    with pytest.raises(ValueError):
        bollinger_squeeze(ctx, width_pct=0.0)
    with pytest.raises(ValueError):
        bollinger_squeeze(ctx, width_pct=0.01, lookback=0)
    with pytest.raises(ValueError):
        bollinger_squeeze(ctx, width_pct=0.01, bb_period=1)
    with pytest.raises(ValueError):
        bollinger_squeeze(ctx, width_pct=0.01, bb_k=0.0)
