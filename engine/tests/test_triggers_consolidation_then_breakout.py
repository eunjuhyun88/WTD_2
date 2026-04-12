"""Tests for building_blocks.triggers.consolidation_then_breakout."""
from __future__ import annotations

import pytest

from building_blocks.triggers import consolidation_then_breakout


def test_tight_range_then_break(make_ctx):
    # 10 bars in a 2% range [99, 101], then bar 10 closes at 105 (break)
    close = [100.0, 99.5, 100.5, 100.0, 99.8, 100.2, 100.3, 99.9, 100.1, 100.0, 105.0]
    # overrides high/low to make the range very tight
    high = [100.5, 100.0, 101.0, 100.5, 100.3, 100.7, 100.8, 100.4, 100.6, 100.5, 106.0]
    low = [99.5, 99.0, 100.0, 99.5, 99.3, 99.7, 99.8, 99.4, 99.6, 99.5, 104.0]
    ctx = make_ctx(close=close, overrides={"high": high, "low": low})
    mask = consolidation_then_breakout(ctx, range_bars=10, range_pct=0.02)
    # Bar 10: past 10 bars had high_max=101.0, low_min=99.0 → ratio=(101-99)/99≈0.0202
    # Actually slightly above 2% → may or may not match depending on exact numbers.
    # Use 0.025 threshold to ensure the test is robust:
    mask = consolidation_then_breakout(ctx, range_bars=10, range_pct=0.025)
    assert bool(mask.iloc[10]) is True


def test_wide_range_disqualifies(make_ctx):
    # 10 bars spanning 90-110 (20%+ range), then 115 breakout
    close = [100, 90, 110, 95, 105, 92, 108, 94, 106, 100, 115]
    high = [c * 1.02 for c in close]
    low = [c * 0.98 for c in close]
    ctx = make_ctx(close=close, overrides={"high": high, "low": low})
    mask = consolidation_then_breakout(ctx, range_bars=10, range_pct=0.05)
    # Range is huge → was_tight False → no match
    assert bool(mask.iloc[10]) is False


def test_tight_range_but_no_break(make_ctx):
    # Tight range, and current bar stays inside it
    close = [100.0] * 11
    high = [100.5] * 11
    low = [99.5] * 11
    ctx = make_ctx(close=close, overrides={"high": high, "low": low})
    mask = consolidation_then_breakout(ctx, range_bars=10, range_pct=0.02)
    assert not mask.any()


def test_insufficient_history_returns_false(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    mask = consolidation_then_breakout(ctx, range_bars=10, range_pct=0.02)
    assert not mask.any()


def test_invalid_params_raise(make_ctx):
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError):
        consolidation_then_breakout(ctx, range_bars=0, range_pct=0.02)
    with pytest.raises(ValueError):
        consolidation_then_breakout(ctx, range_bars=10, range_pct=0.0)
