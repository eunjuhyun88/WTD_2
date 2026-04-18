"""Tests for absorption_signal and alt_btc_accel_ratio building blocks."""
from __future__ import annotations

from contextlib import contextmanager
from unittest.mock import patch

import pandas as pd
import pytest

from building_blocks.context import Context
from building_blocks.confirmations.absorption_signal import absorption_signal
from building_blocks.confirmations.alt_btc_accel_ratio import alt_btc_accel_ratio

_ALT_BTC_MODULE = "building_blocks.confirmations.alt_btc_accel_ratio._load_btc_klines"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _make_index(n: int) -> pd.DatetimeIndex:
    return pd.date_range("2026-04-01", periods=n, freq="h", tz="UTC")


def _ctx(
    klines: pd.DataFrame,
    features: pd.DataFrame | None = None,
) -> Context:
    if features is None:
        features = pd.DataFrame(
            {"funding_rate": [0.0] * len(klines)},
            index=klines.index,
        )
    return Context(klines=klines, features=features, symbol="TESTUSDT")


def _klines(
    close: list[float],
    taker_buy_ratio: list[float],  # fraction of volume that is taker buy
    volume: float = 1_000_000.0,
) -> pd.DataFrame:
    n = len(close)
    idx = _make_index(n)
    tbv = [volume * r for r in taker_buy_ratio]
    return pd.DataFrame(
        {
            "open": close,
            "high": [c * 1.001 for c in close],
            "low": [c * 0.999 for c in close],
            "close": close,
            "volume": [volume] * n,
            "taker_buy_base_volume": tbv,
        },
        index=idx,
    )


# ---------------------------------------------------------------------------
# absorption_signal tests
# ---------------------------------------------------------------------------

