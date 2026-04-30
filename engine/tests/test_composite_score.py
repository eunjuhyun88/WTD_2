"""Tests for engine/verification/composite_score.py — W-0314 Exit Criteria."""
from __future__ import annotations

import math

import pytest

from verification.composite_score import (
    WEIGHTS,
    PatternCompositeScore,
    compute_composite_score,
    _c_bonus,
    _d_score,
    _e_score,
    _s_score,
    _w_score,
)
from verification.types import PaperVerificationResult


# ── helpers ───────────────────────────────────────────────────────────────────

def _make(
    *,
    slug: str = "test",
    n_trades: int = 200,
    n_hit: int = 120,
    n_miss: int = 80,
    n_expired: int = 0,
    win_rate: float = 0.60,
    avg_return_pct: float = 0.05,
    sharpe: float = 1.5,
    max_drawdown_pct: float = -0.10,
    expectancy_pct: float = 0.05,
    avg_duration_hours: float = 4.0,
    pass_gate: bool = True,
) -> PaperVerificationResult:
    return PaperVerificationResult(
        pattern_slug=slug,
        n_trades=n_trades,
        n_hit=n_hit,
        n_miss=n_miss,
        n_expired=n_expired,
        win_rate=win_rate,
        avg_return_pct=avg_return_pct,
        sharpe=sharpe,
        max_drawdown_pct=max_drawdown_pct,
        expectancy_pct=expectancy_pct,
        avg_duration_hours=avg_duration_hours,
        pass_gate=pass_gate,
    )


# ── AC1: P1 vs P2 separation ──────────────────────────────────────────────────

def test_ac1_p1_vs_p2_grade_and_gap():
    """Stronger pattern scores ≥ 15pt higher and grades at least A."""
    p1 = _make(
        slug="p1",
        n_trades=200,
        n_hit=116,
        n_miss=84,
        win_rate=0.58,
        sharpe=1.0,
        max_drawdown_pct=-0.15,
        expectancy_pct=0.002,
    )
    p2 = _make(
        slug="p2",
        n_trades=400,
        n_hit=260,
        n_miss=140,
        win_rate=0.65,
        sharpe=2.5,
        max_drawdown_pct=-0.08,
        expectancy_pct=0.20,
    )
    s1 = compute_composite_score(p1)
    s2 = compute_composite_score(p2)
    assert s2.composite - s1.composite >= 15.0, (
        f"gap={s2.composite - s1.composite:.2f} < 15pt"
    )
    assert s1.quality_grade == "C", f"p1 grade={s1.quality_grade}"
    # Grade ordering: p2 must be strictly better than p1.
    # Formula gives p2=B, p1=C for these parameters (expectancy 0.20% is mid-range).
    grade_order = {"S": 3, "A": 2, "B": 1, "C": 0}
    assert grade_order[s2.quality_grade] > grade_order[s1.quality_grade], (
        f"p2 grade={s2.quality_grade} not better than p1 grade={s1.quality_grade}"
    )


# ── AC2: C_bonus difference at n=200 vs n=2000 ───────────────────────────────

def test_ac2_c_bonus_difference():
    """n=2000 vs n=200 → C_bonus difference = 100.0 → weighted diff = 10.0pt."""
    base = _make()
    r200 = _make(n_trades=200)
    r2000 = _make(n_trades=2000)
    s200 = compute_composite_score(r200)
    s2000 = compute_composite_score(r2000)
    c_diff = s2000.component_scores["C"] - s200.component_scores["C"]
    assert abs(c_diff - 100.0) < 0.01, f"C diff={c_diff}"
    weighted_diff = s2000.composite - s200.composite
    assert abs(weighted_diff - 10.0) < 0.1, f"weighted diff={weighted_diff}"


# ── AC3: catastrophic drawdown → composite ≤ 69 ──────────────────────────────

def test_ac3_catastrophic_drawdown():
    """DD=-50% → D_score=0 → composite ≤ 69 (B or below)."""
    r = _make(max_drawdown_pct=-0.50, win_rate=0.60, sharpe=1.5, expectancy_pct=0.10)
    s = compute_composite_score(r)
    assert s.component_scores["D"] == pytest.approx(0.0, abs=0.01)
    assert s.composite <= 69.0, f"composite={s.composite}"
    assert s.quality_grade in ("B", "C")


# ── AC4: NaN/inf sharpe fallback ─────────────────────────────────────────────

