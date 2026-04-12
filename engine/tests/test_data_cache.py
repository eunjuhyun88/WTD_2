"""Tests for data_cache loader.

No network I/O — we monkeypatch CACHE_DIR to a tmp_path and seed/read
files directly. Covers:
  1. offline=True + missing file → CacheMiss
  2. offline=True + cached file  → returns DataFrame with expected shape
  3. unsupported timeframe       → NotImplementedError
  4. cache_path filename shape
  5. round-trip through load_klines preserves numeric columns
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


def test_unsupported_timeframe_rejected():
    with pytest.raises(NotImplementedError):
        load_klines("BTCUSDT", "4h", offline=True)
    with pytest.raises(NotImplementedError):
        load_klines("BTCUSDT", "15m", offline=True)


def test_offline_flag_is_keyword_only():
    # Positional offline= should fail loudly — we want prepare.py callers
    # to be explicit about offline vs online mode.
    with pytest.raises(TypeError):
        load_klines("BTCUSDT", "1h", True)  # type: ignore[misc]
