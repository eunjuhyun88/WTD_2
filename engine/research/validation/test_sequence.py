"""Unit tests for V-04 (W-0222) sequence completion thin wrapper."""

from __future__ import annotations

import time

import pytest

from ledger.types import PatternLedgerRecord
from research.pattern_search import PhaseAttemptSummary
from research.validation.sequence import (
    SequenceCompletionResult,
    _count_monotonic_violations,
    measure_sequence_completion,
)


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


def _record(pattern: str = "p", failed_reason: str | None = None) -> PatternLedgerRecord:
    payload: dict = {}
    if failed_reason is not None:
        payload["failed_reason"] = failed_reason
    return PatternLedgerRecord(pattern_slug=pattern, payload=payload)


# ---------------------------------------------------------------------------
# measure_sequence_completion -- 8 acceptance cases (W-0222 §5)
# ---------------------------------------------------------------------------


def test_empty_expected_path_returns_zero_metrics() -> None:
    """Edge: expected_path = [] -> completion 0, progress 0, violations 0."""
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=[],
        observed_path=["A", "B"],
        phase_attempts=[],
        current_phase="B",
    )
    assert result.completion_rate == 0.0
    assert result.depth_progress == 0.0
    assert result.monotonic_violation_count == 0
    assert result.n_attempts == 0
    assert result.phase_summary is None


def test_empty_observed_path_returns_zero_completion() -> None:
    """Edge: observed_path = [] -> completion 0, progress 0 (current not in path)."""
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A", "B", "C"],
        observed_path=[],
        phase_attempts=[],
        current_phase="UNKNOWN",
    )
    assert result.completion_rate == 0.0
    assert result.depth_progress == 0.0
    assert result.monotonic_violation_count == 0


def test_exact_full_match_passes_g6() -> None:
    """Happy path: observed = expected -> completion 1.0, violations 0 (G6 pass)."""
    expected = ["A", "B", "C"]
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=expected,
        observed_path=expected,
        phase_attempts=[_record()],
        current_phase="C",
    )
    assert result.completion_rate == pytest.approx(1.0)
    assert result.depth_progress == pytest.approx(1.0)
    assert result.monotonic_violation_count == 0  # G6 pass
    assert result.n_attempts == 1


def test_partial_in_order_completion() -> None:
    """observed = first half of expected -> completion = matched / len(expected)."""
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A", "B", "C", "D"],
        observed_path=["A", "B"],
        phase_attempts=[],
        current_phase="B",
    )
    # _phase_path_in_order returns matches / len(expected) = 2/4
    assert result.completion_rate == pytest.approx(0.5)
    # depth_progress: max(idx of A=0, B=1, current B=1) + 1 / 4 = 2/4
    assert result.depth_progress == pytest.approx(0.5)
    assert result.monotonic_violation_count == 0


def test_monotonic_violation_counted() -> None:
    """observed = [A, C, B] in expected = [A, B, C] -> 1 violation (C@2 then B@1)."""
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A", "B", "C"],
        observed_path=["A", "C", "B"],
        phase_attempts=[],
        current_phase="B",
    )
    assert result.monotonic_violation_count == 1


def test_cycle_is_not_a_violation() -> None:
    """W-0222 §10 Q2: same phase repeated (dwell/cycle) does NOT count as violation."""
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A", "B", "C"],
        observed_path=["A", "A", "B", "B"],
        phase_attempts=[],
        current_phase="B",
    )
    assert result.monotonic_violation_count == 0


def test_unknown_phase_ignored_in_violations() -> None:
    """Phases not in expected_path are ignored by violation counter.

    Note: ``_phase_path_in_order`` burns through ``expected`` while
    searching for an unknown phase, so a single unknown phase early in
    ``observed`` exhausts the remaining expected slots. We only check
    that the violation counter ignores unknown phases.
    """
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A", "B", "C"],
        observed_path=["A", "X", "Y", "B"],  # X/Y not in expected
        phase_attempts=[],
        current_phase="B",
    )
    assert result.monotonic_violation_count == 0
    # _phase_path_in_order trait: X exhausts idx -> B can't match -> 1/3
    assert result.completion_rate == pytest.approx(1 / 3)


def test_records_aggregate_into_phase_summary() -> None:
    """phase_attempts non-empty -> phase_summary is PhaseAttemptSummary with counts."""
    records = [
        _record(failed_reason="missing_block"),
        _record(failed_reason="missing_block"),
        _record(failed_reason="threshold_miss"),
    ]
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A", "B"],
        observed_path=["A"],
        phase_attempts=records,
        current_phase="A",
    )
    assert isinstance(result.phase_summary, PhaseAttemptSummary)
    assert result.phase_summary.total_attempts == 3
    assert result.phase_summary.failed_reason_counts == {
        "missing_block": 2,
        "threshold_miss": 1,
    }
    assert result.n_attempts == 3


# ---------------------------------------------------------------------------
# extra coverage -- violation helper, perf, dataclass shape
# ---------------------------------------------------------------------------


def test_count_monotonic_violations_high_water_semantics() -> None:
    """Violations are counted against the high-water mark, not adjacent transitions.

    expected idx: A=0, B=1, C=2, D=3
    observed:     A(0) -> D(3) -> B(1) -> C(2) -> A(0)
                              ^^^^^^^   ^^^^^^^   ^^^^^^^
                              hw=3      hw=3      hw=3
                              v=1       v=2       v=3

    Once D establishes the high-water mark at 3, every subsequent phase
    with index < 3 counts as a violation (PRD W-0222 §6).
    """
    assert (
        _count_monotonic_violations(
            ["A", "B", "C", "D"],
            ["A", "D", "B", "C", "A"],
        )
        == 3
    )


def test_count_monotonic_violations_empty_expected() -> None:
    assert _count_monotonic_violations([], ["A"]) == 0


def test_dataclass_is_frozen() -> None:
    """SequenceCompletionResult is frozen (immutable)."""
    result = measure_sequence_completion(
        pattern_slug="p",
        expected_path=["A"],
        observed_path=["A"],
        phase_attempts=[],
        current_phase="A",
    )
    with pytest.raises((AttributeError, TypeError)):
        result.completion_rate = 0.0  # type: ignore[misc]


def test_performance_under_100ms_per_pattern() -> None:
    """W-0222 §5: <100ms per pattern (in-memory)."""
    expected = [f"phase_{i}" for i in range(20)]
    observed = expected * 5  # 100 phases
    records = [_record(failed_reason="r") for _ in range(50)]
    start = time.perf_counter()
    for _ in range(10):
        measure_sequence_completion(
            pattern_slug="p",
            expected_path=expected,
            observed_path=observed,
            phase_attempts=records,
            current_phase=expected[-1],
        )
    elapsed_ms = (time.perf_counter() - start) * 1000
    # 10 iterations < 100ms total -> ample headroom on per-pattern budget
    assert elapsed_ms < 100, f"perf budget exceeded: {elapsed_ms:.1f}ms"
