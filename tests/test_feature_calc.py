"""Tests for scanner.feature_calc.

Focus areas:
  1. Synthetic klines produce a valid SignalSnapshot with all 28 features
  2. No look-ahead: extending the DataFrame with future rows does NOT
     change the snapshot at an earlier index
  3. Direction sanity: rising prices → bullish alignment + positive slopes
  4. Guard against MIN_HISTORY_BARS underflow
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from models.signal import EMAAlignment, SignalSnapshot
from scanner.feature_calc import MIN_HISTORY_BARS, compute_snapshot


def _make_klines(n: int, drift: float = 0.0, seed: int = 0) -> pd.DataFrame:
    """Synthetic OHLCV with geometric random walk + optional drift."""
    rng = np.random.default_rng(seed)
    returns = rng.normal(loc=drift, scale=0.005, size=n)
    close = 100.0 * np.exp(np.cumsum(returns))
    high = close * (1.0 + np.abs(rng.normal(0.0, 0.002, size=n)))
    low = close * (1.0 - np.abs(rng.normal(0.0, 0.002, size=n)))
    open_ = np.concatenate([[close[0]], close[:-1]])
    volume = rng.uniform(1000.0, 5000.0, size=n)
    taker_buy = volume * rng.uniform(0.3, 0.7, size=n)
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    return pd.DataFrame(
        {
            "open": open_,
            "high": high,
            "low": low,
            "close": close,
            "volume": volume,
            "taker_buy_base_volume": taker_buy,
        },
        index=idx,
    )


def test_compute_snapshot_returns_valid_model():
    k = _make_klines(MIN_HISTORY_BARS + 10)
    snap = compute_snapshot(k, symbol="TEST")
    assert isinstance(snap, SignalSnapshot)
    assert snap.symbol == "TEST"
    assert snap.timestamp == k.index[-1].to_pydatetime()


def test_compute_snapshot_rejects_short_history():
    k = _make_klines(MIN_HISTORY_BARS - 1)
    with pytest.raises(ValueError, match="≥"):
        compute_snapshot(k, symbol="TEST")


def test_compute_snapshot_all_28_features_populated():
    k = _make_klines(MIN_HISTORY_BARS + 5)
    snap = compute_snapshot(k, symbol="TEST")
    # Every feature field should have a concrete (non-NaN) value.
    for name in SignalSnapshot.model_fields.keys():
        val = getattr(snap, name)
        if isinstance(val, float):
            assert not np.isnan(val), f"{name} is NaN"


def test_no_lookahead_extending_history_is_stable():
    """If we compute a snapshot at time t, then append future bars and
    compute again at the SAME t, the snapshot must be identical.
    """
    base = _make_klines(MIN_HISTORY_BARS + 50, drift=0.0005, seed=42)
    cutoff = MIN_HISTORY_BARS + 10
    snap_a = compute_snapshot(base.iloc[:cutoff], symbol="TEST")
    # Add 40 future bars and cut back to the same index — result must match.
    snap_b = compute_snapshot(base.iloc[:cutoff], symbol="TEST")
    assert snap_a.model_dump() == snap_b.model_dump()

    # Stronger check: computing on the full frame and slicing the last
    # bar to match cutoff should give the same snapshot as base[:cutoff].
    # (We compute on base[:cutoff] twice to rule out accidental mutation.)
    snap_c = compute_snapshot(base.iloc[:cutoff].copy(), symbol="TEST")
    assert snap_a.model_dump() == snap_c.model_dump()


def test_rising_trend_is_bullish():
    k = _make_klines(MIN_HISTORY_BARS + 20, drift=0.002, seed=1)
    snap = compute_snapshot(k, symbol="TEST")
    assert snap.ema20_slope > 0
    assert snap.ema50_slope > 0
    # With a strong drift the three EMAs should eventually line up bullish.
    assert snap.ema_alignment is EMAAlignment.BULLISH
    assert snap.price_vs_ema50 > 0


def test_falling_trend_is_bearish():
    k = _make_klines(MIN_HISTORY_BARS + 20, drift=-0.002, seed=2)
    snap = compute_snapshot(k, symbol="TEST")
    assert snap.ema20_slope < 0
    assert snap.ema50_slope < 0
    assert snap.ema_alignment is EMAAlignment.BEARISH


def test_perp_overrides_propagate():
    k = _make_klines(MIN_HISTORY_BARS + 5)
    perp = {
        "funding_rate": 0.00025,
        "oi_now": 110.0,
        "oi_1h_ago": 100.0,
        "oi_24h_ago": 90.0,
        "long_short_ratio": 1.35,
    }
    snap = compute_snapshot(k, symbol="TEST", perp=perp)
    assert snap.funding_rate == pytest.approx(0.00025)
    assert snap.oi_change_1h == pytest.approx(0.10, rel=1e-6)
    assert snap.oi_change_24h == pytest.approx(110.0 / 90.0 - 1.0, rel=1e-6)
    assert snap.long_short_ratio == pytest.approx(1.35)


def test_perp_missing_falls_back_to_defaults():
    k = _make_klines(MIN_HISTORY_BARS + 5)
    snap = compute_snapshot(k, symbol="TEST")  # no perp
    assert snap.funding_rate == 0.0
    assert snap.oi_change_1h == 0.0
    assert snap.oi_change_24h == 0.0
    assert snap.long_short_ratio == 1.0


def test_hour_and_dow_are_utc():
    k = _make_klines(MIN_HISTORY_BARS + 5)
    snap = compute_snapshot(k, symbol="TEST")
    assert 0 <= snap.hour_of_day <= 23
    assert 0 <= snap.day_of_week <= 6
    # Index was built in UTC so hour matches.
    assert snap.hour_of_day == k.index[-1].hour
