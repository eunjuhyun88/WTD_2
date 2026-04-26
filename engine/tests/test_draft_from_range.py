"""Unit tests for POST /patterns/draft-from-range (A-04-eng).

Tests verify:
- feature_windows SQLite rows → features dict extraction
- PatternDraftBody shape and field presence
- null-safe partial extraction (btc_corr, venue_div always None)
- 400 on invalid range (end_ts <= start_ts)
- 404 when no feature_windows rows exist for the range
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.routes import patterns as pattern_routes
from api.routes.patterns import (
    RangeRequest,
    _extract_12_features,
    _aggregate_feature_windows,
    _query_feature_windows_range,
)


# ── Helpers ────────────────────────────────────────────────────────────────


def _make_client() -> TestClient:
    app = FastAPI()
    app.include_router(pattern_routes.router, prefix="/patterns")
    return TestClient(app)


def _make_feature_window_row(**overrides: Any) -> dict[str, Any]:
    """Build a minimal feature_window row dict with sensible defaults."""
    base: dict[str, Any] = {
        "venue": "binance",
        "symbol": "BTCUSDT",
        "timeframe": "1h",
        "window_start_ts": "2023-11-14T00:00:00+00:00",
        "window_end_ts": "2023-11-14T01:00:00+00:00",
        "return_pct": 0.012,
        "oi_change_pct": 0.05,
        "funding_rate_last": 0.001,
        "cvd_delta": 500.0,
        "liq_imbalance": 0.3,
        "volume_zscore": 1.2,
        "higher_low_count": 2,
        "higher_high_count": 1,
        "compression_ratio": 0.8,
        "absorption_flag": 1,
        "trend_regime": "uptrend",
        "volatility_regime": "low",
    }
    base.update(overrides)
    return base


# ── _aggregate_feature_windows unit tests ─────────────────────────────────


def test_aggregate_empty_rows():
    """Empty rows list returns empty dict."""
    result = _aggregate_feature_windows([])
    assert result == {}


def test_aggregate_single_row_keys():
    """Aggregated dict contains expected keys."""
    row = _make_feature_window_row()
    result = _aggregate_feature_windows([row])
    assert "oi_change_pct" in result
    assert "funding_rate_last" in result
    assert "cvd_delta" in result
    assert "return_pct" in result
    assert "volume_zscore" in result
    assert "_higher_lows" in result
    assert "_lower_highs" in result
    assert "_compression" in result
    assert "_smart_money" in result


def test_aggregate_higher_lows_derived():
    """higher_low_count > 0 → _higher_lows is True."""
    row = _make_feature_window_row(higher_low_count=3)
    result = _aggregate_feature_windows([row])
    assert result["_higher_lows"] is True


def test_aggregate_compression_derived():
    """compression_ratio <= 1 → _compression is True."""
    row = _make_feature_window_row(compression_ratio=0.7)
    result = _aggregate_feature_windows([row])
    assert result["_compression"] is True


def test_aggregate_compression_off():
    """compression_ratio > 1 → _compression is False."""
    row = _make_feature_window_row(compression_ratio=1.5)
    result = _aggregate_feature_windows([row])
    assert result["_compression"] is False


def test_aggregate_multiple_rows_avg():
    """Multiple rows: return_pct is summed, volume_zscore is averaged."""
    rows = [
        _make_feature_window_row(return_pct=0.01, volume_zscore=1.0),
        _make_feature_window_row(return_pct=0.02, volume_zscore=2.0),
    ]
    result = _aggregate_feature_windows(rows)
    assert abs(result["return_pct"] - 0.03) < 1e-9
    assert abs(result["volume_zscore"] - 1.5) < 1e-9


# ── _extract_12_features unit tests ───────────────────────────────────────


def test_extract_12_features_keys():
    """All 12 feature keys must be present in output."""
    row = _make_feature_window_row()
    fw = _aggregate_feature_windows([row])
    features = _extract_12_features(fw)

    expected_keys = {
        "oi_change", "funding", "cvd", "liq_volume",
        "price", "volume", "btc_corr",
        "higher_lows", "lower_highs", "compression",
        "smart_money", "venue_div",
    }
    assert set(features.keys()) == expected_keys


def test_extract_12_features_btc_corr_and_venue_div_always_none():
    """btc_corr and venue_div require cross-symbol data — must always be None."""
    row = _make_feature_window_row()
    fw = _aggregate_feature_windows([row])
    features = _extract_12_features(fw)
    assert features["btc_corr"] is None
    assert features["venue_div"] is None


def test_extract_12_features_price_is_float_or_none():
    """price feature must be float or None (not an error)."""
    row = _make_feature_window_row(return_pct=0.05)
    fw = _aggregate_feature_windows([row])
    features = _extract_12_features(fw)
    if features["price"] is not None:
        assert isinstance(features["price"], float)


def test_extract_12_features_booleans_are_bool_or_none():
    """higher_lows, lower_highs, compression, smart_money must be bool or None."""
    row = _make_feature_window_row()
    fw = _aggregate_feature_windows([row])
    features = _extract_12_features(fw)
    for key in ("higher_lows", "lower_highs", "compression", "smart_money"):
        val = features[key]
        assert val is None or isinstance(val, bool), f"{key}={val!r} is not bool or None"


def test_extract_12_features_with_oi_and_funding():
    """When OI and funding values are present, those fields are non-None."""
    row = _make_feature_window_row(oi_change_pct=0.04, funding_rate_last=0.002)
    fw = _aggregate_feature_windows([row])
    features = _extract_12_features(fw)
    assert features["oi_change"] is not None
    assert isinstance(features["oi_change"], float)
    assert features["funding"] is not None
    assert isinstance(features["funding"], float)


def test_extract_12_features_missing_columns_are_none():
    """Rows missing optional columns produce None for those features."""
    row = _make_feature_window_row()
    # Remove optional columns
    for k in ("oi_change_pct", "funding_rate_last", "cvd_delta", "liq_imbalance"):
        row.pop(k, None)
    fw = _aggregate_feature_windows([row])
    features = _extract_12_features(fw)
    assert features["oi_change"] is None
    assert features["funding"] is None
    assert features["cvd"] is None
    assert features["liq_volume"] is None


# ── Route integration tests ────────────────────────────────────────────────


def _patch_query(rows: list[dict[str, Any]]):
    """Context manager patching _query_feature_windows_range."""
    return patch(
        "api.routes.patterns._query_feature_windows_range",
        return_value=rows,
    )


def test_draft_from_range_returns_pattern_draft_body():
    """POST /patterns/draft-from-range returns a valid PatternDraftBody."""
    client = _make_client()
    row = _make_feature_window_row()
    with _patch_query([row]):
        resp = client.post(
            "/patterns/draft-from-range",
            json={
                "symbol": "BTCUSDT",
                "start_ts": 1700000000,
                "end_ts": 1700003600,
            },
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Required PatternDraftBody fields
    assert data["pattern_family"] == "chart_drag"
    assert data["source_type"] == "chart_drag"
    assert "BTCUSDT" in data["symbol_candidates"]
    assert isinstance(data["thesis"], list)
    assert isinstance(data["phases"], list)
    assert len(data["phases"]) >= 1


def test_draft_from_range_trade_plan_has_features():
    """trade_plan.features must contain all 12 feature keys."""
    client = _make_client()
    row = _make_feature_window_row(symbol="ETHUSDT")
    with _patch_query([row]):
        resp = client.post(
            "/patterns/draft-from-range",
            json={
                "symbol": "ETHUSDT",
                "start_ts": 1700000000,
                "end_ts": 1700007200,
                "timeframe": "1h",
            },
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    features = data["trade_plan"]["features"]
    expected_keys = {
        "oi_change", "funding", "cvd", "liq_volume",
        "price", "volume", "btc_corr",
        "higher_lows", "lower_highs", "compression",
        "smart_money", "venue_div",
    }
    assert set(features.keys()) == expected_keys


def test_draft_from_range_null_features_in_ambiguities():
    """Null features (btc_corr, venue_div) appear in ambiguities list."""
    client = _make_client()
    row = _make_feature_window_row()
    with _patch_query([row]):
        resp = client.post(
            "/patterns/draft-from-range",
            json={
                "symbol": "BTCUSDT",
                "start_ts": 1700000000,
                "end_ts": 1700003600,
            },
        )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    # btc_corr and venue_div are always null
    assert "btc_corr" in data["ambiguities"]
    assert "venue_div" in data["ambiguities"]


def test_draft_from_range_invalid_range_returns_400():
    """end_ts <= start_ts must return HTTP 400."""
    client = _make_client()
    resp = client.post(
        "/patterns/draft-from-range",
        json={
            "symbol": "BTCUSDT",
            "start_ts": 1700003600,
            "end_ts": 1700000000,  # end before start
        },
    )
    assert resp.status_code == 400
    assert "end_ts" in resp.json()["detail"].lower()


def test_draft_from_range_no_data_returns_404():
    """Empty feature_windows result for range returns HTTP 404."""
    client = _make_client()
    with _patch_query([]):
        resp = client.post(
            "/patterns/draft-from-range",
            json={
                "symbol": "BTCUSDT",
                "start_ts": 1700000000,
                "end_ts": 1700003600,
            },
        )
    assert resp.status_code == 404
    assert "feature_windows" in resp.json()["detail"].lower()


def test_draft_from_range_schema_version_is_1():
    """schema_version must be 1."""
    client = _make_client()
    row = _make_feature_window_row()
    with _patch_query([row]):
        resp = client.post(
            "/patterns/draft-from-range",
            json={
                "symbol": "BTCUSDT",
                "start_ts": 1700000000,
                "end_ts": 1700003600,
            },
        )
    assert resp.status_code == 200
    assert resp.json()["schema_version"] == 1
