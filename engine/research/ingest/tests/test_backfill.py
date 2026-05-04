"""Tests for backfill module — no live calls, uses tmp_path for parquet I/O."""
from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pandas as pd
import pytest

from engine.research.ingest.backfill import (
    _tf_to_ms,
    _upsert_parquet,
    verify_ohlcv,
)
from engine.research.ingest.tests.fixtures import (
    _T0,
    make_klines_fixture,
    make_oi_fixture,
    make_funding_fixture,
)

# ── _tf_to_ms ──────────────────────────────────────────────────────────────────


def test_tf_to_ms_1h() -> None:
    assert _tf_to_ms("1h") == 3_600_000


def test_tf_to_ms_1d() -> None:
    assert _tf_to_ms("1d") == 86_400_000


def test_tf_to_ms_unknown_raises() -> None:
    with pytest.raises(ValueError):
        _tf_to_ms("99x")


# ── _upsert_parquet ────────────────────────────────────────────────────────────


def test_upsert_creates_new_file(tmp_path: Path) -> None:
    p = tmp_path / "test.parquet"
    df = pd.DataFrame({"ts_ms": [_T0, _T0 + 3_600_000], "value": [1.0, 2.0]})
    result = _upsert_parquet(p, df)
    assert p.exists()
    assert len(result) == 2


def test_upsert_deduplicates(tmp_path: Path) -> None:
    p = tmp_path / "test.parquet"
    df1 = pd.DataFrame({"ts_ms": [_T0, _T0 + 3_600_000], "value": [1.0, 2.0]})
    _upsert_parquet(p, df1)
    # Same rows again — should not duplicate
    result = _upsert_parquet(p, df1)
    assert len(result) == 2


def test_upsert_appends_new_rows(tmp_path: Path) -> None:
    p = tmp_path / "test.parquet"
    df1 = pd.DataFrame({"ts_ms": [_T0, _T0 + 3_600_000], "value": [1.0, 2.0]})
    df2 = pd.DataFrame({"ts_ms": [_T0 + 7_200_000], "value": [3.0]})
    _upsert_parquet(p, df1)
    result = _upsert_parquet(p, df2)
    assert len(result) == 3


def test_upsert_sorted_by_ts(tmp_path: Path) -> None:
    p = tmp_path / "test.parquet"
    # Insert in reverse order
    df = pd.DataFrame({
        "ts_ms": [_T0 + 7_200_000, _T0, _T0 + 3_600_000],
        "value": [3.0, 1.0, 2.0],
    })
    result = _upsert_parquet(p, df)
    assert result["ts_ms"].is_monotonic_increasing


# ── verify_ohlcv ───────────────────────────────────────────────────────────────


def _make_klines_df(n: int) -> "pd.DataFrame":
    """Build a klines DataFrame using the fixture + parser (no HTTP)."""
    from engine.research.ingest.binance_perp import fetch_klines_range
    rows = make_klines_fixture(n=n)
    # end_ms = last row open_time so the pagination loop exits after 1 call
    end_ms = _T0 + (n - 1) * 3_600_000
    with patch("engine.research.ingest.binance_perp._fetch_json", return_value=rows):
        return fetch_klines_range("BTCUSDT", "1h", _T0, end_ms)


def test_verify_passes_good_data() -> None:
    # 30 days of 1h data = 720 rows
    df = _make_klines_df(720)
    result = verify_ohlcv(df, "BTCUSDT", "1h", 30)
    assert result["pass"], f"Verification failed: {result['issues']}"


def test_verify_fails_empty_df() -> None:
    df = pd.DataFrame(
        columns=["ts_ms", "open", "high", "low", "close", "volume",
                 "quote_volume", "trades", "taker_buy_volume", "taker_buy_quote"]
    )
    result = verify_ohlcv(df, "BTCUSDT", "1h", 30)
    assert not result["pass"]
    assert any("empty" in issue.lower() for issue in result["issues"])


def test_verify_fails_nulls_in_ohlc() -> None:
    df = _make_klines_df(720)
    # Introduce nulls
    df.loc[5, "close"] = float("nan")
    result = verify_ohlcv(df, "BTCUSDT", "1h", 30)
    assert not result["pass"]
    assert any("null" in issue.lower() for issue in result["issues"])


def test_verify_fails_non_monotonic_ts() -> None:
    df = _make_klines_df(720)
    # Scramble ts_ms
    df = df.sample(frac=1, random_state=42).reset_index(drop=True)
    result = verify_ohlcv(df, "BTCUSDT", "1h", 30)
    assert not result["pass"]
