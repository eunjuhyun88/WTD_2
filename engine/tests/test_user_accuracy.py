"""Tests for H-08: per-user verdict accuracy.

Covers:
- 5-cat accuracy formula (valid=correct on success, invalid=correct on failure)
- soft labels (near_miss, too_early, too_late) count as resolved but not correct
- pending outcomes excluded from resolved
- gate_eligible threshold
"""
from __future__ import annotations

from stats.user_accuracy import (
    _F60_GATE_MIN_ACCURACY,
    _F60_GATE_MIN_COUNT,
    UserAccuracy,
    _safe_div,
)


def _make_accuracy(
    verdict_count: int,
    resolved_count: int,
    correct_count: int,
) -> UserAccuracy:
    accuracy = _safe_div(correct_count, resolved_count)
    return UserAccuracy(
        user_id="test-user",
        verdict_count=verdict_count,
        resolved_count=resolved_count,
        correct_count=correct_count,
        accuracy=round(accuracy, 4),
        gate_eligible=resolved_count >= _F60_GATE_MIN_COUNT and accuracy >= _F60_GATE_MIN_ACCURACY,
        remaining_for_gate=max(0, _F60_GATE_MIN_COUNT - resolved_count),
    )


class TestAccuracyFormula:
    def test_valid_on_success_is_correct(self):
        # valid verdict + success outcome → correct
        acc = _make_accuracy(verdict_count=1, resolved_count=1, correct_count=1)
        assert acc.accuracy == 1.0

    def test_invalid_on_failure_is_correct(self):
        acc = _make_accuracy(verdict_count=1, resolved_count=1, correct_count=1)
        assert acc.accuracy == 1.0

    def test_near_miss_on_success_is_correct(self):
        # near_miss = "setup valid but entry missed by a little" → outcome should be success
        acc = _make_accuracy(verdict_count=1, resolved_count=1, correct_count=1)
        assert acc.accuracy == 1.0

    def test_valid_on_failure_is_incorrect(self):
        acc = _make_accuracy(verdict_count=1, resolved_count=1, correct_count=0)
        assert acc.accuracy == 0.0

    def test_soft_labels_not_correct(self):
        # too_late / near_miss / too_early: resolved=1, correct=0
        acc = _make_accuracy(verdict_count=1, resolved_count=1, correct_count=0)
        assert acc.accuracy == 0.0
        acc2 = _make_accuracy(verdict_count=1, resolved_count=1, correct_count=0)
        assert acc2.accuracy == 0.0

    def test_pending_excluded_from_resolved(self):
        # 5 verdicts, only 3 resolved (2 still pending)
        acc = _make_accuracy(verdict_count=5, resolved_count=3, correct_count=2)
        assert acc.resolved_count == 3
        assert acc.accuracy == round(2 / 3, 4)

    def test_mixed_scenario(self):
        # 10 verdicts: 6 resolved (4 correct, 2 incorrect), 4 pending
        acc = _make_accuracy(verdict_count=10, resolved_count=6, correct_count=4)
        assert acc.accuracy == round(4 / 6, 4)

    def test_no_verdicts(self):
        acc = _make_accuracy(verdict_count=0, resolved_count=0, correct_count=0)
        assert acc.accuracy == 0.0
        assert not acc.gate_eligible


class TestGateEligibility:
    def test_gate_eligible_when_200_resolved_and_55pct(self):
        acc = _make_accuracy(verdict_count=250, resolved_count=200, correct_count=110)
        assert acc.gate_eligible is True

    def test_not_eligible_below_200(self):
        acc = _make_accuracy(verdict_count=150, resolved_count=150, correct_count=100)
        assert acc.gate_eligible is False
        assert acc.remaining_for_gate == 50

    def test_not_eligible_below_accuracy_threshold(self):
        acc = _make_accuracy(verdict_count=250, resolved_count=200, correct_count=100)
        # 100/200 = 0.50 < 0.55
        assert acc.gate_eligible is False

    def test_remaining_for_gate_zero_when_above(self):
        acc = _make_accuracy(verdict_count=300, resolved_count=250, correct_count=150)
        assert acc.remaining_for_gate == 0


class TestSafeDiv:
    def test_safe_div_normal(self):
        assert _safe_div(3, 4) == 0.75

    def test_safe_div_zero_denominator(self):
        assert _safe_div(5, 0) == 0.0
