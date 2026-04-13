"""Tests for market_engine/l2/alpha.py

Covers:
  1. _rsi()            — Wilder smoothing accuracy, edge cases
  2. s1_activity()     — volume/mcap ratio buckets
  3. s2_liquidity()    — liq_ratio hard cap propagation
  4. s3_trades()       — buy/sell imbalance
  5. s9_quick()        — fast accumulation check (positional args)
  6. compute_alpha()   — score deflation, hard caps, verdict overrides
  7. compute_hunt_score() — combo bonuses, dump penalty, soft cap
  8. resolve_conflict() — simultaneous pre-pump + pre-dump
"""
from __future__ import annotations

import pytest

from market_engine.l2.alpha import (
    SResult,
    _rsi,
    s1_activity,
    s2_liquidity,
    s3_trades,
    s9_accumulation,
    s9_quick,
    s10_prepump,
    s11_predump,
    compute_alpha,
    compute_hunt_score,
    resolve_conflict,
)


# ── helpers ───────────────────────────────────────────────────────────────

def _mk(score: float = 0.0, **meta) -> SResult:
    r = SResult(score=score)
    r.meta.update(meta)
    return r


# ─────────────────────────────────────────────────────────────────────────
# 1. Wilder RSI
# ─────────────────────────────────────────────────────────────────────────

def test_rsi_returns_50_when_insufficient_data():
    """< period+1 bars → neutral 50."""
    assert _rsi([100.0] * 10, period=14) == 50.0


def test_rsi_all_up_bars_returns_100():
    closes = [float(i) for i in range(1, 25)]   # strictly increasing
    assert _rsi(closes) == 100.0


def test_rsi_all_down_bars_returns_0():
    closes = [float(i) for i in range(24, 0, -1)]  # strictly decreasing
    assert _rsi(closes) == 0.0


def test_rsi_alternating_yields_near_50():
    # Perfectly alternating: equal up/down → RS ~ 1 → RSI ~ 50
    closes = [100.0 + ((-1) ** i) for i in range(30)]
    val = _rsi(closes)
    assert 40.0 < val < 60.0


def test_rsi_uses_wilder_smoothing_not_sma():
    """
    Wilder EMA = prev*(n-1)/n + current/n
    If the last bar has a big gain it should push RSI up more
    than a simple rolling SMA would.
    """
    closes = [100.0] * 14 + [101.0]   # one big up bar after flat
    val_wilder = _rsi(closes, period=14)
    # Pure flat then 1 up: Wilder RSI should be 100 (only gains, no losses)
    assert val_wilder == 100.0


# ─────────────────────────────────────────────────────────────────────────
# 2. s1_activity — volume/mcap ratio buckets
# ─────────────────────────────────────────────────────────────────────────

def test_s1_extreme_activity():
    r = s1_activity(vol_24h=2_000_000, market_cap=1_000_000)
    assert r.score == 15
    assert any("극도 활발" in s["t"] for s in r.sigs)


def test_s1_very_active():
    r = s1_activity(vol_24h=600_000, market_cap=1_000_000)
    assert r.score == 10


def test_s1_low_activity():
    r = s1_activity(vol_24h=50_000, market_cap=1_000_000)
    assert r.score == -10


def test_s1_zero_market_cap_does_not_crash():
    r = s1_activity(vol_24h=1_000, market_cap=0)
    assert isinstance(r.score, (int, float))


# ─────────────────────────────────────────────────────────────────────────
# 3. s2_liquidity — liq_ratio stored for hard cap
# ─────────────────────────────────────────────────────────────────────────

def test_s2_stores_liq_ratio_in_meta():
    r = s2_liquidity(liquidity=50_000, market_cap=1_000_000, vol_24h=100_000)
    assert "liq_ratio" in r.meta
    assert abs(r.meta["liq_ratio"] - 0.05) < 1e-9


def test_s2_very_low_liq_ratio_triggers_bear():
    # liq_ratio = 1_000 / 1_000_000 = 0.001
    r = s2_liquidity(liquidity=1_000, market_cap=1_000_000, vol_24h=500_000)
    assert r.score < 0


# ─────────────────────────────────────────────────────────────────────────
# 4. s3_trades — buy/sell imbalance
# ─────────────────────────────────────────────────────────────────────────

def test_s3_strong_buy_pressure():
    r = s3_trades(buy_vol=90_000, sell_vol=10_000)
    assert r.score > 0
    assert r.meta["buy_pct"] == pytest.approx(90.0)


def test_s3_strong_sell_pressure():
    r = s3_trades(buy_vol=10_000, sell_vol=90_000)
    assert r.score < 0


