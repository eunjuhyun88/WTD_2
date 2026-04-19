"""Tests for building_blocks.disqualifiers.coinbase_premium_weak."""
from __future__ import annotations

import pandas as pd
import pytest

from building_blocks.disqualifiers.coinbase_premium_weak import coinbase_premium_weak
from building_blocks.context import Context


def _ctx_with_premium(premium_vals: list[float]) -> Context:
    n = len(premium_vals)
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {
            "open": [100.0] * n,
            "high": [101.0] * n,
            "low": [99.0] * n,
            "close": [100.0] * n,
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [500.0] * n,
        },
        index=idx,
    )
    feat = pd.DataFrame(
        {"_dummy": [0.0] * n, "coinbase_premium": premium_vals},
        index=idx,
    )
    return Context(klines=klines, features=feat, symbol="BTCUSDT")


def _ctx_no_premium(n: int = 10) -> Context:
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {
            "open": [100.0] * n,
            "high": [101.0] * n,
            "low": [99.0] * n,
            "close": [100.0] * n,
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [500.0] * n,
        },
        index=idx,
    )
    feat = pd.DataFrame({"_dummy": [0.0] * n}, index=idx)
    return Context(klines=klines, features=feat, symbol="ETHUSDT")


def test_weak_premium_disqualifies(make_ctx):
    """Negative premium sustained for min_bars → True (disqualify)."""
    premium = [-0.001, -0.002, -0.001, -0.003, -0.002,
               -0.001, -0.002, -0.001, -0.003, -0.002]
    ctx = _ctx_with_premium(premium)
    mask = coinbase_premium_weak(ctx, max_premium=0.0, min_bars=2)
    # All bars have negative premium → after warm-up should all be True
    assert mask.sum() > 0, "Negative premium should disqualify"
    # First bar has no rolling history for min_bars=2 → may be False
    assert mask.iloc[-1], "Last bar in sustained negative premium should be True"


def test_positive_premium_no_disqualify(make_ctx):
    """Positive premium throughout → all False."""
    premium = [0.001, 0.002, 0.003, 0.001, 0.002,
               0.001, 0.002, 0.003, 0.001, 0.002]
    ctx = _ctx_with_premium(premium)
    mask = coinbase_premium_weak(ctx, max_premium=0.0, min_bars=2)
    assert not mask.any(), "Positive premium should NOT disqualify"


def test_mixed_premium_only_disqualifies_sustained_weak(make_ctx):
    """Single weak bar surrounded by positive bars → does not sustain."""
    # 8 positive, 1 negative, 1 positive
    premium = [0.001] * 8 + [-0.001, 0.001]
    ctx = _ctx_with_premium(premium)
    mask = coinbase_premium_weak(ctx, max_premium=0.0, min_bars=2)
    # Only 1 consecutive negative bar — should not trigger with min_bars=2
    assert not mask.any(), "Single weak bar should not trigger with min_bars=2"


def test_graceful_fallback_no_feature_column():
    """When coinbase_premium is absent, return all-False (no disqualify)."""
    ctx = _ctx_no_premium(n=10)
    mask = coinbase_premium_weak(ctx, max_premium=0.0, min_bars=2)
    assert not mask.any(), "Missing coinbase_premium column should return all-False"
    assert len(mask) == 10


def test_min_bars_1_single_bar_triggers():
    """With min_bars=1, a single weak bar triggers the disqualifier."""
    premium = [0.001, 0.001, -0.001, 0.001, 0.001]
    ctx = _ctx_with_premium(premium)
    mask = coinbase_premium_weak(ctx, max_premium=0.0, min_bars=1)
    assert mask.iloc[2], "Single weak bar should trigger with min_bars=1"
    assert not mask.iloc[3], "Positive bar should not trigger"


def test_custom_max_premium_threshold():
    """max_premium=0.0005 disqualifies even slightly positive premium."""
    premium = [0.0001, 0.0002, 0.0001, 0.0002, 0.0001]
    ctx = _ctx_with_premium(premium)
    mask = coinbase_premium_weak(ctx, max_premium=0.0005, min_bars=2)
    # All values 0.0001/0.0002 < 0.0005 → weak
    assert mask.sum() > 0, "Below max_premium threshold should trigger"


def test_invalid_params_raise():
    """Invalid min_bars raises ValueError."""
    ctx = _ctx_no_premium(n=5)
    with pytest.raises(ValueError, match="min_bars"):
        coinbase_premium_weak(ctx, min_bars=0)
