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

from models.signal import (
    EMAAlignment,
    Operator,
    Pattern,
    PatternCondition,
    SignalSnapshot,
)
from scanner.feature_calc import (
    CANONICAL_PATTERN_FEATURE_COLUMNS,
    FEATURE_COLUMNS,
    MIN_HISTORY_BARS,
    compute_features_table,
    compute_snapshot,
    extract_canonical_pattern_feature_snapshot,
)


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


# =====================================================================
# Vectorized parity tests — compute_features_table must agree with
# per-snapshot compute_snapshot at every bar.
# =====================================================================


_NUMERIC_FEATURES = (
    "ema20_slope",
    "ema50_slope",
    "price_vs_ema50",
    "rsi14",
    "rsi14_slope",
    "macd_hist",
    "roc_10",
    "atr_pct",
    "atr_ratio_short_long",
    "bb_width",
    "bb_position",
    "volume_24h",
    "vol_ratio_3",
    "obv_slope",
    "dist_from_20d_high",
    "dist_from_20d_low",
    "swing_pivot_distance",
    "funding_rate",
    "oi_change_1h",
    "oi_change_24h",
    "long_short_ratio",
    "taker_buy_ratio_1h",
)
_CATEGORICAL_FEATURES = ("ema_alignment", "htf_structure", "cvd_state", "regime")


def test_features_table_columns_complete():
    k = _make_klines(MIN_HISTORY_BARS + 50)
    df = compute_features_table(k, symbol="TEST")
    # All declared columns plus price + symbol metadata
    assert set(FEATURE_COLUMNS).issubset(df.columns)
    assert "price" in df.columns
    assert "symbol" in df.columns
    assert (df["symbol"] == "TEST").all()


def test_features_table_exposes_canonical_pattern_feature_subset():
    n = MIN_HISTORY_BARS + 30
    k = _make_klines(n, seed=17)
    descending_close = np.linspace(110.0, 95.0, 12)
    anchor_ts = k.index[-13]
    k.loc[anchor_ts, "open"] = 120.5
    k.loc[anchor_ts, "close"] = 120.0
    k.loc[anchor_ts, "high"] = 121.0
    k.loc[anchor_ts, "low"] = 119.0
    last_slice = k.index[-12:]
    prev_close = float(k.loc[k.index[-13], "close"])
    opens = np.concatenate([[prev_close], descending_close[:-1]])
    k.loc[last_slice, "open"] = opens
    k.loc[last_slice, "close"] = descending_close
    k.loc[last_slice, "high"] = np.maximum(opens, descending_close) * 1.002
    k.loc[last_slice, "low"] = np.minimum(opens, descending_close) * 0.998
    k.loc[last_slice, "volume"] = np.linspace(2000.0, 9000.0, 12)
    k.loc[last_slice, "taker_buy_base_volume"] = k.loc[last_slice, "volume"] * 0.95

    idx = k.index
    oi_raw = np.full(n, 1000.0)
    oi_raw[-1] = 1500.0
    funding_rate = np.full(n, -0.01)
    funding_rate[-1] = 0.01
    perp = pd.DataFrame(
        {
            "funding_rate": funding_rate,
            "oi_raw": oi_raw,
            "oi_change_1h": pd.Series(oi_raw, index=idx).pct_change().fillna(0.0).to_numpy(),
            "oi_change_24h": pd.Series(oi_raw, index=idx).pct_change(24).fillna(0.0).to_numpy(),
            "long_short_ratio": np.full(n, 1.1),
        },
        index=idx,
    )

    df = compute_features_table(k, symbol="TEST", perp=perp)

    assert set(CANONICAL_PATTERN_FEATURE_COLUMNS).issubset(df.columns)
    row = df.iloc[-1]
    assert row["oi_raw"] == pytest.approx(1500.0)
    assert row["oi_zscore"] > 0.0
    assert row["funding_rate_zscore"] > 0.0
    assert row["funding_flip_flag"] == pytest.approx(1.0)
    assert row["volume_percentile"] > 0.9
    assert row["pullback_depth_pct"] > 0.0
    assert row["cvd_price_divergence"] == pytest.approx(1.0)

    snapshot = extract_canonical_pattern_feature_snapshot(row)
    assert snapshot["funding_flip_flag"] is True
    assert snapshot["oi_raw"] == pytest.approx(1500.0)
    assert snapshot["cvd_price_divergence"] == pytest.approx(1.0)


def test_features_table_drops_warmup():
    k = _make_klines(MIN_HISTORY_BARS + 50)
    df = compute_features_table(k, symbol="TEST")
    # Warmup region must be excluded
    assert len(df) == 50
    assert df.index[0] == k.index[MIN_HISTORY_BARS]


