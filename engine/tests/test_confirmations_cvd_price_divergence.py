"""Tests for building_blocks.confirmations.cvd_price_divergence."""
from __future__ import annotations

import pytest

from building_blocks.confirmations.cvd_price_divergence import cvd_price_divergence


def test_fakeout_detected_price_at_high_cvd_declining(make_ctx):
    """Price near rolling high, CVD peaked and now below 80% of peak → True."""
    n = 25
    # Price rises to 110 then stays near high
    close = [100.0] * 10 + [108.0] * 5 + [110.0] * 5 + [109.5] * 5
    # Volume: first 15 bars heavy buying (tbv=800), then fakeout (tbv=200)
    vol = [1000.0] * n
    tbv = [800.0] * 15 + [200.0] * 10   # net buying reverses to net selling

    ctx = make_ctx(
        close=close,
        overrides={"volume": vol, "taker_buy_base_volume": tbv},
    )
    mask = cvd_price_divergence(ctx, price_lookback=20, cvd_drop_ratio=0.80)

    # The 110.0 bars (idx 15-19): price_near_high True (110 >= 110*0.999=109.89 ✓)
    # CVD at bar 14 = cumsum of [600]*15 = 9000 (net = tbv - sell = 800-200=600 per bar)
    # After bar 14 (tbv=200, sell=800): net = -600 per bar
    # CVD at bar 19 = 9000 + 5*(-600) = 6000. peak = 9000. 6000 < 9000*0.80=7200 → True
    assert mask.any(), "Expected at least one fakeout bar"
    # Early bars: price not at high yet
    assert not mask.iloc[:10].any(), "Early bars should not trigger fakeout"


def test_no_divergence_when_cvd_follows_price(make_ctx):
    """CVD tracks price upward — no divergence."""
    n = 25
    close = [100.0 + i for i in range(n)]  # steady uptrend
    # Consistent net buying throughout: tbv=700, vol=1000
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [700.0] * n,
        },
    )
    mask = cvd_price_divergence(ctx, price_lookback=20, cvd_drop_ratio=0.80)
    # CVD grows monotonically → never drops below peak * 0.8
    assert not mask.any()


def test_no_divergence_when_price_not_at_high(make_ctx):
    """CVD may decline but price is not near rolling high → no fakeout."""
    n = 25
    # Price trends down while CVD also declines
    close = [110.0 - i * 0.5 for i in range(n)]
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [300.0] * n,  # net selling throughout
        },
    )
    mask = cvd_price_divergence(ctx, price_lookback=20, cvd_drop_ratio=0.80)
    assert not mask.any()


def test_negative_cvd_peak_not_flagged(make_ctx):
    """Persistent net-selling (negative CVD peak) should not trigger fakeout."""
    n = 25
    close = [100.0] * 10 + [105.0] * 15  # price jumps but CVD always negative
    ctx = make_ctx(
        close=close,
        overrides={
            "volume": [1000.0] * n,
            "taker_buy_base_volume": [200.0] * n,  # net selling: cvd_delta = 200-800=-600
        },
    )
    mask = cvd_price_divergence(ctx, price_lookback=20, cvd_drop_ratio=0.80)
    # CVD peak <= 0 → guard prevents false fakeout flagging
    assert not mask.any()


def test_invalid_params_raise():
    """Invalid parameters raise ValueError."""
    import pandas as pd
    from building_blocks.context import Context

    idx = pd.date_range("2025-01-01", periods=5, freq="1h", tz="UTC")
    klines = pd.DataFrame(
        {"open": [1.0] * 5, "high": [1.01] * 5, "low": [0.99] * 5,
         "close": [1.0] * 5, "volume": [1000.0] * 5, "taker_buy_base_volume": [500.0] * 5},
        index=idx,
    )
    feat = pd.DataFrame({"_dummy": [0.0] * 5}, index=idx)
    ctx = Context(klines=klines, features=feat, symbol="TEST")

    with pytest.raises(ValueError, match="price_lookback"):
        cvd_price_divergence(ctx, price_lookback=1)
    with pytest.raises(ValueError, match="cvd_drop_ratio"):
        cvd_price_divergence(ctx, cvd_drop_ratio=1.5)
    with pytest.raises(ValueError, match="price_near_pct"):
        cvd_price_divergence(ctx, price_near_pct=0.0)
