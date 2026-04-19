"""Tests for building_blocks.disqualifiers.cvd_spot_price_divergence_bear."""
from __future__ import annotations

import pytest

from building_blocks.disqualifiers.cvd_spot_price_divergence_bear import (
    cvd_spot_price_divergence_bear,
)


def test_divergence_detected_rising_flow_falling_price(make_ctx):
    """tbv_ratio > 0.5 over lookback AND price declining → True (disqualify)."""
    n = 20
    # Price falls 2% over 10-bar window
    close = [100.0 - i * 0.2 for i in range(n)]
    # tbv_ratio = 700/1000 = 0.70 (net buying throughout)
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [700.0] * n,
        },
    )
    mask = cvd_spot_price_divergence_bear(
        ctx, lookback=10, net_buy_threshold=0.50, min_price_drop=0.003, min_bars=2
    )
    # From bar 10+ we have enough lookback; price pct_change(10) = (close[10]-close[0])/close[0] = -2/100
    assert mask.any(), "Expected divergence to be detected"
    # First 10 bars don't have enough lookback
    assert not mask.iloc[:10].any(), "Warm-up bars should not trigger"


def test_no_divergence_cvd_rising_price_rising(make_ctx):
    """CVD rising AND price rising → no divergence."""
    n = 20
    close = [100.0 + i * 0.5 for i in range(n)]
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [700.0] * n,  # net buying
        },
    )
    mask = cvd_spot_price_divergence_bear(ctx, lookback=10, min_price_drop=0.003)
    assert not mask.any(), "Rising price with rising flow should NOT disqualify"


def test_no_divergence_cvd_falling_price_falling(make_ctx):
    """Net selling AND price falling → no divergence (consistent sell-off)."""
    n = 20
    close = [100.0 - i * 0.3 for i in range(n)]
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [300.0] * n,  # net selling (ratio=0.3 < 0.5)
        },
    )
    mask = cvd_spot_price_divergence_bear(ctx, lookback=10, net_buy_threshold=0.50, min_price_drop=0.003)
    assert not mask.any(), "Consistent sell-off should NOT trigger divergence disqualifier"


def test_no_divergence_small_price_drop(make_ctx):
    """Price drops only 0.1% (below min_price_drop=0.3%) → no flag."""
    n = 20
    # price drops 0.1% total over 10 bars → pct_change(10) ≈ -0.001
    close = [100.0 - i * 0.01 for i in range(n)]
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [700.0] * n,
        },
    )
    mask = cvd_spot_price_divergence_bear(ctx, lookback=10, min_price_drop=0.003)
    assert not mask.any(), "Sub-threshold price drop should not disqualify"


def test_min_bars_requirement(make_ctx):
    """With min_bars=3, requires 3 consecutive divergence bars."""
    n = 15
    # Only last 2 bars diverge (lookback=5 gives pct_change from bar 5)
    close = [100.0] * 10 + [99.5, 99.3, 99.0, 98.8, 98.6]  # drops ~1.4%
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [700.0] * n,
        },
    )
    # min_bars=5 means we need 5 consecutive bars — likely not enough data
    mask_strict = cvd_spot_price_divergence_bear(ctx, lookback=5, min_price_drop=0.001, min_bars=5)
    mask_loose = cvd_spot_price_divergence_bear(ctx, lookback=5, min_price_drop=0.001, min_bars=1)
    # Loose should detect, strict may not have enough consecutive bars
    # The key test: strict produces fewer (or equal) True values than loose
    assert mask_strict.sum() <= mask_loose.sum()


def test_zero_volume_guard(make_ctx):
    """Zero volume rows should not cause division errors."""
    n = 15
    close = [100.0 - i * 0.2 for i in range(n)]
    vol = [1000.0] * n
    tbv = [700.0] * n
    vol[5] = 0.0   # zero volume bar
    tbv[5] = 0.0
    ctx = make_ctx(
        close=close,
        overrides={"volume": vol, "taker_buy_base_volume": tbv},
    )
    # Should not raise and return a bool Series
    mask = cvd_spot_price_divergence_bear(ctx, lookback=5, min_price_drop=0.001)
    assert mask.dtype == bool


def test_invalid_params_raise():
    """Invalid parameters raise ValueError."""
    import pandas as pd
    from building_blocks.context import Context

    idx = pd.date_range("2025-01-01", periods=5, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {"open": [1.0] * 5, "high": [1.01] * 5, "low": [0.99] * 5,
         "close": [1.0] * 5, "volume": [1000.0] * 5,
         "taker_buy_base_volume": [500.0] * 5},
        index=idx,
    )
    feat = pd.DataFrame({"_dummy": [0.0] * 5}, index=idx)
    ctx = Context(klines=klines, features=feat, symbol="TEST")

    with pytest.raises(ValueError, match="lookback"):
        cvd_spot_price_divergence_bear(ctx, lookback=1)
    with pytest.raises(ValueError, match="net_buy_threshold"):
        cvd_spot_price_divergence_bear(ctx, net_buy_threshold=1.5)
    with pytest.raises(ValueError, match="min_price_drop"):
        cvd_spot_price_divergence_bear(ctx, min_price_drop=-0.01)
    with pytest.raises(ValueError, match="min_bars"):
        cvd_spot_price_divergence_bear(ctx, min_bars=0)
