"""Tests for binance_perp HTTP client — no live calls (fixtures + monkeypatching)."""
from __future__ import annotations

from unittest.mock import patch

import pandas as pd
import pytest

from engine.research.ingest.binance_perp import (
    fetch_funding_range,
    fetch_klines_range,
    fetch_oi_range,
)
from engine.research.ingest.tests.fixtures import (
    _T0,
    _1H_MS,
    make_funding_fixture,
    make_klines_fixture,
    make_oi_fixture,
)


# ── Klines ─────────────────────────────────────────────────────────────────────


def _end_ms(n: int, interval_ms: int = _1H_MS) -> int:
    """Return end_ms that exactly matches the last fixture row to avoid infinite loop."""
    return _T0 + (n - 1) * interval_ms


def test_fetch_klines_returns_correct_columns() -> None:
    n = 3
    fixture = make_klines_fixture(n=n)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_klines_range("BTCUSDT", "1h", _T0, _end_ms(n))
    expected_cols = {
        "ts_ms", "open", "high", "low", "close", "volume",
        "quote_volume", "trades", "taker_buy_volume", "taker_buy_quote",
    }
    assert set(df.columns) == expected_cols


def test_fetch_klines_row_count() -> None:
    n = 5
    fixture = make_klines_fixture(n=n)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_klines_range("BTCUSDT", "1h", _T0, _end_ms(n))
    assert len(df) == 5


def test_fetch_klines_monotonic_ts() -> None:
    n = 10
    fixture = make_klines_fixture(n=n)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_klines_range("BTCUSDT", "1h", _T0, _end_ms(n))
    assert df["ts_ms"].is_monotonic_increasing


def test_fetch_klines_no_nulls_in_ohlc() -> None:
    n = 8
    fixture = make_klines_fixture(n=n)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_klines_range("BTCUSDT", "1h", _T0, _end_ms(n))
    for col in ["open", "high", "low", "close"]:
        assert df[col].isna().sum() == 0, f"Null values in {col}"


def test_fetch_klines_empty_response() -> None:
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=[]):
        df = fetch_klines_range("BTCUSDT", "1h", _T0, _T0 + 3_600_000)
    assert df.empty


def test_fetch_klines_dtype_float() -> None:
    n = 3
    fixture = make_klines_fixture(n=n)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_klines_range("BTCUSDT", "1h", _T0, _end_ms(n))
    for col in ["open", "high", "low", "close", "volume"]:
        assert df[col].dtype == float, f"{col} should be float"


# ── OI ─────────────────────────────────────────────────────────────────────────


def test_fetch_oi_returns_correct_columns() -> None:
    fixture = make_oi_fixture(n=3)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_oi_range("BTCUSDT", "5m", _T0, _T0 + 10 * 300_000)
    assert set(df.columns) == {"ts_ms", "open_interest", "sum_open_interest_value"}


def test_fetch_oi_row_count() -> None:
    fixture = make_oi_fixture(n=7)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_oi_range("BTCUSDT", "5m", _T0, _T0 + 100 * 300_000)
    assert len(df) == 7


def test_fetch_oi_monotonic_ts() -> None:
    fixture = make_oi_fixture(n=10)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_oi_range("BTCUSDT", "5m", _T0, _T0 + 100 * 300_000)
    assert df["ts_ms"].is_monotonic_increasing


def test_fetch_oi_empty_response() -> None:
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=[]):
        df = fetch_oi_range("BTCUSDT", "5m", _T0, _T0 + 300_000)
    assert df.empty


# ── Funding ────────────────────────────────────────────────────────────────────


def test_fetch_funding_returns_correct_columns() -> None:
    fixture = make_funding_fixture(n=5)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_funding_range("BTCUSDT", _T0, _T0 + 10 * 28_800_000)
    assert set(df.columns) == {"ts_ms", "funding_rate", "mark_price"}


def test_fetch_funding_row_count() -> None:
    fixture = make_funding_fixture(n=6)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_funding_range("BTCUSDT", _T0, _T0 + 100 * 28_800_000)
    assert len(df) == 6


def test_fetch_funding_monotonic_ts() -> None:
    fixture = make_funding_fixture(n=10)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_funding_range("BTCUSDT", _T0, _T0 + 200 * 28_800_000)
    assert df["ts_ms"].is_monotonic_increasing


def test_fetch_funding_no_nulls() -> None:
    fixture = make_funding_fixture(n=4)
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=fixture):
        df = fetch_funding_range("BTCUSDT", _T0, _T0 + 100 * 28_800_000)
    assert df["funding_rate"].isna().sum() == 0
    assert df["mark_price"].isna().sum() == 0


def test_fetch_funding_empty_response() -> None:
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=[]):
        df = fetch_funding_range("BTCUSDT", _T0, _T0 + 28_800_000)
    assert df.empty
