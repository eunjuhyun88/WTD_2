"""Tests for W-0290 Phase 1 pattern validation reporter module."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from engine.research.validation.reporters import (
    GateResult,
    PatternValidationReport,
    RegimeSummary,
)


def _make_report(**overrides) -> PatternValidationReport:
    defaults = dict(
        pattern_slug="breakout_v1",
        pattern_version="1.0",
        generated_at=datetime(2024, 1, 15, tzinfo=timezone.utc),
        cost_model_id="binance_perp_taker_15bps_v1",
        n_entries=50,
        entry_source="benchmark_proxy",
        horizons_hours=[4, 8, 24],
        mean_net_bps=25.0,
        median_net_bps=20.0,
        hit_rate=0.57,
        payoff_ratio=1.8,
        profit_factor=1.5,
        mfe_bps=40.0,
        mae_bps=-15.0,
        bootstrap_ci=(5.0, 45.0),
        t_vs_b0=2.5,
        t_vs_b1=1.8,
        t_vs_b2=1.5,
        fold_pass_count=4,
        bh_q=0.03,
        dsr=0.5,
        mann_whitney_p=0.02,
    )
    defaults.update(overrides)
    return PatternValidationReport(**defaults)


class TestCatalogLowN:
    def test_n_below_30_stays_catalog(self) -> None:
        report = _make_report(n_entries=10).finalize()
        assert report.promotion_level == "catalog"

    def test_n_exactly_29_stays_catalog(self) -> None:
        report = _make_report(n_entries=29).finalize()
        assert report.promotion_level == "catalog"

    def test_zero_mean_stays_catalog(self) -> None:
        report = _make_report(n_entries=50, mean_net_bps=0.0).finalize()
        assert report.promotion_level == "catalog"

    def test_negative_mean_stays_catalog(self) -> None:
        report = _make_report(n_entries=50, mean_net_bps=-5.0).finalize()
        assert report.promotion_level == "catalog"

    def test_negative_t_b0_stays_catalog(self) -> None:
        report = _make_report(n_entries=50, t_vs_b0=-0.1).finalize()
        assert report.promotion_level == "catalog"


class TestResearchCandidate:
    def test_n30_plus_positive_mean_and_t_becomes_candidate(self) -> None:
        report = _make_report(
            n_entries=30,
            mean_net_bps=10.0,
            t_vs_b0=0.1,
            # Prevent validated: low fold_pass
            fold_pass_count=0,
        ).finalize()
        assert report.promotion_level == "research_candidate"

    def test_exactly_30_qualifies(self) -> None:
        report = _make_report(
            n_entries=30,
            mean_net_bps=5.0,
            t_vs_b0=1.0,
            fold_pass_count=0,
        ).finalize()
        assert report.promotion_level == "research_candidate"


class TestValidatedRequiresCV:
    def test_fold_pass_3_does_not_promote_to_validated(self) -> None:
        report = _make_report(
            n_entries=50,
            mean_net_bps=25.0,
            t_vs_b0=2.5,
            t_vs_b1=1.8,
            t_vs_b2=1.5,
            bootstrap_ci=(5.0, 45.0),
            fold_pass_count=3,  # < 4 → cannot reach validated
        ).finalize()
        assert report.promotion_level == "research_candidate"

    def test_fold_pass_4_with_all_conditions_reaches_validated(self) -> None:
        report = _make_report(
            n_entries=50,
            mean_net_bps=25.0,
            t_vs_b0=2.5,
            t_vs_b1=0.1,
            t_vs_b2=0.1,
            bootstrap_ci=(5.0, 45.0),
            fold_pass_count=4,
            # No G1/G2 gates → stays at validated
            gates=[],
        ).finalize()
        assert report.promotion_level == "validated"

    def test_ci_lower_zero_prevents_validated(self) -> None:
        report = _make_report(
            bootstrap_ci=(0.0, 45.0),
            fold_pass_count=4,
        ).finalize()
        assert report.promotion_level == "research_candidate"


class TestF60Publishable:
    def test_validated_plus_g1_g2_becomes_f60(self) -> None:
        gates = [
            GateResult(gate_id="G1", passed=True, reason="t>=2.0"),
            GateResult(gate_id="G2", passed=True, reason="dsr>0"),
        ]
        report = _make_report(
            n_entries=50,
            mean_net_bps=25.0,
            t_vs_b0=2.5,
            t_vs_b1=0.1,
            t_vs_b2=0.1,
            bootstrap_ci=(5.0, 45.0),
            fold_pass_count=4,
            gates=gates,
        ).finalize()
        assert report.promotion_level == "f60_publishable"

    def test_g1_fail_blocks_f60(self) -> None:
        gates = [
            GateResult(gate_id="G1", passed=False, reason="t<2.0"),
            GateResult(gate_id="G2", passed=True, reason="dsr>0"),
        ]
        report = _make_report(
            n_entries=50,
            mean_net_bps=25.0,
            t_vs_b0=2.5,
            t_vs_b1=0.1,
            t_vs_b2=0.1,
            bootstrap_ci=(5.0, 45.0),
            fold_pass_count=4,
            gates=gates,
        ).finalize()
        assert report.promotion_level == "validated"


class TestSummaryText:
    def test_summary_text_runs_without_error(self) -> None:
        report = _make_report().finalize()
        text = report.summary_text()
        assert isinstance(text, str)
        assert len(text) > 0

    def test_summary_contains_pattern_slug(self) -> None:
        report = _make_report(pattern_slug="my_pattern_v2").finalize()
        text = report.summary_text()
        assert "my_pattern_v2" in text

    def test_summary_contains_promotion_level(self) -> None:
        report = _make_report(n_entries=10).finalize()  # → catalog
        text = report.summary_text()
        assert "CATALOG" in text

    def test_summary_with_regime_and_gates(self) -> None:
        regimes = [RegimeSummary(regime="bull", n=20, mean_net_bps=30.0, t_stat=2.1)]
        gates = [GateResult(gate_id="G1", passed=True, reason="t=2.5")]
        report = _make_report(regime_summary=regimes, gates=gates).finalize()
        text = report.summary_text()
        assert "bull" in text
        assert "G1" in text


class TestToJsonRoundtrip:
    def test_to_json_is_valid_json(self) -> None:
        report = _make_report().finalize()
        json_str = report.to_json()
        parsed = json.loads(json_str)
        assert isinstance(parsed, dict)

    def test_to_json_contains_key_fields(self) -> None:
        report = _make_report(pattern_slug="test_slug").finalize()
        parsed = json.loads(report.to_json())
        assert parsed["pattern_slug"] == "test_slug"
        assert "promotion_level" in parsed
        assert "generated_at" in parsed

    def test_to_dict_bootstrap_ci_is_list(self) -> None:
        report = _make_report(bootstrap_ci=(1.0, 10.0)).finalize()
        d = report.to_dict()
        assert isinstance(d["bootstrap_ci"], list)
        assert d["bootstrap_ci"] == [1.0, 10.0]

    def test_to_json_no_float_inf(self) -> None:
        report = _make_report().finalize()
        json_str = report.to_json()
        assert "Infinity" not in json_str
        assert "NaN" not in json_str
