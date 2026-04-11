"""Tests for building_blocks.entries.rsi_bullish_divergence."""
from __future__ import annotations

import pytest

from building_blocks.entries import rsi_bullish_divergence


def test_divergence_detected(make_ctx):
    # Price makes lower low recently. First dip is deeper and later dip
    # is shallower enough that RSI recovers (higher RSI at shallower dip).
    # Build: rise, drop to 80, recover to 110, drop to 78 (new low).
    import numpy as np
    close = (
        list(np.linspace(100, 110, 10))
        + list(np.linspace(110, 80, 10))     # first low at 80
        + list(np.linspace(80, 110, 10))     # recovery
        + list(np.linspace(110, 78, 5))      # new lower low at 78
    )
    ctx = make_ctx(close=close)
    mask = rsi_bullish_divergence(
        ctx, lookback=30, rsi_period=14, recent_bars=3
    )
    # Expect at least one True near the end where new low prints while
    # RSI stays above its prior extreme
    assert mask.iloc[-5:].any()


def test_pure_uptrend_no_divergence(make_ctx):
    close = [100.0 + i for i in range(60)]
    ctx = make_ctx(close=close)
    mask = rsi_bullish_divergence(ctx, lookback=30, rsi_period=14, recent_bars=3)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 50)
    with pytest.raises(ValueError):
        rsi_bullish_divergence(ctx, lookback=0)
    with pytest.raises(ValueError):
        rsi_bullish_divergence(ctx, rsi_period=0)
    with pytest.raises(ValueError):
        rsi_bullish_divergence(ctx, recent_bars=0)
    with pytest.raises(ValueError):
        rsi_bullish_divergence(ctx, lookback=5, recent_bars=5)
