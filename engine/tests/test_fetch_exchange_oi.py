"""Tests for fetch_exchange_oi — multi-exchange OI aggregation."""
from __future__ import annotations

from unittest.mock import patch

import pandas as pd
import pytest

from data_cache.fetch_exchange_oi import fetch_exchange_oi


import time as _time

def _recent_ts(n: int = 5) -> int:
    """Base timestamp: n hours ago from now."""
    return int((_time.time() - n * 3600) * 1000)


def _make_binance_response(n: int = 5) -> list[dict]:
    base = _recent_ts(n)
    return [
        {
            "timestamp": str(base + i * 3_600_000),
            "sumOpenInterest": "1000",
            "sumOpenInterestValue": str(80_000_000 + i * 1_000_000),
        }
        for i in range(n)
    ]


def _make_bybit_response(n: int = 5) -> dict:
    base = _recent_ts(n)
    return {
        "retCode": 0,
        "result": {
            "list": [
                {"openInterest": "1000", "timestamp": str(base + i * 3_600_000)}
                for i in range(n)
            ]
        },
    }


def test_merges_binance_and_bybit(monkeypatch):
    def fake_get_json(url, headers=None):
        if "binance" in url or "fapi" in url:
            return _make_binance_response()
        if "bybit" in url and "tickers" in url:
            return {"result": {"list": [{"lastPrice": "80000"}]}}
        if "bybit" in url:
            return _make_bybit_response()
        return None

    with patch("data_cache.fetch_exchange_oi._get_json", side_effect=fake_get_json):
        df = fetch_exchange_oi("BTCUSDT", days=3)

    assert df is not None
    assert "binance_oi" in df.columns
    assert "bybit_oi" in df.columns
    assert "total_perp_oi" in df.columns
    assert (df["total_perp_oi"] > 0).any()


def test_total_is_sum_of_exchanges(monkeypatch):
    def fake_get_json(url, headers=None):
        if "fapi" in url:
            return _make_binance_response(3)
        if "bybit" in url and "tickers" in url:
            return {"result": {"list": [{"lastPrice": "80000"}]}}
        if "bybit" in url:
            return _make_bybit_response(3)
        return None

    with patch("data_cache.fetch_exchange_oi._get_json", side_effect=fake_get_json):
        df = fetch_exchange_oi("BTCUSDT", days=3)

    assert df is not None
    # total = binance + bybit + okx (okx=0 here)
    computed = df["binance_oi"] + df["bybit_oi"] + df["okx_oi"]
    pd.testing.assert_series_equal(df["total_perp_oi"], computed, check_names=False)


def test_graceful_on_all_failure(monkeypatch):
    with patch("data_cache.fetch_exchange_oi._get_json", return_value=None):
        result = fetch_exchange_oi("BTCUSDT", days=3)
    assert result is None


def test_concentration_is_1_when_single_source(monkeypatch):
    def fake_get_json(url, headers=None):
        if "fapi" in url:
            return _make_binance_response(3)
        return None  # bybit and okx fail

    with patch("data_cache.fetch_exchange_oi._get_json", side_effect=fake_get_json):
        df = fetch_exchange_oi("BTCUSDT", days=3)

    assert df is not None
    # Only binance contributed, so conc = binance / total = 1.0
    assert (df["oi_exchange_conc"] == 1.0).all()


def test_pct_changes_computed(monkeypatch):
    def fake_get_json(url, headers=None):
        if "fapi" in url:
            return _make_binance_response(30)
        if "bybit" in url and "tickers" in url:
            return {"result": {"list": [{"lastPrice": "80000"}]}}
        if "bybit" in url:
            return _make_bybit_response(30)
        return None

    with patch("data_cache.fetch_exchange_oi._get_json", side_effect=fake_get_json):
        df = fetch_exchange_oi("BTCUSDT", days=5)

    assert df is not None
    assert "total_oi_change_1h" in df.columns
    assert "total_oi_change_24h" in df.columns


def test_cme_placeholder_is_zero(monkeypatch):
    def fake_get_json(url, headers=None):
        if "fapi" in url:
            return _make_binance_response(3)
        return None

    with patch("data_cache.fetch_exchange_oi._get_json", side_effect=fake_get_json):
        df = fetch_exchange_oi("BTCUSDT", days=3)

    assert df is not None
    assert (df["cme_oi"] == 0.0).all()
