"""W-0258 Priority B2: D5 F-60 gate Layer B (subjective override) tests.

Verifies augment-only addition of:
- ``PromotionGatePolicy.require_subjective_gate`` + ``subjective_gate_signature``
- ``PromotionReport.subjective_gate_passed``
- ``decision_path = "layer_b_override"`` 4-way extension
- Backward-compat: legacy "strict" / "trading_edge" / "rejected" preserved
"""

from __future__ import annotations

import pytest

from research.pattern_search import (
    PromotionGatePolicy,
    PromotionReport,
    VariantCaseResult,
    VariantSearchResult,
    build_promotion_report,
)


def _passing_cases() -> list[VariantCaseResult]:
    """53 cases that comfortably pass strict gates (high recall, target hit)."""
    cases = []
    for i in range(53):
        role = "reference" if i < 40 else "holdout"
        cases.append(
            VariantCaseResult(
                case_id=f"c{i}",
                symbol="BTCUSDT",
                role=role,
                observed_phase_path=["FAKE_DUMP", "ARCH_ZONE", "BREAKOUT"],
                current_phase="BREAKOUT",
                phase_fidelity=0.9,
                phase_depth_progress=0.9,
                entry_hit=True,
                target_hit=True,
                lead_bars=5,
                score=0.8,
                forward_peak_return_pct=10.0,
                cost_adjusted_forward_peak_return_pct=10.0,
            )
        )
    return cases


def _failing_cases() -> list[VariantCaseResult]:
    """53 cases that fail strict gates (no entry hit)."""
    cases = []
    for i in range(53):
        role = "reference" if i < 40 else "holdout"
        cases.append(
            VariantCaseResult(
                case_id=f"c{i}",
                symbol="BTCUSDT",
                role=role,
                observed_phase_path=["FAKE_DUMP"],
                current_phase="FAKE_DUMP",
                phase_fidelity=0.2,
                phase_depth_progress=0.1,
                entry_hit=False,
                target_hit=False,
                lead_bars=None,
                score=0.05,
                forward_peak_return_pct=None,
            )
        )
    return cases


def _winner(cases: list[VariantCaseResult]) -> VariantSearchResult:
    return VariantSearchResult(
        variant_id="v",
        variant_slug="s",
        reference_score=0.7,
        holdout_score=0.6,
        overall_score=0.67,
        case_results=cases,
    )


# ---------- Default policy (Layer B disabled) ----------


def test_default_policy_layer_b_is_disabled():
    assert PromotionGatePolicy().require_subjective_gate is False
    assert PromotionGatePolicy().subjective_gate_signature is None


def test_default_policy_passing_case_promotes_via_strict():
    report = build_promotion_report("p", _winner(_passing_cases()))
    assert report.decision == "promote_candidate"
    assert report.decision_path == "strict"
    assert report.subjective_gate_passed is None  # Layer B disabled


def test_default_policy_failing_case_rejects():
    report = build_promotion_report("p", _winner(_failing_cases()))
    assert report.decision == "reject"
    assert report.decision_path == "rejected"
    assert report.subjective_gate_passed is None


# ---------- Layer B required ----------


def test_require_layer_b_without_signature_blocks_strict_pass():
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature=None,
    )
    report = build_promotion_report("p", _winner(_passing_cases()), policy=policy)
    assert report.decision == "reject"
    assert report.decision_path == "rejected"
    assert report.subjective_gate_passed is False


def test_require_layer_b_with_empty_signature_blocks_strict_pass():
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature="   ",  # whitespace only
    )
    report = build_promotion_report("p", _winner(_passing_cases()), policy=policy)
    assert report.decision == "reject"
    assert report.subjective_gate_passed is False


def test_require_layer_b_with_signature_promotes_via_strict():
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature="user:eunjuhyun88@2026-04-27",
    )
    report = build_promotion_report("p", _winner(_passing_cases()), policy=policy)
    assert report.decision == "promote_candidate"
    assert report.decision_path == "strict"
    assert report.subjective_gate_passed is True


def test_layer_b_override_promotes_when_layer_a_rejects():
    """Failing strict gates BUT subjective signature → layer_b_override."""
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature="user:override-by-cto",
    )
    report = build_promotion_report("p", _winner(_failing_cases()), policy=policy)
    assert report.decision == "promote_candidate"
    assert report.decision_path == "layer_b_override"
    assert report.subjective_gate_passed is True


def test_layer_a_rejected_no_signature_stays_rejected():
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature=None,
    )
    report = build_promotion_report("p", _winner(_failing_cases()), policy=policy)
    assert report.decision == "reject"
    assert report.decision_path == "rejected"
    assert report.subjective_gate_passed is False


# ---------- Round trip ----------


def test_promotion_report_to_dict_includes_subjective_gate_passed():
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature="sig",
    )
    report = build_promotion_report("p", _winner(_passing_cases()), policy=policy)
    payload = report.to_dict()
    assert payload["subjective_gate_passed"] is True


def test_promotion_policy_to_dict_round_trip():
    policy = PromotionGatePolicy(
        require_subjective_gate=True,
        subjective_gate_signature="user:approved",
    )
    payload = policy.to_dict()
    assert payload["require_subjective_gate"] is True
    assert payload["subjective_gate_signature"] == "user:approved"
