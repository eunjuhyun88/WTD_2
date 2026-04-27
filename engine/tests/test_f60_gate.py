"""Tests for F-60 multi-period gate (L-3, R-05)."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import pytest

from stats.engine import (
    F60_FLOOR_THRESHOLD,
    F60_MEDIAN_THRESHOLD,
    F60_MIN_SAMPLES_PER_WINDOW,
    F60_MIN_VERDICT_COUNT,
    GateStatus,
    _compute_gate_status,
    _split_rolling_windows,
)


@dataclass
class FakeOutcome:
    """Minimal outcome for testing."""
    user_verdict: str | None = None
    verdict_at: datetime | None = None
    accumulation_at: datetime | None = None


def _make(verdict: str, days_ago: int = 1) -> FakeOutcome:
    ts = datetime.now(timezone.utc) - timedelta(days=days_ago)
    return FakeOutcome(user_verdict=verdict, verdict_at=ts)


def test_insufficient_data_under_200():
    outcomes = [_make("valid") for _ in range(50)]
    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.passed is False
    assert gs.reason == "insufficient_data"
    assert gs.verdict_count == 50
    assert gs.remaining_to_threshold == 150


def test_near_miss_and_too_early_in_denominator():
    """near_miss / too_early는 loss — denominator에 포함."""
    outcomes = [_make("near_miss") for _ in range(200)] + [_make("too_early") for _ in range(200)]
    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 400


def test_passed_high_accuracy_uniform():
    """모든 윈도우에서 70% 정확도 → median 0.7, floor 0.7 → PASS."""
    outcomes = []
    for i in range(225):
        days_ago = (i % 90) + 1  # 1~90일 분산
        verdict = "valid" if i % 10 < 7 else "invalid"
        outcomes.append(_make(verdict, days_ago=days_ago))

    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 225
    assert gs.passed is True
    assert gs.reason == "passed"
    assert gs.median_accuracy >= F60_MEDIAN_THRESHOLD
    assert gs.floor_accuracy >= F60_FLOOR_THRESHOLD
    assert len(gs.window_accuracies) == 3


def test_failed_one_window_below_floor():
    """median 0.55 OK인데 한 window가 0.30 → FAIL (floor 위반)."""
    outcomes = []
    # W0 (0~30d ago): 60% accuracy (75건 중 45 valid)
    for i in range(75):
        verdict = "valid" if i % 5 < 3 else "invalid"
        outcomes.append(_make(verdict, days_ago=15))
    # W1 (30~60d ago): 60%
    for i in range(75):
        verdict = "valid" if i % 5 < 3 else "invalid"
        outcomes.append(_make(verdict, days_ago=45))
    # W2 (60~90d ago): 30% (floor 위반)
    for i in range(75):
        verdict = "valid" if i % 10 < 3 else "invalid"
        outcomes.append(_make(verdict, days_ago=75))

    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 225
    assert gs.passed is False
    assert gs.reason == "failed_threshold"
    assert gs.floor_accuracy < F60_FLOOR_THRESHOLD
    assert gs.median_accuracy >= F60_MEDIAN_THRESHOLD  # median은 OK


def test_failed_median_below_threshold():
    """모든 window 0.45 → median 0.45 (<0.55) → FAIL."""
    outcomes = []
    # Each window: 75 outcomes, ~45% valid → window accuracy ≈ 0.45
    for win_idx, days in enumerate([15, 45, 75]):
        for i in range(75):
            verdict = "valid" if i < 34 else "invalid"  # 34/75 = 0.453
            outcomes.append(_make(verdict, days_ago=days))

    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 225
    assert gs.passed is False
    assert gs.reason == "failed_threshold"
    assert gs.median_accuracy < F60_MEDIAN_THRESHOLD
    # All three windows around 0.45
    for acc in gs.window_accuracies:
        assert 0.40 <= acc <= 0.50


def test_too_late_counted_as_loss():
    """too_late는 denominator에 포함 (loss)."""
    outcomes = []
    for i in range(225):
        days_ago = (i % 90) + 1
        # 70% valid, 30% too_late
        verdict = "valid" if i % 10 < 7 else "too_late"
        outcomes.append(_make(verdict, days_ago=days_ago))

    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 225
    # too_late는 loss → win_rate ~ 0.7 → PASS
    assert gs.median_accuracy >= 0.6
    assert gs.passed is True


def test_split_rolling_windows_assignment():
    """30/60/90일 경계에 따라 window 할당."""
    now = datetime(2026, 4, 27, tzinfo=timezone.utc)
    outcomes = [
        FakeOutcome(user_verdict="valid", verdict_at=now - timedelta(days=15)),  # W0
        FakeOutcome(user_verdict="valid", verdict_at=now - timedelta(days=45)),  # W1
        FakeOutcome(user_verdict="valid", verdict_at=now - timedelta(days=75)),  # W2
        FakeOutcome(user_verdict="valid", verdict_at=now - timedelta(days=120)), # 제외
    ]
    windows = _split_rolling_windows(outcomes, now=now)
    assert len(windows) == 3
    assert len(windows[0]) == 1
    assert len(windows[1]) == 1
    assert len(windows[2]) == 1


def test_insufficient_windows_only_one_filled():
    """1개 window만 데이터 있고 나머지 비어있음 → insufficient_windows."""
    outcomes = [_make("valid", days_ago=15) for _ in range(225)]  # 전부 W0
    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.passed is False
    assert gs.reason == "insufficient_windows"


def test_pending_outcomes_excluded():
    """outcome=pending이지만 verdict는 있는 경우 → 카운트됨 (verdict 기준)."""
    outcomes = [_make("invalid") for _ in range(300)]  # 다 invalid
    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 300
    # All invalid → win_rate=0 → fail
    assert gs.passed is False
    assert gs.median_accuracy == 0.0


def test_gate_status_dataclass_defaults():
    gs = GateStatus(slug="x")
    assert gs.passed is False
    assert gs.reason == "insufficient_data"
    assert gs.median_threshold == 0.55
    assert gs.floor_threshold == 0.40


# ── W-0253: min-samples-per-window boundary tests ─────────────────────────

def _make_windows(w0_n: int, w1_n: int, w2_n: int, *, win_frac: float = 0.7) -> list:
    """Build outcomes spread across 3 windows at 15/45/75 days ago."""
    outcomes = []
    for n, days_ago in [(w0_n, 15), (w1_n, 45), (w2_n, 75)]:
        for i in range(n):
            verdict = "valid" if i < int(n * win_frac) else "invalid"
            outcomes.append(_make(verdict, days_ago=days_ago))
    return outcomes


def test_min_samples_per_window_below_threshold():
    """Windows with < F60_MIN_SAMPLES_PER_WINDOW samples are excluded.

    Scenario: 200 total verdicts but W0=5, W1=5, rest in W2.
    Only W2 qualifies → < 2 qualifying windows → insufficient_windows.
    """
    outcomes = []
    # W0: 5 samples (below 10) → excluded
    for i in range(5):
        outcomes.append(_make("valid" if i < 4 else "invalid", days_ago=15))
    # W1: 5 samples (below 10) → excluded
    for i in range(5):
        outcomes.append(_make("valid" if i < 4 else "invalid", days_ago=45))
    # W2: 190 samples (above 10) → included
    for i in range(190):
        outcomes.append(_make("valid" if i < 133 else "invalid", days_ago=75))

    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 200
    assert gs.passed is False
    assert gs.reason == "insufficient_windows"
    # Only 1 window qualifies (W2) → cannot compute median of 2
    assert len(gs.window_accuracies) < 2


def test_min_samples_per_window_at_threshold():
    """Windows with exactly F60_MIN_SAMPLES_PER_WINDOW samples are included."""
    min_n = F60_MIN_SAMPLES_PER_WINDOW  # 10
    # 3 windows × 10 samples = 30 → below 200 total verdict gate
    # Use 200+ total by padding W2
    outcomes = []
    # W0: exactly 10 (≥ threshold → included)
    for i in range(min_n):
        outcomes.append(_make("valid" if i < 7 else "invalid", days_ago=15))
    # W1: exactly 10 (≥ threshold → included)
    for i in range(min_n):
        outcomes.append(_make("valid" if i < 7 else "invalid", days_ago=45))
    # W2: 180 to clear 200 total verdict gate
    for i in range(180):
        outcomes.append(_make("valid" if i < 126 else "invalid", days_ago=75))

    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 200
    # All 3 windows have ≥ 10 samples → 3 accuracies → can evaluate
    assert len(gs.window_accuracies) == 3


def test_min_samples_per_window_above_threshold():
    """Windows with > F60_MIN_SAMPLES_PER_WINDOW samples all qualify.

    Standard happy path — uniform 70% accuracy across 3 windows × 75 samples.
    """
    outcomes = _make_windows(75, 75, 75, win_frac=0.7)
    gs = _compute_gate_status("test_slug", outcomes)
    assert gs.verdict_count == 225
    assert len(gs.window_accuracies) == 3
    assert gs.passed is True
    assert gs.median_accuracy >= F60_MEDIAN_THRESHOLD