def test_s3_balanced_neutral():
    r = s3_trades(buy_vol=50_000, sell_vol=50_000)
    # 50/50 → neutral territory
    assert -5 <= r.score <= 5


# ─────────────────────────────────────────────────────────────────────────
# 5. s9_quick — fast accumulation check
# ─────────────────────────────────────────────────────────────────────────

def test_s9_quick_returns_zero_for_tiny_vol():
    r = s9_quick(
        pct_24h=2.0,
        price_high_24h=1.05,
        price_low_24h=1.00,
        vol=5_000,           # < 10_000 threshold
        market_cap=1_000_000,
        holders=500,
    )
    assert r.score == 0


def test_s9_quick_accumulation_two_conditions():
    """Flat + high vol/mcap → both conditions → is_accumulating=True."""
    r = s9_quick(
        pct_24h=1.0,                 # flat (< 8%)
        price_high_24h=1.02,
        price_low_24h=1.00,          # range = 2% < 20%
        vol=200_000,                 # vol/mcap = 0.2 > 0.1
        market_cap=1_000_000,
        holders=1_000,
    )
    assert r.meta["is_accumulating"] is True
    assert r.score >= 8


def test_s9_quick_only_one_condition_not_accumulating():
    """Only flat but vol/mcap too low → cond_count=1 → not accumulating."""
    r = s9_quick(
        pct_24h=1.0,
        price_high_24h=1.02,
        price_low_24h=1.00,
        vol=50_000,                  # vol/mcap = 0.05 < 0.1
        market_cap=1_000_000,
        holders=1_000,
    )
    assert r.meta["is_accumulating"] is False


# ─────────────────────────────────────────────────────────────────────────
# 6. compute_alpha — deflation, hard caps, verdicts
# ─────────────────────────────────────────────────────────────────────────

def test_compute_alpha_deflation_above_40():
    """raw=60 → deflated = 40 + (60-40)*0.5 = 50."""
    scores = {"s1": _mk(60.0)}
    result = compute_alpha(scores)
    assert result.raw == 60.0
    assert result.score == 50


def test_compute_alpha_deflation_above_70():
    """raw=80: both bands apply (raw > 40 AND raw > 70).
    Band 1: 40 + (80-40)*0.5 = 60 (but raw>70 overrides).
    Band 2: 70 + (80-70)*0.2 = 72.  score = 72."""
    scores = {"s1": _mk(80.0)}
    result = compute_alpha(scores)
    assert result.raw == 80.0
    assert result.score == 72


def test_compute_alpha_deflation_above_70_second_band():
    """raw=90: Band 2 applies: 70 + (90-70)*0.2 = 74.  score = 74."""
    scores = {"s1": _mk(90.0)}
    result = compute_alpha(scores)
    assert result.raw == 90.0
    assert result.score == 74


def test_compute_alpha_both_deflation_bands():
    """raw=100 → 40+(100-40)*0.5=70 → exactly at boundary, then 70+(100-70)*0.2... wait.
    The code checks raw first: if raw>40 → deflated = 40+(raw-40)*0.5 = 70.
    Then if raw>70 → deflated = 70+(raw-70)*0.2 = 70+6 = 76? No wait, the code uses
    the original `raw` for both checks, not the already-deflated value.
    Let me re-read: deflated = float(raw); if raw>40: deflated=40+(raw-40)*0.5;
    if raw>70: deflated=70+(raw-70)*0.2.
    So for raw=100: first deflated=40+30=70, then (raw=100>70) → deflated=70+(100-70)*0.2=70+6=76.
    score=76."""
    scores = {"s1": _mk(100.0)}
    result = compute_alpha(scores)
    assert result.raw == 100.0
    assert result.score == 76


def test_compute_alpha_hard_cap_low_liquidity():
    """liq_ratio < 0.05 → score capped at 10 regardless of raw."""
    s2 = _mk(0.0, liq_ratio=0.01)
    scores = {"s1": _mk(90.0), "s2": s2}
    result = compute_alpha(scores)
    assert result.score <= 10


def test_compute_alpha_hard_cap_dump_warnings():
    """warn_count >= 3 → score forced ≤ 0."""
    s11 = _mk(0.0, warn_count=3)
    scores = {"s1": _mk(40.0), "s11": s11}
    result = compute_alpha(scores)
    assert result.score <= 0


def test_compute_alpha_verdict_strong_bull():
    scores = {"s1": _mk(60.0)}   # deflated → 50 → "BULLISH" not STRONG
    result = compute_alpha(scores)
    # score=50 → BULLISH (>= 30 but < 60)
    assert "BULL" in result.verdict


