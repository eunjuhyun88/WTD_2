"""Tests for building_blocks.triggers.breakout_above_high."""
from __future__ import annotations

import pytest

from building_blocks.triggers import breakout_above_high


def _flat_then_spike_highs(n_flat: int, spike: float) -> list[float]:
    return [100.0] * n_flat + [spike]


def test_breakout_fires_on_new_high(make_ctx):
    # 24 bars flat at 100 → 1-day lookback covers them → spike above max
    closes = _flat_then_spike_highs(24, 120.0)
    ctx = make_ctx(close=closes)
    mask = breakout_above_high(ctx, lookback_days=1)
    # Bar 24 is the spike. close[24]=120 > max(high[0:24])~101
    assert bool(mask.iloc[24]) is True


def test_no_breakout_when_close_below_past_high(make_ctx):
    # Flat 100 bars, then the new bar's close=100 ties (not greater)
    ctx = make_ctx(close=[100.0] * 25)
    mask = breakout_above_high(ctx, lookback_days=1)
    # Not a strict > → False
    assert not mask.any()


def test_insufficient_history_returns_false(make_ctx):
    # Only 10 bars, lookback_days=1 needs 24 → all False
    ctx = make_ctx(close=[100.0 + i for i in range(10)])
    mask = breakout_above_high(ctx, lookback_days=1)
    assert not mask.any()


def test_requires_positive_lookback(make_ctx):
    ctx = make_ctx(close=[100.0] * 30)
    with pytest.raises(ValueError):
        breakout_above_high(ctx, lookback_days=0)
    with pytest.raises(ValueError):
        breakout_above_high(ctx, lookback_days=-1)


def test_past_only_excludes_current_bar(make_ctx):
    # Highs: [110, 100, 100, ... , 100, 105]. Current bar's own high (110
    # on bar 0, 105 on bar N) must not self-compare.
    n = 25
    close = [100.0] * n
    # Override high so bar 0 has a huge high that would defeat a
    # non-past-only implementation.
    overrides = {"high": [150.0] + [100.0 * 1.01] * (n - 1)}
    ctx = make_ctx(close=close, overrides=overrides)
    mask = breakout_above_high(ctx, lookback_days=1)
    # Bar 24: past high window includes bar 0's high=150 → no way close=100 breaks it
    assert bool(mask.iloc[24]) is False
