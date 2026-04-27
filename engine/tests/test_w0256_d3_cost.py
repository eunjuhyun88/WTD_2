"""W-0256 Priority A2: D3 round-trip cost augment tests.

Verifies the augment-only addition of ``roundtrip_cost_bps``,
``apply_cost``, and ``cost_adjusted_forward_peak_return_pct`` to the
pattern_search promotion gate without changing existing behaviour.
"""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from research.pattern_search import (
    DEFAULT_PROMOTION_GATE_POLICY,
    PromotionGatePolicy,
    VariantCaseResult,
    VariantSearchResult,
    _promotion_metrics_from_cases,
    build_promotion_report,
)


def _make_case(
    *,
    case_id: str,
    role: str,
    entry_hit: bool,
    forward_peak_return_pct: float | None,
    cost_adjusted_forward_peak_return_pct: float | None = None,
) -> VariantCaseResult:
    return VariantCaseResult(
        case_id=case_id,
        symbol="BTCUSDT",
        role=role,
        observed_phase_path=["FAKE_DUMP", "ARCH_ZONE"],
        current_phase="ARCH_ZONE",
        phase_fidelity=0.8,
        phase_depth_progress=0.6,
        entry_hit=entry_hit,
        target_hit=False,
        lead_bars=2 if entry_hit else None,
        score=0.5,
        forward_peak_return_pct=forward_peak_return_pct,
        cost_adjusted_forward_peak_return_pct=cost_adjusted_forward_peak_return_pct,
    )


def test_default_policy_keeps_cost_zero_and_apply_cost_true():
    """Default production policy must remain numerically backward-compatible."""
    assert DEFAULT_PROMOTION_GATE_POLICY.roundtrip_cost_bps == 0.0
    assert DEFAULT_PROMOTION_GATE_POLICY.apply_cost is True


def test_metrics_apply_cost_false_uses_paper_return():
    cases = [
        _make_case(
            case_id="c1",
            role="reference",
            entry_hit=True,
            forward_peak_return_pct=6.0,
            cost_adjusted_forward_peak_return_pct=4.5,
        ),
    ]
    metrics = _promotion_metrics_from_cases(
        cases, min_entry_profit_pct=5.0, apply_cost=False
    )
    # 6.0 >= 5.0 → 1.0, regardless of cost-adjusted column.
    assert metrics["entry_profitable_rate"] == 1.0


def test_metrics_apply_cost_true_uses_cost_adjusted_return():
    cases = [
        _make_case(
            case_id="c1",
            role="reference",
            entry_hit=True,
            forward_peak_return_pct=6.0,
            cost_adjusted_forward_peak_return_pct=4.5,
        ),
    ]
    metrics = _promotion_metrics_from_cases(
        cases, min_entry_profit_pct=5.0, apply_cost=True
    )
    # 4.5 < 5.0 → 0.0 (cost knocked the case below threshold).
    assert metrics["entry_profitable_rate"] == 0.0


def test_metrics_apply_cost_falls_back_to_paper_when_cost_adjusted_missing():
    """Legacy data (BenchmarkPack JSON written before W-0256) must still evaluate."""
    cases = [
        _make_case(
            case_id="c1",
            role="reference",
            entry_hit=True,
            forward_peak_return_pct=7.0,
            cost_adjusted_forward_peak_return_pct=None,
        ),
    ]
    metrics = _promotion_metrics_from_cases(
        cases, min_entry_profit_pct=5.0, apply_cost=True
    )
    assert metrics["entry_profitable_rate"] == 1.0


def test_promotion_report_default_policy_is_cost_neutral():
    """policy.roundtrip_cost_bps == 0 → metric uses paper return."""
    cases = [
        _make_case(
            case_id="ref-1",
            role="reference",
            entry_hit=True,
            forward_peak_return_pct=8.0,
            cost_adjusted_forward_peak_return_pct=8.0,
        ),
    ]
    winner = VariantSearchResult(
        variant_id="vid",
        variant_slug="slug",
        reference_score=0.7,
        holdout_score=None,
        overall_score=0.7,
        case_results=cases,
    )
    report = build_promotion_report("test_pattern", winner)
    assert report.entry_profitable_rate == 1.0


def test_promotion_report_with_cost_subtracts_from_paper_return():
    cases = [
        _make_case(
            case_id="ref-1",
            role="reference",
            entry_hit=True,
            forward_peak_return_pct=6.0,
            cost_adjusted_forward_peak_return_pct=4.5,
        ),
    ]
    winner = VariantSearchResult(
        variant_id="vid",
        variant_slug="slug",
        reference_score=0.7,
        holdout_score=None,
        overall_score=0.7,
        case_results=cases,
    )
    cost_policy = PromotionGatePolicy(
        roundtrip_cost_bps=15.0,
        apply_cost=True,
    )
    report = build_promotion_report("test_pattern", winner, policy=cost_policy)
    # 4.5 < 5.0 (default min_entry_profit_pct) → 0.0
    assert report.entry_profitable_rate == 0.0


def test_promotion_policy_to_dict_round_trip():
    policy = PromotionGatePolicy(
        roundtrip_cost_bps=15.0,
        apply_cost=True,
    )
    payload = policy.to_dict()
    assert payload["roundtrip_cost_bps"] == 15.0
    assert payload["apply_cost"] is True


def test_variant_case_result_to_dict_includes_cost_adjusted():
    case = _make_case(
        case_id="c1",
        role="reference",
        entry_hit=True,
        forward_peak_return_pct=6.0,
        cost_adjusted_forward_peak_return_pct=4.5,
    )
    payload = case.to_dict()
    assert payload["cost_adjusted_forward_peak_return_pct"] == pytest.approx(4.5)
    # Backward-compatible: original column remains.
    assert payload["forward_peak_return_pct"] == pytest.approx(6.0)