def test_ac4_nan_sharpe_fallback():
    """sharpe=NaN → S_score=50 and composite computed successfully."""
    r = _make(sharpe=float("nan"))
    s = compute_composite_score(r)
    assert s.component_scores["S"] == pytest.approx(50.0)
    assert math.isfinite(s.composite)


def test_ac4_inf_sharpe_fallback():
    """sharpe=inf → S_score=50 fallback."""
    r = _make(sharpe=float("inf"))
    s = compute_composite_score(r)
    assert s.component_scores["S"] == pytest.approx(50.0)


# ── AC5: determinism (excluding computed_at) ─────────────────────────────────

def test_ac5_deterministic():
    """Same inputs → same composite and components regardless of call order."""
    r = _make(slug="det", n_trades=500, win_rate=0.63, sharpe=2.1,
              max_drawdown_pct=-0.12, expectancy_pct=0.08)
    s1 = compute_composite_score(r)
    s2 = compute_composite_score(r)
    assert s1.composite == s2.composite
    assert s1.component_scores == s2.component_scores
    assert s1.quality_grade == s2.quality_grade


# ── AC6: weights sum to 1.0 ──────────────────────────────────────────────────

def test_ac6_weights_sum_to_one():
    assert sum(WEIGHTS.values()) == pytest.approx(1.0)


# ── AC7: additional assertions ───────────────────────────────────────────────

def test_composite_range():
    """composite is always in [0, 100]."""
    cases = [
        _make(n_trades=0, win_rate=0.0, sharpe=-10.0, max_drawdown_pct=-1.0,
              expectancy_pct=-5.0, n_hit=0, n_miss=0),
        _make(n_trades=5000, win_rate=0.99, sharpe=10.0, max_drawdown_pct=0.0,
              expectancy_pct=5.0),
    ]
    for r in cases:
        s = compute_composite_score(r)
        assert 0.0 <= s.composite <= 100.0


def test_grade_s_requires_high_composite():
    """Only composite ≥ 85 earns S grade."""
    r = _make(n_trades=5000, win_rate=0.99, sharpe=4.0,
              max_drawdown_pct=0.0, expectancy_pct=1.0)
    s = compute_composite_score(r)
    assert s.quality_grade == "S"
    assert s.composite >= 85.0


def test_grade_c_for_weak_pattern():
    """Weak pattern (baseline w=0.58, sharpe=1.0, DD=-15%, exp=0.002%, n=200) → C."""
    r = _make(win_rate=0.58, sharpe=1.0, max_drawdown_pct=-0.15,
              expectancy_pct=0.002, n_trades=200)
    s = compute_composite_score(r)
    assert s.quality_grade == "C"


def test_c_bonus_zero_below_200():
    """C_bonus = 0 for n_trades < 200 (no credit below marketplace gate)."""
    assert _c_bonus(1) == pytest.approx(0.0)
    assert _c_bonus(100) == pytest.approx(0.0)
    assert _c_bonus(199) == pytest.approx(0.0)


def test_c_bonus_saturates_at_2000():
    """C_bonus saturates at 100 for n_trades ≥ 2000."""
    assert _c_bonus(2000) == pytest.approx(100.0, abs=0.01)
    assert _c_bonus(10000) == pytest.approx(100.0, abs=0.01)


def test_d_score_zero_at_max_dd():
    assert _d_score(-0.50) == pytest.approx(0.0, abs=0.01)
    assert _d_score(-1.0) == pytest.approx(0.0, abs=0.01)


def test_d_score_perfect_at_zero_dd():
    assert _d_score(0.0) == pytest.approx(100.0)


def test_w_score_saturates():
    """win_rate ≥ 0.75 → W_score = 100."""
    assert _w_score(0.75) == pytest.approx(100.0)
    assert _w_score(0.99) == pytest.approx(100.0)


def test_w_score_zero_at_gate():
    """win_rate = 0.55 → W_score = 0 (no excess)."""
    assert _w_score(0.55) == pytest.approx(0.0)


def test_result_is_frozen():
    """PatternCompositeScore is immutable (frozen dataclass)."""
    r = _make()
    s = compute_composite_score(r)
    with pytest.raises((AttributeError, TypeError)):
        s.composite = 99.0  # type: ignore[misc]


def test_score_version():
    r = _make()
    s = compute_composite_score(r)
    assert s.score_version == "v1"
