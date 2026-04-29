"""Unit tests for W-0238 F-12 Korea features."""
from __future__ import annotations

from unittest.mock import patch

import pandas as pd
import pytest

from features.compute import calc_session_return, calc_kimchi_premium, calc_oi_normalized_cvd


def _make_ohlcv(hours: list[int]) -> pd.DataFrame:
    """Build minimal OHLCV DataFrame with given UTC hours."""
    import numpy as np

    idx = pd.date_range("2026-01-01", periods=len(hours), freq="1h", tz="UTC")
    idx = idx[: len(hours)]
    # Override hours manually
    idx = pd.DatetimeIndex(
        [ts.replace(hour=h) for ts, h in zip(idx, hours)]
    )
    data = {
        "open": [100.0] * len(hours),
        "high": [101.0] * len(hours),
        "low": [99.0] * len(hours),
        "close": [100.0 + i * 0.5 for i in range(len(hours))],
        "volume": [1.0] * len(hours),
    }
    return pd.DataFrame(data, index=idx)


class TestSessionReturn:
    def test_apac_hours(self):
        ohlcv = _make_ohlcv([0, 1, 2, 3, 4, 5, 12, 18])
        result = calc_session_return(ohlcv, "apac")
        assert isinstance(result, float)

    def test_empty_session_returns_zero(self):
        ohlcv = _make_ohlcv([12, 13, 14])  # US hours only
        result = calc_session_return(ohlcv, "apac")
        assert result == 0.0

    def test_single_bar_returns_zero(self):
        ohlcv = _make_ohlcv([0])
        result = calc_session_return(ohlcv, "apac")
        assert result == 0.0


class TestKimchiPremium:
    def test_premium_positive(self):
        with patch("data_cache.fetch_upbit.fetch_upbit_btc_krw", return_value=100_000_000.0):
            with patch("data_cache.fetch_upbit.fetch_usd_krw_rate", return_value=1300.0):
                result = calc_kimchi_premium(binance_btc_usdt=76_000.0)
        # upbit_krw / (binance * usd_krw) - 1 = 100_000_000 / (76000 * 1300) - 1
        assert "kimchi_premium_pct" in result
        assert isinstance(result["kimchi_premium_pct"], float)

    def test_fetch_failure_returns_zero(self):
        with patch("data_cache.fetch_upbit.fetch_upbit_btc_krw", return_value=None):
            with patch("data_cache.fetch_upbit.fetch_usd_krw_rate", return_value=1300.0):
                result = calc_kimchi_premium(binance_btc_usdt=76_000.0)
        assert result == {"kimchi_premium_pct": 0.0}

    def test_zero_binance_price_returns_zero(self):
        result = calc_kimchi_premium(binance_btc_usdt=0.0)
        assert result == {"kimchi_premium_pct": 0.0}


class TestOINormalizedCVD:
    def test_normal_ratio(self):
        result = calc_oi_normalized_cvd(cvd=1_000_000.0, oi=10_000_000.0)
        assert result["oi_normalized_cvd"] == pytest.approx(0.1, rel=1e-4)

    def test_zero_oi_returns_zero(self):
        result = calc_oi_normalized_cvd(cvd=1_000_000.0, oi=0.0)
        assert result == {"oi_normalized_cvd": 0.0}

    def test_clamped_high(self):
        result = calc_oi_normalized_cvd(cvd=100.0, oi=0.001)
        assert result["oi_normalized_cvd"] == 5.0

    def test_clamped_low(self):
        result = calc_oi_normalized_cvd(cvd=-100.0, oi=0.001)
        assert result["oi_normalized_cvd"] == -5.0
