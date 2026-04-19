"""Tests for building_blocks.triggers.sweep_below_low."""
from __future__ import annotations

import inspect

import pytest

from building_blocks.triggers import sweep_below_low


def _make_flat_closes(n: int, price: float = 100.0) -> list[float]:
    return [price] * n


def test_sweep_fires_when_low_breaks_support_and_close_recovers(make_ctx):
    """Core case: low < prior_N_day_low, close > prior_N_day_low."""
    # 72 flat bars at 100 → default low = 99 → prior_low = 99
    # Sweep bar: low = 98.5 (breach > 0.1%), close = 100 (recovery above 99)
    n = 73
    closes = _make_flat_closes(n)
    lows = [c * 0.99 for c in closes]
    lows[-1] = 98.5  # breach: 99 - 98.5 = 0.5 > 0.001 * 99 = 0.099 ✓
    ctx = make_ctx(close=closes, overrides={"low": lows})
    mask = sweep_below_low(ctx, lookback_days=3)
    assert bool(mask.iloc[-1]) is True


def test_no_fire_when_close_stays_below_prior_low(make_ctx):
    """Close < prior_low → actual breakdown, not a sweep (no recovery)."""
    # close 98.5 < prior_low 99 → recovery=False → signal=False
    closes = _make_flat_closes(72) + [98.5]
    ctx = make_ctx(close=closes)
    # Default: low = close * 0.99 = 97.515 < 99 (breach) but close = 98.5 < 99 (no recovery)
    mask = sweep_below_low(ctx, lookback_days=3)
    assert bool(mask.iloc[-1]) is False


def test_no_fire_when_low_does_not_breach_prior_low(make_ctx):
    """Low equal to or above prior_low → no sweep."""
    closes = _make_flat_closes(73)
    # Default low = close * 0.99 = 99; prior_low = min(99*72) = 99
    # breach = (99 - 99) >= 0.001 * 99 = 0.099 → 0 >= 0.099 → False
    ctx = make_ctx(close=closes)
    mask = sweep_below_low(ctx, lookback_days=3)
    assert not mask.any()


def test_micro_wick_filtered_by_min_sweep_pct(make_ctx):
    """Breach smaller than min_sweep_pct=0.1% should not fire."""
    n = 73
    closes = _make_flat_closes(n)
    lows = [c * 0.99 for c in closes]
    # prior_low = 99. Micro breach: 99 - 98.95 = 0.05, min_sweep = 0.001*99 = 0.099
    # 0.05 < 0.099 → filtered
    lows[-1] = 98.95
    ctx = make_ctx(close=closes, overrides={"low": lows})
    mask = sweep_below_low(ctx, lookback_days=3, min_sweep_pct=0.001)
    assert bool(mask.iloc[-1]) is False


def test_sufficient_breach_passes_min_sweep_pct(make_ctx):
    """Breach >= min_sweep_pct AND close > prior_low → fire."""
    n = 73
    closes = _make_flat_closes(n)
    lows = [c * 0.99 for c in closes]
    # prior_low = 99. Breach: 99 - 98.8 = 0.2 >= 0.001*99=0.099 ✓; close=100>99 ✓
    lows[-1] = 98.8
    ctx = make_ctx(close=closes, overrides={"low": lows})
    mask = sweep_below_low(ctx, lookback_days=3, min_sweep_pct=0.001)
    assert bool(mask.iloc[-1]) is True


def test_insufficient_history_returns_false(make_ctx):
    """Less history than lookback_days * bars_per_day → all False (min_periods)."""
    closes = _make_flat_closes(10)  # only 10 bars; 3-day lookback needs 72 bars on 1h
    ctx = make_ctx(close=closes)
    mask = sweep_below_low(ctx)
    assert not mask.any()


def test_requires_positive_lookback(make_ctx):
    ctx = make_ctx(close=_make_flat_closes(30))
    with pytest.raises(ValueError):
        sweep_below_low(ctx, lookback_days=0)
    with pytest.raises(ValueError):
        sweep_below_low(ctx, lookback_days=-1)


def test_requires_non_negative_min_sweep_pct(make_ctx):
    ctx = make_ctx(close=_make_flat_closes(30))
    with pytest.raises(ValueError):
        sweep_below_low(ctx, min_sweep_pct=-0.001)


def test_min_sweep_pct_zero_allows_any_breach(make_ctx):
    """min_sweep_pct=0 means any breach (even tiny) fires if close recovers."""
    n = 73
    closes = _make_flat_closes(n)
    lows = [c * 0.99 for c in closes]
    # Tiny breach: 99 - 98.999 = 0.001 < default 0.099, but with min_sweep_pct=0 it fires
    lows[-1] = 98.999
    ctx = make_ctx(close=closes, overrides={"low": lows})
    mask = sweep_below_low(ctx, lookback_days=3, min_sweep_pct=0.0)
    assert bool(mask.iloc[-1]) is True


def test_default_lookback_is_three_days():
    sig = inspect.signature(sweep_below_low)
    assert sig.parameters["lookback_days"].default == 3


def test_default_min_sweep_pct_is_0_001():
    """Default 0.1% filters spread noise without missing genuine sweeps."""
    sig = inspect.signature(sweep_below_low)
    assert sig.parameters["min_sweep_pct"].default == 0.001


def test_fires_only_on_sweep_bar_not_before(make_ctx):
    """Signal must be False on all non-sweep bars."""
    n = 73
    closes = _make_flat_closes(n)
    lows = [c * 0.99 for c in closes]
    lows[-1] = 98.5  # only last bar is a sweep
    ctx = make_ctx(close=closes, overrides={"low": lows})
    mask = sweep_below_low(ctx, lookback_days=3)
    assert mask.sum() == 1
    assert bool(mask.iloc[-1]) is True


def test_output_aligned_to_features_index(make_ctx):
    """Returned Series must align with ctx.features.index."""
    ctx = make_ctx(close=_make_flat_closes(80))
    mask = sweep_below_low(ctx)
    assert mask.index.equals(ctx.features.index)


def test_4h_timeframe_inferred_correctly(make_ctx):
    """On 4h klines, 3-day lookback = 18 bars (3*6)."""
    n = 19  # 18-bar warmup + 1 sweep bar
    closes = _make_flat_closes(n)
    lows = [c * 0.99 for c in closes]
    lows[-1] = 98.5  # breach below prior_low
    ctx = make_ctx(close=closes, overrides={"low": lows}, freq="4h")
    mask = sweep_below_low(ctx, lookback_days=3)
    # 18-bar window is just satisfied at bar 18
    assert bool(mask.iloc[-1]) is True
