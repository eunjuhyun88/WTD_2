"""Tests for building_blocks.confirmations.orderbook_imbalance_ratio.

OB depth features (ob_bid_usd / ob_ask_usd) are not in the historical
pipeline — the block must return all-False when they are absent.
When present, it must threshold the smoothed bid/ask ratio >= min_ratio.
"""
from __future__ import annotations

import pandas as pd
import pytest

from building_blocks.confirmations.orderbook_imbalance_ratio import orderbook_imbalance_ratio


def _make_ctx_with_ob(bid_values: list[float], ask_values: list[float], make_ctx):
    """Build a ctx that includes ob_bid_usd / ob_ask_usd in features."""
    n = len(bid_values)
    ctx = make_ctx(close=[100.0] * n)
    idx = ctx.features.index
    ctx.features["ob_bid_usd"] = pd.array(bid_values, dtype=float)
    ctx.features["ob_ask_usd"] = pd.array(ask_values, dtype=float)
    return ctx


def test_fallback_all_false_when_ob_features_absent(make_ctx):
    """Returns all False when ob_bid_usd / ob_ask_usd not in ctx.features."""
    ctx = make_ctx(close=[100.0] * 10)
    assert "ob_bid_usd" not in ctx.features.columns
    result = orderbook_imbalance_ratio(ctx)
    assert not result.any()
    assert result.dtype == bool


def test_imbalance_detected_when_bid_dominates(make_ctx):
    """Returns True when bid$ >= 3× ask$."""
    n = 10
    # bid = 300K, ask = 100K → ratio = 3.0
    ctx = _make_ctx_with_ob([300_000.0] * n, [100_000.0] * n, make_ctx)
    result = orderbook_imbalance_ratio(ctx, min_ratio=3.0, smoothing=1)
    assert result.all()


def test_no_imbalance_when_ratio_below_threshold(make_ctx):
    """Returns False when bid/ask ratio < min_ratio."""
    n = 10
    # bid = 200K, ask = 100K → ratio = 2.0 < 3.0
    ctx = _make_ctx_with_ob([200_000.0] * n, [100_000.0] * n, make_ctx)
    result = orderbook_imbalance_ratio(ctx, min_ratio=3.0, smoothing=1)
    assert not result.any()


def test_smoothing_averages_out_spikes(make_ctx):
    """Single-bar spike does not trigger when smoothing=3."""
    n = 10
    # Only bar 4 has extreme imbalance; others balanced
    bid = [100_000.0] * n
    bid[4] = 500_000.0  # one spike
    ask = [100_000.0] * n
    ctx = _make_ctx_with_ob(bid, ask, make_ctx)
    result = orderbook_imbalance_ratio(ctx, min_ratio=3.0, smoothing=3)
    # With smoothing=3, the avg around bar 4 is (1 + 5 + 1)/3 ≈ 2.33 < 3.0
    assert not result.any()


def test_smoothing_triggers_on_sustained_imbalance(make_ctx):
    """Sustained imbalance triggers after smoothing window fills."""
    n = 10
    # bid = 400K, ask = 100K → ratio = 4.0 sustained
    ctx = _make_ctx_with_ob([400_000.0] * n, [100_000.0] * n, make_ctx)
    result = orderbook_imbalance_ratio(ctx, min_ratio=3.0, smoothing=3)
    # All bars have ratio 4.0; after min_periods=1 warmup, all should be True
    assert result.all()


def test_zero_ask_handled_gracefully(make_ctx):
    """Zero ask volume does not raise — treated as neutral (ratio=1.0)."""
    n = 5
    ctx = _make_ctx_with_ob([300_000.0] * n, [0.0] * n, make_ctx)
    result = orderbook_imbalance_ratio(ctx, min_ratio=3.0, smoothing=1)
    # zero ask → ratio filled to 1.0 < 3.0 → False
    assert not result.any()


def test_invalid_params_raise(make_ctx):
    """min_ratio <= 0 or smoothing < 1 raises ValueError."""
    ctx = make_ctx(close=[100.0] * 5)
    with pytest.raises(ValueError, match="min_ratio"):
        orderbook_imbalance_ratio(ctx, min_ratio=0.0)
    with pytest.raises(ValueError, match="min_ratio"):
        orderbook_imbalance_ratio(ctx, min_ratio=-1.0)
    with pytest.raises(ValueError, match="smoothing"):
        orderbook_imbalance_ratio(ctx, smoothing=0)
