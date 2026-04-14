"""Tests for the SignalSnapshot + Pattern contract.

Covers:
  1. Pydantic validation (happy path + bad ranges)
  2. PatternCondition truth table (one test per operator)
  3. Pattern conjunction semantics + signature stability
  4. Guard: PatternCondition cannot reference non-feature fields
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from models.signal import (
    CVDState,
    EMAAlignment,
    HTFStructure,
    Operator,
    Pattern,
    PatternCondition,
    Regime,
    SignalSnapshot,
)


# ---------- fixtures ------------------------------------------------------


def _make_snapshot(**overrides) -> SignalSnapshot:
    base = dict(
        symbol="BTCUSDT",
        timestamp=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
        price=50_000.0,
        # Trend
        ema20_slope=0.01,
        ema50_slope=0.005,
        ema_alignment=EMAAlignment.BULLISH,
        price_vs_ema50=0.02,
        # Momentum
        rsi14=55.0,
        rsi14_slope=1.2,
        macd_hist=12.5,
        roc_10=0.03,
        # Volatility
        atr_pct=0.015,
        atr_ratio_short_long=1.1,
        bb_width=0.04,
        bb_position=0.6,
        # Volume
        volume_24h=1_200_000_000.0,
        vol_ratio_3=1.3,
        obv_slope=0.02,
        # Structure
        htf_structure=HTFStructure.UPTREND,
        dist_from_20d_high=-0.02,
        dist_from_20d_low=0.15,
        swing_pivot_distance=5.0,
        # Microstructure
        funding_rate=0.0001,
        oi_change_1h=0.005,
        oi_change_24h=0.02,
        long_short_ratio=1.2,
        # Order flow
        cvd_state=CVDState.BUYING,
        taker_buy_ratio_1h=0.55,
        # Meta
        regime=Regime.RISK_ON,
        hour_of_day=12,
        day_of_week=3,
    )
    base.update(overrides)
    return SignalSnapshot(**base)


# ---------- 1. validation -------------------------------------------------


def test_snapshot_constructs_with_valid_fields():
    snap = _make_snapshot()
    assert snap.symbol == "BTCUSDT"
    assert snap.rsi14 == 55.0
    assert snap.ema_alignment is EMAAlignment.BULLISH


def test_snapshot_has_92_feature_fields():
    """Guard against accidental add/remove of feature fields.
    A-K (39) + L-T (24) + U (3) + V-AB (26) = 92 total.
    V: EMA9/100 slope, price_vs_ema20/100.
    W: hist_vol_24h/7d, vol_regime, parkinson_vol.
    X: macd_line, macd_hist_slope.
    Y: volume_7d, vol_ratio_24, taker_buy_ratio_24h, vol_acceleration.
    Z: range_7d_position, gap_pct, close_above_open_ratio,
       consecutive_bars, body_ratio.
    AA: engulfing_bull/bear, doji, hammer.
    AB: lr_slope_20, efficiency_ratio, trend_consistency.
    """
    meta = {"schema_version", "symbol", "timestamp", "price"}
    feature_fields = set(SignalSnapshot.model_fields.keys()) - meta
    assert len(feature_fields) == 92, (
        f"expected 92 feature fields, got {len(feature_fields)}: "
        f"{sorted(feature_fields)}"
    )


@pytest.mark.parametrize(
    "field,bad_value",
    [
        ("hour_of_day", -1),
        ("hour_of_day", 24),
        ("day_of_week", -1),
        ("day_of_week", 7),
        ("rsi14", -0.1),
        ("rsi14", 100.1),
        ("taker_buy_ratio_1h", -0.01),
        ("taker_buy_ratio_1h", 1.01),
    ],
)
def test_snapshot_rejects_out_of_range(field: str, bad_value):
    with pytest.raises(ValidationError):
        _make_snapshot(**{field: bad_value})


def test_snapshot_rejects_unknown_enum():
    with pytest.raises(ValidationError):
        _make_snapshot(ema_alignment="sideways")  # not in EMAAlignment


# ---------- 2. PatternCondition truth table -------------------------------


@pytest.mark.parametrize(
    "op,value,expected",
    [
        (Operator.GT, 50.0, True),    # rsi14=55 > 50
        (Operator.GT, 60.0, False),
        (Operator.LT, 60.0, True),
        (Operator.LT, 50.0, False),
        (Operator.GTE, 55.0, True),
        (Operator.GTE, 55.1, False),
        (Operator.LTE, 55.0, True),
        (Operator.LTE, 54.9, False),
        (Operator.EQ, 55.0, True),
        (Operator.EQ, 54.0, False),
        (Operator.NEQ, 54.0, True),
        (Operator.NEQ, 55.0, False),
    ],
)
def test_pattern_condition_numeric_ops(op, value, expected):
    snap = _make_snapshot()  # rsi14 == 55
    cond = PatternCondition(field="rsi14", operator=op, value=value)
    assert cond.matches(snap) is expected


def test_pattern_condition_enum_field_unwraps_to_string():
    snap = _make_snapshot()  # ema_alignment = BULLISH
    cond_eq = PatternCondition(
        field="ema_alignment", operator=Operator.EQ, value="bullish"
    )
    assert cond_eq.matches(snap) is True
    cond_neq = PatternCondition(
        field="ema_alignment", operator=Operator.EQ, value="bearish"
    )
    assert cond_neq.matches(snap) is False


def test_pattern_condition_in_and_not_in():
    snap = _make_snapshot()  # regime = risk_on
    cond_in = PatternCondition(
        field="regime", operator=Operator.IN, value=["risk_on", "risk_off"]
    )
    assert cond_in.matches(snap) is True
    cond_not_in = PatternCondition(
        field="regime", operator=Operator.NOT_IN, value=["chop"]
    )
    assert cond_not_in.matches(snap) is True


def test_pattern_condition_rejects_non_feature_field():
    with pytest.raises(ValidationError):
        PatternCondition(field="symbol", operator=Operator.EQ, value="BTCUSDT")
    with pytest.raises(ValidationError):
        PatternCondition(field="nonexistent", operator=Operator.EQ, value=0.0)


# ---------- 3. Pattern conjunction + signature ----------------------------


def test_pattern_empty_conditions_always_matches():
    # Conjunction over zero conditions is vacuously True.
    p = Pattern(name="any")
    assert p.matches(_make_snapshot()) is True


def test_pattern_all_conditions_must_match():
    snap = _make_snapshot()  # rsi14=55, ema20_slope=0.01
    p = Pattern(
        name="bull_momo",
        conditions=[
            PatternCondition(field="rsi14", operator=Operator.GT, value=50.0),
            PatternCondition(field="ema20_slope", operator=Operator.GT, value=0.0),
        ],
    )
    assert p.matches(snap) is True

    p_fail = Pattern(
        name="bull_momo_strict",
        conditions=[
            PatternCondition(field="rsi14", operator=Operator.GT, value=50.0),
            PatternCondition(field="ema20_slope", operator=Operator.GT, value=0.1),
        ],
    )
    assert p_fail.matches(snap) is False


def test_pattern_signature_is_order_insensitive():
    a = Pattern(
        name="a",
        conditions=[
            PatternCondition(field="rsi14", operator=Operator.GT, value=50.0),
            PatternCondition(field="ema20_slope", operator=Operator.GT, value=0.0),
        ],
    )
    b = Pattern(
        name="b_different_name",
        description="different description",
        conditions=[
            PatternCondition(field="ema20_slope", operator=Operator.GT, value=0.0),
            PatternCondition(field="rsi14", operator=Operator.GT, value=50.0),
        ],
    )
    assert a.signature() == b.signature()


def test_pattern_signature_distinguishes_different_conditions():
    a = Pattern(
        name="a",
        conditions=[
            PatternCondition(field="rsi14", operator=Operator.GT, value=50.0),
        ],
    )
    b = Pattern(
        name="a",
        conditions=[
            PatternCondition(field="rsi14", operator=Operator.GT, value=60.0),
        ],
    )
    assert a.signature() != b.signature()