class TestAbsorptionSignal:
    def test_heavy_buying_flat_price_triggers(self) -> None:
        """High taker-buy ratio + price not moving → absorption detected."""
        price = [10.0] * 10          # flat price
        tbr = [0.65] * 10            # 65% taker buy (above 0.55 threshold)
        kl = _klines(price, tbr)
        result = absorption_signal(_ctx(kl), cvd_window=5, price_move_threshold=0.005)
        # Last bar should be True (flat price + heavy buying)
        assert bool(result.iloc[-1]) is True

    def test_price_moving_up_not_absorption(self) -> None:
        """Price moving up despite heavy buying → not absorption (normal squeeze)."""
        # Price rises 2% over 5 bars
        price = [10.0, 10.04, 10.08, 10.12, 10.16, 10.20, 10.24, 10.28, 10.32, 10.36]
        tbr = [0.65] * 10
        kl = _klines(price, tbr)
        result = absorption_signal(_ctx(kl), cvd_window=5, price_move_threshold=0.005)
        assert bool(result.iloc[-1]) is False

    def test_light_buying_not_absorption(self) -> None:
        """Flat price but taker-buy below threshold → not absorption."""
        price = [10.0] * 10
        tbr = [0.45] * 10           # selling pressure
        kl = _klines(price, tbr)
        result = absorption_signal(_ctx(kl), cvd_window=5, price_move_threshold=0.005)
        assert bool(result.iloc[-1]) is False

    def test_early_bars_nan_filled_false(self) -> None:
        """Fewer bars than cvd_window → False (not enough data)."""
        price = [10.0] * 3
        tbr = [0.65] * 3
        kl = _klines(price, tbr)
        result = absorption_signal(_ctx(kl), cvd_window=5, price_move_threshold=0.005)
        # All bars should be False since window=5 > 3 bars
        assert result.sum() == 0

    def test_custom_thresholds(self) -> None:
        """Custom cvd_buy_threshold and price_move_threshold respected."""
        price = [10.0] * 10
        tbr = [0.62] * 10           # above 0.60 but below 0.65
        kl = _klines(price, tbr)
        result_strict = absorption_signal(
            _ctx(kl), cvd_window=5, cvd_buy_threshold=0.65, price_move_threshold=0.005
        )
        result_lenient = absorption_signal(
            _ctx(kl), cvd_window=5, cvd_buy_threshold=0.60, price_move_threshold=0.005
        )
        assert bool(result_strict.iloc[-1]) is False
        assert bool(result_lenient.iloc[-1]) is True

    def test_returns_bool_series_aligned_to_features(self) -> None:
        """Return type is pd.Series[bool], index matches features.index."""
        price = [10.0] * 10
        tbr = [0.60] * 10
        kl = _klines(price, tbr)
        ctx = _ctx(kl)
        result = absorption_signal(ctx)
        assert isinstance(result, pd.Series)
        assert result.dtype == bool
        assert list(result.index) == list(ctx.features.index)

    def test_invalid_cvd_window_raises(self) -> None:
        price = [10.0] * 5
        tbr = [0.6] * 5
        kl = _klines(price, tbr)
        with pytest.raises(ValueError, match="cvd_window"):
            absorption_signal(_ctx(kl), cvd_window=1)

    def test_invalid_cvd_buy_threshold_raises(self) -> None:
        price = [10.0] * 5
        tbr = [0.6] * 5
        kl = _klines(price, tbr)
        with pytest.raises(ValueError, match="cvd_buy_threshold"):
            absorption_signal(_ctx(kl), cvd_buy_threshold=1.5)

    def test_invalid_price_move_threshold_raises(self) -> None:
        price = [10.0] * 5
        tbr = [0.6] * 5
        kl = _klines(price, tbr)
        with pytest.raises(ValueError, match="price_move_threshold"):
            absorption_signal(_ctx(kl), price_move_threshold=0.0)

    def test_zero_volume_bars_handled(self) -> None:
        """Zero volume bars (tbv=0) should not crash — treated as neutral."""
        price = [10.0] * 10
        n = 10
        idx = _make_index(n)
        kl = pd.DataFrame(
            {
                "open": price,
                "high": [p * 1.001 for p in price],
                "low": [p * 0.999 for p in price],
                "close": price,
                "volume": [0.0] * n,
                "taker_buy_base_volume": [0.0] * n,
            },
            index=idx,
        )
        # Should not raise
        result = absorption_signal(_ctx(kl))
        assert isinstance(result, pd.Series)

    def test_mixed_bars_partial_absorption(self) -> None:
        """Only last few bars have absorption — earlier bars should be False."""
        price = [10.0, 10.5, 11.0, 11.5, 10.0, 10.0, 10.0, 10.0, 10.0, 10.0]
        tbr   = [0.40, 0.40, 0.40, 0.40, 0.65, 0.65, 0.65, 0.65, 0.65, 0.65]
        kl = _klines(price, tbr)
        result = absorption_signal(_ctx(kl), cvd_window=5, price_move_threshold=0.005)
        # Earlier bars (price moving) → False; later bars (flat + buying) → True
        assert bool(result.iloc[-1]) is True
        assert bool(result.iloc[0]) is False


# ---------------------------------------------------------------------------
# alt_btc_accel_ratio tests  (mock BTC cache — avoids disk dependency)
# ---------------------------------------------------------------------------

def _btc_klines(volumes: list[float], index: pd.DatetimeIndex) -> pd.DataFrame:
    """Minimal BTC klines stub with only volume column needed."""
    return pd.DataFrame(
        {
            "open": [50000.0] * len(volumes),
            "high": [50100.0] * len(volumes),
            "low": [49900.0] * len(volumes),
            "close": [50000.0] * len(volumes),
            "volume": volumes,
            "taker_buy_base_volume": [v * 0.5 for v in volumes],
        },
        index=index,
    )


