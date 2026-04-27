"""V-04 (W-0222) — Sequence Completion Test (M3) thin wrapper.

Implements W-0214 §3.2 M3 (Sequence Completion Rate) and §3.7 G6
(sequence monotonic). This module is a *thin wrapper* of three
``pattern_search.py`` primitives:

* ``_phase_path_in_order``       -> ``completion_rate``
* ``_phase_depth_progress``      -> ``depth_progress``
* ``summarize_phase_attempt_records`` -> ``phase_summary``

The only logic added here is ``_count_monotonic_violations`` which
counts how often ``observed_path`` jumps backwards through
``expected_path``. ``pattern_search.py`` is treated as READ-ONLY
(V-00 augment-only enforcement, W-0214 §14.8).

Forward-return comparisons (M3 vs base rate) are out of scope -- they
live in V-08 (W-0221) which composes V-04 with V-02 (M1 phase_eval).
"""

from __future__ import annotations

from dataclasses import dataclass

from ledger.types import PatternLedgerRecord
from research.pattern_search import (
    PhaseAttemptSummary,
    _phase_depth_progress,
    _phase_path_in_order,
    summarize_phase_attempt_records,
)

__all__ = [
    "SequenceCompletionResult",
    "measure_sequence_completion",
]


@dataclass(frozen=True)
class SequenceCompletionResult:
    """W-0214 §3.2 M3 metric for a single pattern.

    Attributes:
        pattern_slug: identifier of the pattern under measurement.
        expected_path: canonical phase order from PatternObject.
        observed_path: phases actually traversed (deduped or not -- caller
            decides).
        completion_rate: ``_phase_path_in_order`` result, ``0.0`` ~ ``1.0``.
        depth_progress: ``_phase_depth_progress`` result -- furthest phase
            reached / total phases.
        monotonic_violation_count: number of times observed_path moves to
            an earlier expected-path index. ``0`` -> G6 pass.
        n_attempts: ``len(phase_attempts)`` -- number of ledger records
            considered.
        phase_summary: ``PhaseAttemptSummary`` aggregating ``failed_reason``
            and ``missing_blocks`` counts (W-0214 §3.7 diagnostic). May be
            ``None`` if no records were supplied.
    """

    pattern_slug: str
    expected_path: tuple[str, ...]
    observed_path: tuple[str, ...]
    completion_rate: float
    depth_progress: float
    monotonic_violation_count: int
    n_attempts: int
    phase_summary: PhaseAttemptSummary | None


def measure_sequence_completion(
    pattern_slug: str,
    expected_path: list[str],
    observed_path: list[str],
    phase_attempts: list[PatternLedgerRecord],
    current_phase: str,
) -> SequenceCompletionResult:
    """W-0214 §3.2 M3 thin wrapper.

    Composes three pattern_search primitives plus a local monotonic-
    violation counter. No statistical evaluation -- forward-return
    comparison belongs to V-08 (W-0221).

    Args:
        pattern_slug: pattern identifier.
        expected_path: canonical phase order. May be empty (treated as
            no-op: completion / progress / violations all zero).
        observed_path: phases observed in chronological order. Phases
            absent from ``expected_path`` are ignored for the violation
            count (and for ``_phase_depth_progress``).
        phase_attempts: ledger records for diagnostic aggregation.
        current_phase: phase the pattern is currently sitting on (used by
            ``_phase_depth_progress`` to extend ``observed_path`` for the
            depth measurement only).

    Returns:
        SequenceCompletionResult.
    """
    completion = _phase_path_in_order(expected_path, observed_path)
    progress = _phase_depth_progress(expected_path, observed_path, current_phase)
    summary: PhaseAttemptSummary | None = (
        summarize_phase_attempt_records(phase_attempts) if phase_attempts else None
    )
    violations = _count_monotonic_violations(expected_path, observed_path)
    return SequenceCompletionResult(
        pattern_slug=pattern_slug,
        expected_path=tuple(expected_path),
        observed_path=tuple(observed_path),
        completion_rate=float(completion),
        depth_progress=float(progress),
        monotonic_violation_count=violations,
        n_attempts=len(phase_attempts),
        phase_summary=summary,
    )


def _count_monotonic_violations(expected: list[str], observed: list[str]) -> int:
    """Count phases that fall behind the running high-water mark.

    Semantics (PRD W-0222 §6): every observed phase whose index in
    ``expected`` is strictly less than the maximum index seen so far
    counts as one violation. This is **not** a transition-based count
    (each step backwards from peak counts -- once D=3 establishes the
    high-water mark, B/C/A all count as violations even though B->C is
    a forward step).

    A repeat of the same phase (cycle / dwell, idx == last_idx) is
    **not** a violation (W-0222 §10 Q2). Phases not in ``expected``
    are ignored. Empty ``expected`` returns ``0``.
    """
    if not expected:
        return 0
    expected_idx = {phase: idx for idx, phase in enumerate(expected)}
    last_idx = -1
    violations = 0
    for phase in observed:
        if phase not in expected_idx:
            continue
        idx = expected_idx[phase]
        if idx < last_idx:
            violations += 1
        if idx > last_idx:
            last_idx = idx
    return violations
