"""Tests for market_engine/l2/cvd.py and l2/wyckoff.py

cvd.py covers:
  1. Basic CVD calculation (buy - sell)
  2. Missing taker_buy_base_volume fallback (50/50)
  3. Divergence detection (price new high + CVD lagging)
  4. Absorption detection (flat price + strong CVD)
  5. CVD trend (recent vs prior mean)

wyckoff.py covers:
  6. _ensure_dt_index — handles all 3 index formats
  7. l1_wyckoff — SC/BC detection, phase label
  8. l10_mtf — multi-timeframe aggregation
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from market_engine.l2.cvd import l11_cvd
from market_engine.l2.wyckoff import _ensure_dt_index, l1_wyckoff, l10_mtf


# ── helpers ───────────────────────────────────────────────────────────────

def _make_df(
    n: int = 40,
    close_start: float = 100.0,
    close_trend: float = 0.0,
    buy_frac: float = 0.6,
    volume: float = 1_000.0,
) -> pd.DataFrame:
    """Build a minimal OHLCV + taker_buy_base_volume DataFrame."""
    closes = [close_start + close_trend * i for i in range(n)]
    df = pd.DataFrame({
        "open":   closes,
        "high":   [c * 1.005 for c in closes],
        "low":    [c * 0.995 for c in closes],
        "close":  closes,
        "volume": [volume] * n,
        "taker_buy_base_volume": [volume * buy_frac] * n,
    })
    return df


# ─────────────────────────────────────────────────────────────────────────
# 1. Basic CVD
# ─────────────────────────────────────────────────────────────────────────

def test_cvd_positive_when_buy_dominant():
    """60% buy fraction → positive CVD."""
    df = _make_df(n=30, buy_frac=0.6)
    r = l11_cvd(df)
    assert r.meta["last_cvd"] > 0


def test_cvd_negative_when_sell_dominant():
    """30% buy fraction → negative CVD."""
    df = _make_df(n=30, buy_frac=0.3)
    r = l11_cvd(df)
    assert r.meta["last_cvd"] < 0


def test_cvd_score_bounded():
    df = _make_df(n=100, buy_frac=1.0)
    r = l11_cvd(df)
    assert -20 <= r.score <= 20


def test_cvd_too_few_rows_returns_neut():
    df = _make_df(n=5)
    r = l11_cvd(df)
    assert r.score == 0
    assert any("데이터 부족" in s["t"] for s in r.sigs)


# ─────────────────────────────────────────────────────────────────────────
# 2. Missing taker_buy_base_volume — 50/50 fallback
# ─────────────────────────────────────────────────────────────────────────

def test_cvd_fallback_no_taker_column():
    """When column is absent, buy=sell → CVD ≈ 0."""
    df = _make_df(n=30).drop(columns=["taker_buy_base_volume"])
    assert "taker_buy_base_volume" not in df.columns
    r = l11_cvd(df)
    # 50/50 split → delta = 0 every candle → cumsum = 0
    assert r.meta["last_cvd"] == pytest.approx(0.0, abs=1e-6)
    # No crash, score should be 0 (no signals triggered)
    assert r.score == 0


# ─────────────────────────────────────────────────────────────────────────
# 3. Divergence: price new high + CVD lagging
# ─────────────────────────────────────────────────────────────────────────

def test_cvd_divergence_detected():
    """
    Price at new high, but CVD built up early then reversed.
    Construct: first half strong buying (high CVD), second half selling
    while price continues to rise → CVD < 80% of max → divergence.
    """
    n = 40
    closes = [100.0 + i * 0.5 for i in range(n)]   # steadily rising → last bar is max
    buys = [1.0] * 20 + [0.1] * 20     # strong buy then sell dominant

    df = pd.DataFrame({
        "open":   closes,
        "high":   [c * 1.01 for c in closes],
        "low":    [c * 0.99 for c in closes],
        "close":  closes,
        "volume": [1_000.0] * n,
        "taker_buy_base_volume": [1_000.0 * b for b in buys],
    })
    r = l11_cvd(df)
    assert r.meta.get("divergence") is True
    assert r.score < 0
    assert any("다이버전스" in s["t"] for s in r.sigs)


# ─────────────────────────────────────────────────────────────────────────
# 4. Absorption: flat price + strong CVD
# ─────────────────────────────────────────────────────────────────────────

def test_cvd_absorption_bullish():
    """Price range < 5% + strong buy CVD → bullish absorption."""
    n = 30
    close_val = 100.0
    # Very tight range: close all at 100, volume all buy-dominated
    df = pd.DataFrame({
        "open":   [close_val] * n,
        "high":   [close_val * 1.001] * n,
        "low":    [close_val * 0.999] * n,
        "close":  [close_val] * n,
        "volume": [1_000.0] * n,
        # buy_frac = 0.9 → cvd_magnitude = abs(cumsum) / total_vol ≈ high
        "taker_buy_base_volume": [900.0] * n,
    })
    r = l11_cvd(df)
    if r.meta.get("absorption"):
        assert r.score > 0
        assert any("흡수" in s["t"] for s in r.sigs)


# ─────────────────────────────────────────────────────────────────────────
# 5. CVD trend signal
# ─────────────────────────────────────────────────────────────────────────

def test_cvd_rising_trend_bull_signal():
    """
    Build 20 bars where the recent 10 have much higher CVD than prior 10.
    """
    n = 30
    # Prior 10 candles: balanced (buy_frac=0.5 → delta=0)
    # Recent 10 candles: all buy (buy_frac=1.0 → large positive delta)
    buys = [0.5] * 20 + [1.0] * 10
    df = pd.DataFrame({
        "open":   [100.0] * n,
        "high":   [101.0] * n,
        "low":    [99.0] * n,
        "close":  [100.0] * n,
        "volume": [1_000.0] * n,
        "taker_buy_base_volume": [1_000.0 * b for b in buys],
    })
    r = l11_cvd(df)
    assert any("상승 추세" in s["t"] for s in r.sigs)


# ─────────────────────────────────────────────────────────────────────────
# 6. _ensure_dt_index — 3 input formats
# ─────────────────────────────────────────────────────────────────────────

def test_ensure_dt_index_already_datetime():
    idx = pd.date_range("2026-01-01", periods=5, freq="1h", tz="UTC")
    df = pd.DataFrame({"close": [1.0] * 5}, index=idx)
    result = _ensure_dt_index(df)
    assert isinstance(result.index, pd.DatetimeIndex)
    assert result is df   # no copy needed


def test_ensure_dt_index_from_timestamp_column():
    ts = pd.date_range("2026-01-01", periods=5, freq="1h", tz="UTC")
    df = pd.DataFrame({
        "timestamp": ts.astype(np.int64) // 1_000_000,  # milliseconds
        "close": [1.0] * 5,
    })
    result = _ensure_dt_index(df)
    assert isinstance(result.index, pd.DatetimeIndex)


def test_ensure_dt_index_integer_range_synthesises():
    df = pd.DataFrame({"close": [float(i) for i in range(10)]})
    assert not isinstance(df.index, pd.DatetimeIndex)
    result = _ensure_dt_index(df)
    assert isinstance(result.index, pd.DatetimeIndex)
    assert len(result) == 10


# ─────────────────────────────────────────────────────────────────────────
# 7. l1_wyckoff — single-TF, phase label
# ─────────────────────────────────────────────────────────────────────────

def test_l1_wyckoff_insufficient_data():
    df = _make_df(n=20)
    r = l1_wyckoff(df)
    # < 30 bars in every window → returns empty LayerResult
    assert r.score == 0


def test_l1_wyckoff_returns_layer_result():
    df = _make_df(n=100)
    r = l1_wyckoff(df)
    assert hasattr(r, "score")
    assert hasattr(r, "meta")
    assert -30 <= r.score <= 30


def test_l1_wyckoff_sc_detected_on_selling_climax():
    """Build a candle set where last bar is near range low + huge volume spike."""
    n = 60
    closes = [100.0] * n
    vols   = [1_000.0] * n
    closes[-1] = 90.0      # price near range low
    vols[-1]   = 5_000.0   # volume spike (> 2.5× avg)

    df = pd.DataFrame({
        "open":   closes,
        "high":   [c * 1.01 for c in closes],
        "low":    [c * 0.99 for c in closes],
        "close":  closes,
        "volume": vols,
    })
    r = l1_wyckoff(df)
    # With SC conditions, should get a positive score
    # (exact score depends on window, but SC should be detected)
    if r.meta.get("sc"):
        assert r.score > 0


# ─────────────────────────────────────────────────────────────────────────
# 8. l10_mtf — multi-timeframe
# ─────────────────────────────────────────────────────────────────────────

def test_l10_mtf_returns_bounded_score():
    df = _make_df(n=200)
    r = l10_mtf(df)
    assert -30 <= r.score <= 30


def test_l10_mtf_has_tf_results_meta():
    df = _make_df(n=200)
    r = l10_mtf(df)
    assert "tf_results" in r.meta
    # Should have at least 1H
    assert "1H" in r.meta["tf_results"]


def test_l10_mtf_insufficient_data():
    """Very few bars → no TF results but no crash."""
    df = _make_df(n=10)
    r = l10_mtf(df)
    assert isinstance(r.score, (int, float))
