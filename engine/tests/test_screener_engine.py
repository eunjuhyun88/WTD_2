from __future__ import annotations

from screener.engine import build_listing, structural_grade_from_score


def test_structural_grade_uses_hysteresis_for_a() -> None:
    assert structural_grade_from_score(81.0, previous_grade="A") == "A"
    assert structural_grade_from_score(75.0, previous_grade="A") == "B"


def test_build_listing_separates_grade_timing_and_confidence() -> None:
    listing = build_listing(
        symbol="ubusdt",
        run_id="scr_test",
        structural_score=84.0,
        timing_score=92.0,
        pattern_phase="ACCUMULATION",
        available_weight=0.88,
        grade_flags=["pattern_accumulation"],
    )

    assert listing.symbol == "UBUSDT"
    assert listing.structural_grade == "A"
    assert listing.timing_state == "accumulation_ready"
    assert listing.confidence == "high"
    assert listing.action_priority == "P0"


def test_build_listing_caps_grade_when_coverage_is_too_low() -> None:
    listing = build_listing(
        symbol="ubusdt",
        run_id="scr_test",
        structural_score=90.0,
        timing_score=50.0,
        available_weight=0.66,
        missing_criteria=["events", "sns"],
    )

    assert listing.structural_grade == "B"
    assert listing.confidence == "medium"


def test_build_listing_marks_insufficient_data_when_identity_fails() -> None:
    listing = build_listing(
        symbol="ubusdt",
        run_id="scr_test",
        structural_score=88.0,
        timing_score=70.0,
        available_weight=0.9,
        identity_resolution_failed=True,
    )

    assert listing.status == "insufficient_data"
    assert listing.confidence == "low"