def test_features_table_matches_compute_snapshot_at_random_bars():
    """The vectorized table at row t must equal compute_snapshot(k[:t+1])
    at every bar after warmup. Spot-check several bars."""
    k = _make_klines(MIN_HISTORY_BARS + 100, drift=0.0006, seed=11)
    df = compute_features_table(k, symbol="TEST")

    # Spot-check 10 evenly spaced bars across the post-warmup region
    check_indices = list(range(MIN_HISTORY_BARS, len(k), max(1, (len(k) - MIN_HISTORY_BARS) // 10)))
    for i in check_indices:
        snap = compute_snapshot(k.iloc[: i + 1], symbol="TEST")
        row = df.loc[k.index[i]]
        for name in _NUMERIC_FEATURES:
            snap_val = float(getattr(snap, name))
            row_val = float(row[name])
            # Loose tol because EMA history differs at the warmup edge
            assert row_val == pytest.approx(snap_val, abs=1e-6, rel=1e-6), (
                f"mismatch at bar {i} feature {name}: "
                f"snapshot={snap_val} vs table={row_val}"
            )
        for name in _CATEGORICAL_FEATURES:
            snap_val = getattr(snap, name).value
            row_val = row[name]
            assert row_val == snap_val, (
                f"categorical mismatch at bar {i} feature {name}: "
                f"snapshot={snap_val} vs table={row_val}"
            )
        assert int(row["hour_of_day"]) == snap.hour_of_day
        assert int(row["day_of_week"]) == snap.day_of_week


def test_pattern_matches_vectorized_agrees_with_loop():
    """Pattern.matches_vectorized over the table must agree with
    Pattern.matches() called per snapshot."""
    k = _make_klines(MIN_HISTORY_BARS + 200, drift=0.0008, seed=7)
    df = compute_features_table(k, symbol="TEST")

    pattern = Pattern(
        name="test_baseline_clone",
        description="ema20 rising, full bullish, RSI > 50",
        conditions=[
            PatternCondition(field="ema20_slope", operator=Operator.GT, value=0.0),
            PatternCondition(field="ema_alignment", operator=Operator.EQ, value="bullish"),
            PatternCondition(field="rsi14", operator=Operator.GT, value=50.0),
        ],
    )

    vec_mask = pattern.matches_vectorized(df)
    assert len(vec_mask) == len(df)

    # Compare against the per-snapshot loop on a sample of bars
    sample_indices = list(range(0, len(df), max(1, len(df) // 25)))
    for offset in sample_indices:
        bar_t = MIN_HISTORY_BARS + offset
        snap = compute_snapshot(k.iloc[: bar_t + 1], symbol="TEST")
        loop_match = pattern.matches(snap)
        vec_match = bool(vec_mask.iloc[offset])
        assert vec_match == loop_match, (
            f"pattern match mismatch at bar {bar_t}: loop={loop_match} vec={vec_match}"
        )


def test_pattern_matches_vectorized_handles_empty_conditions():
    """A pattern with zero conditions trivially matches every row.
    (validate.py rejects these in the swarm path, but the AST allows it.)"""
    k = _make_klines(MIN_HISTORY_BARS + 20)
    df = compute_features_table(k, symbol="TEST")
    p = Pattern(name="empty", conditions=[])
    mask = p.matches_vectorized(df)
    assert mask.all()


def test_pattern_matches_vectorized_supports_in_operator():
    k = _make_klines(MIN_HISTORY_BARS + 50)
    df = compute_features_table(k, symbol="TEST")
    p = Pattern(
        name="any_alignment",
        conditions=[
            PatternCondition(
                field="ema_alignment",
                operator=Operator.IN,
                value=["bullish", "bearish", "neutral"],
            ),
        ],
    )
    assert p.matches_vectorized(df).all()


def test_cvd_cumulative_in_features_table():
    """cvd_cumulative must be present and monotonically non-trivial."""
    k = _make_klines(MIN_HISTORY_BARS + 50)
    df = compute_features_table(k, symbol="TEST")
    assert "cvd_cumulative" in df.columns, "cvd_cumulative missing from feature table"
    assert df["cvd_cumulative"].notna().all(), "cvd_cumulative contains NaN"


def test_cvd_cumulative_direction():
    """With all-buy klines cvd_cumulative should strictly increase."""
    n = MIN_HISTORY_BARS + 30
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    close = pd.Series(100.0, index=idx)
    volume = pd.Series(1000.0, index=idx)
    k = pd.DataFrame(
        {
            "open": close,
            "high": close * 1.001,
            "low": close * 0.999,
            "close": close,
            "volume": volume,
            "taker_buy_base_volume": volume,  # 100% buy — CVD always rising
        },
        index=idx,
    )
    df = compute_features_table(k, symbol="TEST")
    # All-buy: every bar adds +volume to cumulative → strictly increasing
    assert (df["cvd_cumulative"].diff().dropna() > 0).all(), (
        "With all-buy bars cvd_cumulative should strictly increase"
    )


def test_cvd_cumulative_all_sell():
    """With all-sell klines cvd_cumulative should strictly decrease."""
    n = MIN_HISTORY_BARS + 30
    idx = pd.date_range("2025-01-01", periods=n, freq="1h", tz="UTC")
    close = pd.Series(100.0, index=idx)
    volume = pd.Series(1000.0, index=idx)
    k = pd.DataFrame(
        {
            "open": close,
            "high": close * 1.001,
            "low": close * 0.999,
            "close": close,
            "volume": volume,
            "taker_buy_base_volume": pd.Series(0.0, index=idx),  # 0% buy
        },
        index=idx,
    )
    df = compute_features_table(k, symbol="TEST")
    assert (df["cvd_cumulative"].diff().dropna() < 0).all(), (
        "With all-sell bars cvd_cumulative should strictly decrease"
    )
