"""Tests for data_cache loader.

No network I/O — we monkeypatch CACHE_DIR to a tmp_path and seed/read
files directly. Covers:
  1. offline=True + missing file → CacheMiss
  2. offline=True + cached file  → returns DataFrame with expected shape
  3. non-1h timeframe            → resample from 1h base (CacheMiss if 1h absent)
  4. unknown timeframe string    → ValueError
  5. cache_path filename shape
  6. round-trip through load_klines preserves numeric columns
"""
from __future__ import annotations

import pandas as pd
import pytest

from data_cache import CacheMiss, cache_path, load_klines
from data_cache import loader as loader_mod


def _make_fake_klines(n: int = 5) -> pd.DataFrame:
    ts = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    return pd.DataFrame(
        {
            "open": [1.0 + i * 0.1 for i in range(n)],
            "high": [1.1 + i * 0.1 for i in range(n)],
            "low": [0.9 + i * 0.1 for i in range(n)],
            "close": [1.05 + i * 0.1 for i in range(n)],
            "volume": [100.0 + i * 10 for i in range(n)],
            "taker_buy_base_volume": [50.0 + i * 5 for i in range(n)],
        },
        index=pd.Index(ts, name="timestamp"),
    )


def test_cache_path_filename_shape(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CACHE_DIR", tmp_path)
    p = cache_path("BTCUSDT", "1h")
    assert p.name == "BTCUSDT_1h.csv"
    assert p.parent == tmp_path


def test_offline_raises_on_missing_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CACHE_DIR", tmp_path)
    with pytest.raises(CacheMiss):
        load_klines("NOPEPAIR", "1h", offline=True)


def test_offline_reads_existing_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(loader_mod, "CACHE_DIR", tmp_path)
    df = _make_fake_klines(5)
    df.to_csv(tmp_path / "FAKEUSDT_1h.csv")

    out = load_klines("FAKEUSDT", "1h", offline=True)
    assert len(out) == 5
    assert list(out.columns) == list(df.columns)
    assert out["close"].iloc[-1] == pytest.approx(df["close"].iloc[-1])
    assert out["taker_buy_base_volume"].iloc[0] == pytest.approx(50.0)


def test_non_1h_timeframe_resamples_from_1h_base(tmp_path, monkeypatch):
    """4h / 1d etc. are now derived from 1h on the fly.

    When offline=True and the 1h cache is missing, we get CacheMiss (not
    NotImplementedError). When the 1h cache is present, resampling succeeds.
    """
    # 1) 1h base not cached → CacheMiss
    monkeypatch.setattr(loader_mod, "CACHE_DIR", tmp_path)
    with pytest.raises(CacheMiss):
        load_klines("BTCUSDT", "4h", offline=True)

    # 2) Seed 1h cache → resample to 4h succeeds
    n = 12  # 12 × 1h bars → 3 × 4h bars
    df_1h = _make_fake_klines(n)
    csv_path = tmp_path / "BTCUSDT_1h.csv"
    df_1h.index.name = "timestamp"
    df_1h.to_csv(csv_path)

    df_4h = load_klines("BTCUSDT", "4h", offline=True)
    assert len(df_4h) == 3  # 12 / 4 = 3 bars
    assert list(df_4h.columns) == list(df_1h.columns)


def test_unknown_timeframe_raises_value_error():
    """Completely unknown TF strings raise ValueError from tf_string_to_minutes."""
    with pytest.raises(ValueError):
        load_klines("BTCUSDT", "99h", offline=True)
    with pytest.raises(ValueError):
        load_klines("BTCUSDT", "garbage", offline=True)


def test_offline_flag_is_keyword_only():
    # Positional offline= should fail loudly — we want prepare.py callers
    # to be explicit about offline vs online mode.
    with pytest.raises(TypeError):
        load_klines("BTCUSDT", "1h", True)  # type: ignore[misc]