class TestAltBtcAccelRatio:
    """All tests patch _load_btc_klines to avoid hitting the disk cache."""

    def _with_btc(self, btc_vols: list[float], n: int):
        """Context manager that patches BTC loader with given volumes."""
        idx = _make_index(n)
        btc_df = _btc_klines(btc_vols, idx)
        return patch(_ALT_BTC_MODULE, return_value=btc_df)

    def test_alt_accelerating_faster_than_btc(self) -> None:
        """Alt volume 3× baseline in last window=5 while slow (2×window=10) is lower.

        For acceleration to fire at the last bar:
          fast(5) = mean of bars[-5:] = 300
          slow(10) = mean of bars[-10:] = mean([100]*5 + [300]*5) = 200
          alt_accel = 300/200 = 1.5 >= 1.2 * btc_accel(1.0) → True
        """
        n = 20
        # Alt: baseline for 15 bars, then 3× spike in LAST 5 bars only
        alt_vol = [100.0] * 15 + [300.0] * 5
        idx = _make_index(n)
        alt_kl = pd.DataFrame(
            {
                "open": [10.0] * n, "high": [10.1] * n, "low": [9.9] * n,
                "close": [10.0] * n, "volume": alt_vol,
                "taker_buy_base_volume": [v * 0.5 for v in alt_vol],
            },
            index=idx,
        )
        btc_vol = [100.0] * n  # BTC flat — no acceleration

        with self._with_btc(btc_vol, n):
            result = alt_btc_accel_ratio(_ctx(alt_kl), ratio_threshold=1.2, window=5)
        assert bool(result.iloc[-1]) is True

    def test_btc_accelerating_same_rate_not_triggered(self) -> None:
        """Both alt and BTC accelerate equally → ratio = 1.0 < 1.2 → False."""
        n = 20
        shared_vol = [100.0] * 10 + [200.0] * 10  # both double
        idx = _make_index(n)
        alt_kl = pd.DataFrame(
            {
                "open": [10.0] * n, "high": [10.1] * n, "low": [9.9] * n,
                "close": [10.0] * n, "volume": shared_vol,
                "taker_buy_base_volume": [v * 0.5 for v in shared_vol],
            },
            index=idx,
        )
        with self._with_btc(shared_vol, n):
            result = alt_btc_accel_ratio(_ctx(alt_kl), ratio_threshold=1.2, window=5)
        assert bool(result.iloc[-1]) is False

    def test_alt_flat_btc_accelerating_not_triggered(self) -> None:
        """BTC pumps while alt is flat → ratio < 1 → False."""
        n = 20
        alt_vol = [100.0] * n        # flat
        btc_vol = [100.0] * 10 + [300.0] * 10  # BTC accelerating
        idx = _make_index(n)
        alt_kl = pd.DataFrame(
            {
                "open": [10.0] * n, "high": [10.1] * n, "low": [9.9] * n,
                "close": [10.0] * n, "volume": alt_vol,
                "taker_buy_base_volume": [v * 0.5 for v in alt_vol],
            },
            index=idx,
        )
        with self._with_btc(btc_vol, n):
            result = alt_btc_accel_ratio(_ctx(alt_kl), ratio_threshold=1.2, window=5)
        assert bool(result.iloc[-1]) is False

    def test_returns_bool_series_aligned_to_features(self) -> None:
        n = 20
        alt_vol = [100.0] * n
        idx = _make_index(n)
        alt_kl = pd.DataFrame(
            {
                "open": [10.0] * n, "high": [10.1] * n, "low": [9.9] * n,
                "close": [10.0] * n, "volume": alt_vol,
                "taker_buy_base_volume": [v * 0.5 for v in alt_vol],
            },
            index=idx,
        )
        ctx = _ctx(alt_kl)
        with self._with_btc(alt_vol, n):
            result = alt_btc_accel_ratio(ctx)
        assert isinstance(result, pd.Series)
        assert result.dtype == bool
        assert list(result.index) == list(ctx.features.index)

    def test_invalid_ratio_threshold_raises(self) -> None:
        n = 10
        idx = _make_index(n)
        alt_kl = pd.DataFrame(
            {"open": [1.0]*n, "high": [1.0]*n, "low": [1.0]*n,
             "close": [1.0]*n, "volume": [1000.0]*n,
             "taker_buy_base_volume": [500.0]*n},
            index=idx,
        )
        with self._with_btc([1000.0]*n, n):
            with pytest.raises(ValueError, match="ratio_threshold"):
                alt_btc_accel_ratio(_ctx(alt_kl), ratio_threshold=0.0)

    def test_invalid_window_raises(self) -> None:
        n = 10
        idx = _make_index(n)
        alt_kl = pd.DataFrame(
            {"open": [1.0]*n, "high": [1.0]*n, "low": [1.0]*n,
             "close": [1.0]*n, "volume": [1000.0]*n,
             "taker_buy_base_volume": [500.0]*n},
            index=idx,
        )
        with self._with_btc([1000.0]*n, n):
            with pytest.raises(ValueError, match="window"):
                alt_btc_accel_ratio(_ctx(alt_kl), window=1)
