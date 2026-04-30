"""Tests for W-0337: venue funding pipeline + per-venue OI change derivation.

Verifies:
1. fetch_venue_funding returns correct structure with mocked HTTP responses
2. venue_funding_spread_extreme block activates when funding columns present
3. venue_oi_divergence block activates when oi_change_1h columns present
4. feature_calc derives *_oi_change_1h from existing *_oi columns
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
import pytest


# ── fetch_venue_funding unit tests ────────────────────────────────────────────

class TestFetchVenueFunding:
    def _mock_binance_response(self, n: int = 3):
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        interval_ms = 8 * 3600 * 1000
        return [
            {"fundingTime": now_ms - i * interval_ms, "fundingRate": "0.0001"}
            for i in range(n)
        ]

    def _mock_bybit_response(self, n: int = 3):
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        interval_ms = 8 * 3600 * 1000
        return {
            "retCode": 0,
            "result": {
                "list": [
                    {"fundingRateTimestamp": str(now_ms - i * interval_ms), "fundingRate": "0.0002"}
                    for i in range(n)
                ],
                "nextPageCursor": "",
            },
        }

    def _mock_okx_response(self, n: int = 3):
        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
        interval_ms = 8 * 3600 * 1000
        return {
            "code": "0",
            "data": [
                {"fundingTime": str(now_ms - i * interval_ms), "fundingRate": "0.00015"}
                for i in range(n)
            ],
        }

    def test_returns_three_columns(self):
        from data_cache.fetch_venue_funding import fetch_venue_funding

        binance_data = self._mock_binance_response()
        bybit_data = self._mock_bybit_response()
        okx_data = self._mock_okx_response()

        call_count = 0
        def mock_get(url, params=None):
            nonlocal call_count
            call_count += 1
            if "fapi.binance" in url:
                return binance_data
            if "bybit" in url:
                return bybit_data
            if "okx" in url:
                return okx_data
            return []

        with patch("data_cache.fetch_venue_funding._get", side_effect=mock_get):
            df = fetch_venue_funding("BTCUSDT", limit=3)

        assert "binance_funding" in df.columns
        assert "bybit_funding" in df.columns
        assert "okx_funding" in df.columns

    def test_returns_empty_frame_when_all_fail(self):
        from data_cache.fetch_venue_funding import fetch_venue_funding

        with patch("data_cache.fetch_venue_funding._get", return_value=[]):
            df = fetch_venue_funding("BTCUSDT", limit=3)

        assert set(df.columns) == {"binance_funding", "bybit_funding", "okx_funding"}
        assert len(df) == 0

    def test_partial_success_fills_nan_for_missing_venues(self):
        from data_cache.fetch_venue_funding import fetch_venue_funding

        binance_data = self._mock_binance_response(3)

        def mock_get(url, params=None):
            if "fapi.binance" in url:
                return binance_data
            return []

        with patch("data_cache.fetch_venue_funding._get", side_effect=mock_get):
            df = fetch_venue_funding("BTCUSDT", limit=3)

        assert "binance_funding" in df.columns
        assert df["binance_funding"].notna().any()
        # bybit and okx should be NaN (no data)
        assert df["bybit_funding"].isna().all()
        assert df["okx_funding"].isna().all()


# ── venue_funding_spread_extreme block activation ─────────────────────────────

def _make_context(features: pd.DataFrame, symbol: str = "BTCUSDT") -> "Context":
    from building_blocks.context import Context
    klines = pd.DataFrame({
        "open": np.full(len(features), 100.0),
        "high": np.full(len(features), 101.0),
        "low": np.full(len(features), 99.0),
        "close": np.full(len(features), 100.5),
        "volume": np.full(len(features), 1000.0),
        "taker_buy_base_asset_volume": np.full(len(features), 500.0),
    }, index=features.index)
    return Context(klines=klines, features=features, symbol=symbol)


class TestVenueFundingSpreadBlock:
    def _make_ctx(self, binance: float, bybit: float, okx: float):
        idx = pd.date_range("2026-01-01", periods=5, freq="h", tz="UTC")
        features = pd.DataFrame({
            "binance_funding": [binance] * 5,
            "bybit_funding": [bybit] * 5,
            "okx_funding": [okx] * 5,
        }, index=idx)
        return _make_context(features)

    def test_returns_true_when_spread_exceeds_threshold(self):
        from building_blocks.confirmations.venue_funding_spread_extreme import venue_funding_spread_extreme
        ctx = self._make_ctx(binance=0.001, bybit=0.0001, okx=0.0002)
        result = venue_funding_spread_extreme(ctx, spread_threshold=0.0003)
        assert result.all()

    def test_returns_false_when_spread_below_threshold(self):
        from building_blocks.confirmations.venue_funding_spread_extreme import venue_funding_spread_extreme
        ctx = self._make_ctx(binance=0.0001, bybit=0.0001, okx=0.0001)
        result = venue_funding_spread_extreme(ctx, spread_threshold=0.0003)
        assert not result.any()

    def test_graceful_false_when_columns_missing(self):
        from building_blocks.confirmations.venue_funding_spread_extreme import venue_funding_spread_extreme
        idx = pd.date_range("2026-01-01", periods=3, freq="h", tz="UTC")
        ctx = _make_context(pd.DataFrame({"price": [100.0, 101.0, 102.0]}, index=idx))
        result = venue_funding_spread_extreme(ctx)
        assert not result.any()


# ── venue_oi_divergence block activation ─────────────────────────────────────

class TestVenueOiDivergenceBlock:
    def _make_ctx(self, binance: float, bybit: float, okx: float):
        idx = pd.date_range("2026-01-01", periods=5, freq="h", tz="UTC")
        features = pd.DataFrame({
            "binance_oi_change_1h": [binance] * 5,
            "bybit_oi_change_1h": [bybit] * 5,
            "okx_oi_change_1h": [okx] * 5,
        }, index=idx)
        return _make_context(features)

    def test_bear_divergence_detected(self):
        from building_blocks.confirmations.venue_oi_divergence import venue_oi_divergence
        # Bybit leading hot, Binance flat → bear divergence
        ctx = self._make_ctx(binance=0.005, bybit=0.10, okx=0.005)
        result = venue_oi_divergence(ctx, mode="bear_divergence")
        assert result.all()

    def test_no_divergence_when_all_venues_aligned(self):
        from building_blocks.confirmations.venue_oi_divergence import venue_oi_divergence
        ctx = self._make_ctx(binance=0.10, bybit=0.10, okx=0.10)
        result = venue_oi_divergence(ctx, mode="bear_divergence")
        assert not result.any()

    def test_graceful_false_when_columns_missing(self):
        from building_blocks.confirmations.venue_oi_divergence import venue_oi_divergence
        idx = pd.date_range("2026-01-01", periods=3, freq="h", tz="UTC")
        ctx = _make_context(pd.DataFrame({"price": [100.0, 101.0, 102.0]}, index=idx))
        result = venue_oi_divergence(ctx)
        assert not result.any()


# ── feature_calc OI change derivation ────────────────────────────────────────

class TestFeatureCalcOiChangeDerived:
    def _make_klines(self, n: int = 600) -> pd.DataFrame:
        idx = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
        return pd.DataFrame({
            "open": np.full(n, 100.0),
            "high": np.full(n, 101.0),
            "low": np.full(n, 99.0),
            "close": np.linspace(100.0, 110.0, n),
            "volume": np.full(n, 1000.0),
            "taker_buy_base_volume": np.full(n, 500.0),
        }, index=idx)

    def test_oi_change_columns_derived_from_absolute_oi(self):
        """After compute_features_table, *_oi_change_1h columns must exist."""
        from scanner.feature_calc import compute_features_table

        klines = self._make_klines(600)
        daily_idx = pd.date_range("2026-01-01", periods=26, freq="D", tz="UTC")
        onchain = pd.DataFrame({
            "binance_oi": np.linspace(1e9, 1.05e9, 26),
            "bybit_oi":   np.linspace(5e8, 5.2e8, 26),
            "okx_oi":     np.linspace(3e8, 3.1e8, 26),
        }, index=daily_idx)

        df = compute_features_table(klines, symbol="BTCUSDT", onchain=onchain)

        assert "binance_oi_change_1h" in df.columns, "binance_oi_change_1h missing"
        assert "bybit_oi_change_1h" in df.columns, "bybit_oi_change_1h missing"
        assert "okx_oi_change_1h" in df.columns, "okx_oi_change_1h missing"
        for col in ("binance_oi_change_1h", "bybit_oi_change_1h", "okx_oi_change_1h"):
            assert np.isfinite(df[col]).all(), f"{col} has non-finite values"

    def test_oi_change_zero_when_oi_absent(self):
        """When OI columns absent (no onchain bundle), change cols default to 0."""
        from scanner.feature_calc import compute_features_table

        klines = self._make_klines(600)
        df = compute_features_table(klines, symbol="BTCUSDT")

        for col in ("binance_oi_change_1h", "bybit_oi_change_1h", "okx_oi_change_1h"):
            assert col in df.columns
            assert (df[col] == 0.0).all(), f"{col} should be 0 when OI absent"
