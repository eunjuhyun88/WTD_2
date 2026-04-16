"""Aggregation helpers for Coin Screener listings."""
from __future__ import annotations

from screener.types import (
    ActionPriority,
    ConfidenceLevel,
    ScreenerListing,
    ScreenerListingStatus,
    StructuralGrade,
    TimingState,
)


def _clamp_score(value: float) -> float:
    return round(max(0.0, min(100.0, float(value))), 3)


def classify_confidence(
    *,
    available_weight: float,
    identity_resolution_failed: bool = False,
    critical_inputs_fresh: bool = True,
) -> ConfidenceLevel:
    if identity_resolution_failed:
        return "low"
    if available_weight >= 0.85 and critical_inputs_fresh:
        return "high"
    if available_weight >= 0.65:
        return "medium"
    return "low"


def structural_grade_from_score(
    score: float,
    *,
    previous_grade: StructuralGrade | None = None,
    hard_filtered: bool = False,
) -> StructuralGrade:
    score = _clamp_score(score)
    if hard_filtered:
        return "excluded"
    if previous_grade == "A" and score >= 76.0:
        return "A"
    if score >= 82.0:
        return "A"
    if previous_grade == "B" and score >= 54.0:
        return "B"
    if score >= 60.0:
        return "B"
    return "C"


def timing_state_from_phase(pattern_phase: str | None) -> TimingState:
    phase = (pattern_phase or "").upper()
    if phase == "FAKE_DUMP":
        return "watch"
    if phase in {"ARCH_ZONE", "REAL_DUMP"}:
        return "setup_forming"
    if phase == "ACCUMULATION":
        return "accumulation_ready"
    if phase == "BREAKOUT":
        return "late"
    return "cold"


def composite_sort_score(structural_score: float, timing_score: float) -> float:
    return round(_clamp_score(structural_score) * 0.7 + _clamp_score(timing_score) * 0.3, 3)


def action_priority(
    structural_grade: StructuralGrade,
    timing_state: TimingState,
    confidence: ConfidenceLevel,
) -> ActionPriority:
    if structural_grade == "A" and timing_state == "accumulation_ready" and confidence == "high":
        return "P0"
    if structural_grade == "A" and timing_state in {"setup_forming", "accumulation_ready"} and confidence in {"high", "medium"}:
        return "P1"
    if structural_grade == "B" and timing_state == "accumulation_ready" and confidence == "high":
        return "P1"
    if (structural_grade == "A" and timing_state == "late") or (
        structural_grade == "B" and timing_state in {"setup_forming", "accumulation_ready"}
    ):
        return "P2"
    return "P3"


def build_listing(
    *,
    symbol: str,
    run_id: str,
    structural_score: float,
    timing_score: float,
    pattern_phase: str | None = None,
    previous_grade: StructuralGrade | None = None,
    available_weight: float = 1.0,
    missing_criteria: list[str] | None = None,
    stale_criteria: list[str] | None = None,
    hard_filtered: bool = False,
    identity_resolution_failed: bool = False,
    critical_inputs_fresh: bool = True,
    grade_flags: list[str] | None = None,
    base_updated_at: str | None = None,
    live_updated_at: str | None = None,
    meta: dict[str, object] | None = None,
) -> ScreenerListing:
    structural_score = _clamp_score(structural_score)
    timing_score = _clamp_score(timing_score)
    missing = list(missing_criteria or [])
    stale = list(stale_criteria or [])
    flags = list(grade_flags or [])
    confidence = classify_confidence(
        available_weight=available_weight,
        identity_resolution_failed=identity_resolution_failed,
        critical_inputs_fresh=critical_inputs_fresh,
    )
    grade = structural_grade_from_score(
        structural_score,
        previous_grade=previous_grade,
        hard_filtered=hard_filtered,
    )
    status: ScreenerListingStatus = "scored"
    if hard_filtered:
        status = "excluded"
    elif available_weight < 0.50 or identity_resolution_failed:
        status = "insufficient_data"
    elif stale and status == "scored":
        status = "stale"

    if grade == "A" and (confidence == "low" or available_weight < 0.70):
        grade = "B"

    timing_state = timing_state_from_phase(pattern_phase)
    return ScreenerListing(
        symbol=symbol.upper(),
        run_id=run_id,
        structural_score=structural_score,
        structural_grade=grade,
        timing_score=timing_score,
        timing_state=timing_state,
        composite_sort_score=composite_sort_score(structural_score, timing_score),
        confidence=confidence,
        hard_filtered=hard_filtered,
        status=status,
        grade_flags=flags,
        action_priority=action_priority(grade, timing_state, confidence),
        pattern_phase=pattern_phase,
        base_updated_at=base_updated_at,
        live_updated_at=live_updated_at,
        available_weight=round(max(0.0, min(1.0, available_weight)), 4),
        missing_criteria=missing,
        stale_criteria=stale,
        meta=dict(meta or {}),
    )
