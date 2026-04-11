"""Tests for building_blocks.entries.rsi_bearish_divergence."""
from __future__ import annotations

import pytest

from building_blocks.entries import rsi_bearish_divergence


def test_divergence_detected(make_ctx):
    # Rise to 120, pullback, rise to 122 (new high smaller relative move).
    import numpy as np
    close = (
        list(np.linspace(100, 120, 10))
        + list(np.linspace(120, 100, 10))
        + list(np.linspace(100, 122, 10))
        + list(np.linspace(122, 100, 5))
    )
    # Wait — we need new HIGH in recent bars, not in the last segment.
    # Restructure: long run up to 120, pullback, then new high 122 in last bars.
    close = (
        list(np.linspace(100, 120, 15))
        + list(np.linspace(120, 110, 10))
        + list(np.linspace(110, 122, 5))  # new high at end
    )
    ctx = make_ctx(close=close)
    mask = rsi_bearish_divergence(
        ctx, lookback=30, rsi_period=14, recent_bars=3
    )
    assert mask.iloc[-5:].any()


def test_pure_downtrend_no_divergence(make_ctx):
    close = [150.0 - i for i in range(60)]
    ctx = make_ctx(close=close)
    mask = rsi_bearish_divergence(ctx, lookback=30, rsi_period=14, recent_bars=3)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 50)
    with pytest.raises(ValueError):
        rsi_bearish_divergence(ctx, lookback=0)
    with pytest.raises(ValueError):
        rsi_bearish_divergence(ctx, lookback=5, recent_bars=5)
