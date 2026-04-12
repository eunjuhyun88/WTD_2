"""Tests for building_blocks.disqualifiers.extreme_volatility."""
from __future__ import annotations

import pytest

from building_blocks.disqualifiers import extreme_volatility


def test_high_vol_disqualifies(make_ctx):
    # Big high-low ranges → large TR → ATR > 5% of price
    n = 30
    close = [100.0] * n
    # Each bar has a 10-point range → ATR ~10 → 10/100 = 10% > 5%
    high = [110.0] * n
    low = [90.0] * n
    ctx = make_ctx(
        close=close,
        overrides={"high": high, "low": low, "open": [100.0] * n},
    )
    mask = extreme_volatility(ctx, atr_pct_threshold=0.05, atr_period=14)
    # After ATR warmup, should fire
    assert mask.iloc[15:].any()


def test_calm_market_does_not_disqualify(make_ctx):
    n = 30
    close = [100.0] * n
    high = [100.2] * n
    low = [99.8] * n
    ctx = make_ctx(
        close=close,
        overrides={"high": high, "low": low, "open": [100.0] * n},
    )
    mask = extreme_volatility(ctx, atr_pct_threshold=0.05, atr_period=14)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 30)
    with pytest.raises(ValueError):
        extreme_volatility(ctx, atr_pct_threshold=0.0)
    with pytest.raises(ValueError):
        extreme_volatility(ctx, atr_period=0)