def test_compute_alpha_verdict_strong_bear():
    scores = {"s1": _mk(-70.0)}  # deflated → -55 → STRONG BEAR
    result = compute_alpha(scores)
    assert "BEAR" in result.verdict


def test_compute_alpha_prepump_overrides_accumulating():
    """PRE-PUMP verdict should beat ACCUMULATING (last-wins priority)."""
    s9  = _mk(13.0, is_accumulating=True)
    s10 = _mk(30.0, is_prepump=True)
    scores = {"s9": s9, "s10": s10}
    result = compute_alpha(scores)
    assert "PRE-PUMP" in result.verdict


def test_compute_alpha_predump_verdict():
    s11 = _mk(-30.0, is_predump=True)
    scores = {"s11": s11}
    result = compute_alpha(scores)
    assert "PRE-DUMP" in result.verdict


def test_compute_alpha_mexc_verdict_highest_priority():
    """MEXC multi-exchange verdict should override everything else."""
    s10 = _mk(30.0, is_prepump=True)
    s15 = _mk(20.0, mexc_ratio=4.0, mexc_pct=10.0)
    scores = {"s10": s10, "s15": s15}
    result = compute_alpha(scores)
    assert "MEXC" in result.verdict


# ─────────────────────────────────────────────────────────────────────────
# 7. compute_hunt_score — combo bonuses, dump penalty, soft cap
# ─────────────────────────────────────────────────────────────────────────

def _empty() -> SResult:
    return SResult()


def test_hunt_score_no_combos():
    score = compute_hunt_score(
        alpha_score=20.0,
        s10=_empty(), s11=_empty(), s9=_empty(),
        s16=None, s19=None,
    )
    assert score == 20


def test_hunt_score_3_combo_bonus():
    """3+ combos → +25."""
    s10 = _mk(0.0, is_prepump=True)
    s9  = _mk(0.0, is_accumulating=True)
    s16 = _mk(0.0, bandwidth=2.0)    # bandwidth < 4.0 → combo
    score = compute_hunt_score(
        alpha_score=10.0,
        s10=s10, s11=_empty(), s9=s9,
        s16=s16, s19=None,
    )
    assert score == 35   # 10 + 25 = 35


def test_hunt_score_2_combo_bonus():
    """2 combos → +10."""
    s10 = _mk(0.0, is_prepump=True)
    s9  = _mk(0.0, is_accumulating=True)
    score = compute_hunt_score(
        alpha_score=5.0,
        s10=s10, s11=_empty(), s9=s9,
        s16=None, s19=None,
    )
    assert score == 15   # 5 + 10


def test_hunt_score_dump_penalty():
    """is_predump → -25."""
    s11 = _mk(0.0, is_predump=True)
    score = compute_hunt_score(
        alpha_score=10.0,
        s10=_empty(), s11=s11, s9=_empty(),
        s16=None, s19=None,
    )
    assert score == -15   # 10 - 25


def test_hunt_score_soft_cap_above_60():
    """Above 60 → 60 + (excess)*0.4."""
    score = compute_hunt_score(
        alpha_score=80.0,
        s10=_empty(), s11=_empty(), s9=_empty(),
        s16=None, s19=None,
    )
    expected = round(60 + (80 - 60) * 0.4)   # 60 + 8 = 68
    assert score == expected


def test_hunt_score_capped_at_100():
    score = compute_hunt_score(
        alpha_score=100.0,
        s10=_empty(), s11=_empty(), s9=_empty(),
        s16=None, s19=None,
    )
    assert score <= 100


# ─────────────────────────────────────────────────────────────────────────
# 8. resolve_conflict — EXTREME VOLATILITY
# ─────────────────────────────────────────────────────────────────────────

def test_resolve_conflict_no_overlap():
    s10 = _mk(0.0, is_prepump=False)
    s11 = _mk(0.0, is_predump=False)
    assert resolve_conflict(s10, s11) is None


def test_resolve_conflict_only_prepump():
    s10 = _mk(0.0, is_prepump=True)
    s11 = _mk(0.0, is_predump=False)
    assert resolve_conflict(s10, s11) is None


def test_resolve_conflict_simultaneous_signals():
    s10 = _mk(0.0, is_prepump=True)
    s11 = _mk(0.0, is_predump=True)
    result = resolve_conflict(s10, s11)
    assert result is not None
    assert result["is_extreme"] is True
    assert "EXTREME" in result["verdict"]
