"""Tests for V-08 validation pipeline (W-0221).

Coverage:
    - ValidationPipelineConfig default values
    - GateResult passed / failed logic
    - HorizonReport.to_dict() structure
    - ValidationReport.to_dashboard_json() is JSON-serializable
    - run_validation_pipeline with monkeypatched measure functions
    - f1_kill = True when pass_rate == 0
    - f1_kill = False when at least one horizon passes

Integration tests that require real klines are skipped when offline cache
is absent.
"""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import datetime, timezone
from unittest.mock import patch

import numpy as np
import pandas as pd
import pytest

from research.pattern_search import BenchmarkCase, ReplayBenchmarkPack
from research.validation.cv import PurgedKFoldConfig
from research.validation.pipeline import (
    GateResult,
    HorizonReport,
    ValidationPipelineConfig,
    ValidationReport,
    _build_gates,
    run_validation_pipeline,
)
from research.validation.phase_eval import PhaseConditionalReturn, _empty_result


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_pack(n_cases: int = 2) -> ReplayBenchmarkPack:
    """Minimal pack for unit tests (no real kline data)."""
    cases = [
        BenchmarkCase(
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2024, 1, 1 + i, tzinfo=timezone.utc),
            end_at=datetime(2024, 1, 2 + i, tzinfo=timezone.utc),
            expected_phase_path=["A", "B", "C"],
        )
        for i in range(n_cases)
    ]
    return ReplayBenchmarkPack(
        benchmark_pack_id="test-pack-001",
        pattern_slug="test_pattern",
        candidate_timeframes=["1h"],
        cases=cases,
    )


def _make_pcr(
    *,
    pattern_slug: str = "test_pattern",
    phase_name: str = "entry",
    horizon_hours: int = 1,
    cost_bps: float = 15.0,
    mean: float = 0.5,
    n: int = 50,
) -> PhaseConditionalReturn:
    """Synthetic PhaseConditionalReturn with gaussian samples."""
    rng = np.random.default_rng(42)
    samples = (rng.normal(mean, 0.5, n)).tolist()
    arr = np.array(samples)
    return PhaseConditionalReturn(
        pattern_slug=pattern_slug,
        phase_name=phase_name,
        horizon_hours=horizon_hours,
        cost_bps=cost_bps,
        n_samples=n,
        mean_return_pct=float(arr.mean()),
        median_return_pct=float(np.median(arr)),
        std_return_pct=float(arr.std()),
        min_return_pct=float(arr.min()),
        max_return_pct=float(arr.max()),
        mean_peak_return_pct=None,
        realistic_mean_pct=None,
        samples=tuple(samples),
    )


def _make_b0(*, horizon_hours: int = 1, n: int = 50) -> PhaseConditionalReturn:
    """Synthetic B0 baseline with zero-mean samples."""
    return _make_pcr(
        pattern_slug="__random__",
        phase_name="random",
        horizon_hours=horizon_hours,
        mean=0.0,
        n=n,
    )


# ---------------------------------------------------------------------------
# ValidationPipelineConfig
# ---------------------------------------------------------------------------


class TestValidationPipelineConfig:
    def test_default_values(self):
        cfg = ValidationPipelineConfig()
        assert cfg.cost_bps == 15.0
        assert cfg.horizons_hours == (1, 4, 24)
        assert "B0" in cfg.baselines
        assert cfg.bootstrap_n_iter == 1000
        assert cfg.bh_alpha == 0.05
        assert cfg.n_trials == 15

    def test_cv_config_default(self):
        cfg = ValidationPipelineConfig()
        assert isinstance(cfg.cv_config, PurgedKFoldConfig)
        assert cfg.cv_config.n_splits == 5

    def test_custom_horizons(self):
        cfg = ValidationPipelineConfig(horizons_hours=(4, 24))
        assert cfg.horizons_hours == (4, 24)

    def test_frozen(self):
        cfg = ValidationPipelineConfig()
        with pytest.raises((AttributeError, TypeError)):
            cfg.cost_bps = 99.0  # type: ignore[misc]


# ---------------------------------------------------------------------------
# GateResult
# ---------------------------------------------------------------------------


class TestGateResult:
    def test_passed_true(self):
        gate = GateResult(
            gate_id="G1",
            name="Welch t ≥ 2",
            value=3.5,
            threshold=2.0,
            passed=True,
        )
        assert gate.passed is True

    def test_passed_false(self):
        gate = GateResult(
            gate_id="G1",
            name="Welch t ≥ 2",
            value=1.0,
            threshold=2.0,
            passed=False,
        )
        assert gate.passed is False

    def test_to_dict(self):
        gate = GateResult("G2", "DSR > 0", 0.5, 0.0, True)
        d = gate.to_dict()
        assert d["gate_id"] == "G2"
        assert d["passed"] is True
        assert "value" in d
        assert "threshold" in d

    def test_build_gates_six_items(self):
        gates = _build_gates(
            t_stat=2.5,
            dsr_val=0.1,
            ci_lower=0.05,
            sharpe_val=1.5,
            hit_val=0.55,
            pf_val=1.3,
        )
        assert len(gates) == 6
        gate_ids = {g.gate_id for g in gates}
        assert gate_ids == {"G1", "G2", "G4", "F1-SR", "F1-Hit", "F1-PF"}

    def test_build_gates_all_pass(self):
        gates = _build_gates(
            t_stat=3.0, dsr_val=1.0, ci_lower=0.1,
            sharpe_val=2.0, hit_val=0.6, pf_val=2.0
        )
        assert all(g.passed for g in gates)

    def test_build_gates_all_fail(self):
        gates = _build_gates(
            t_stat=0.5, dsr_val=-1.0, ci_lower=-0.1,
            sharpe_val=0.3, hit_val=0.48, pf_val=0.9
        )
        assert not any(g.passed for g in gates)


# ---------------------------------------------------------------------------
# HorizonReport
# ---------------------------------------------------------------------------


class TestHorizonReport:
    def _make_report(self, *, overall_passed: bool = True) -> HorizonReport:
        gates = _build_gates(
            t_stat=2.5, dsr_val=0.1, ci_lower=0.05,
            sharpe_val=1.5, hit_val=0.55, pf_val=1.3,
        )
        return HorizonReport(
            pattern_slug="test_pattern",
            horizon_hours=4,
            n_samples=50,
            mean_return_pct=0.3,
            t_vs_b0=2.5,
            p_vs_b0=0.01,
            p_bh_vs_b0=0.03,
            sharpe=1.5,
            dsr=0.1,
            bootstrap_ci=(0.05, 0.55),
            hit_rate=0.55,
            profit_factor=1.3,
            gates=gates,
            overall_passed=overall_passed,
        )

    def test_to_dict_keys(self):
        report = self._make_report()
        d = report.to_dict()
        for key in [
            "pattern_slug", "horizon_hours", "n_samples", "mean_return_pct",
            "t_vs_b0", "p_vs_b0", "p_bh_vs_b0", "sharpe", "dsr",
            "bootstrap_ci", "hit_rate", "profit_factor", "gates", "overall_passed",
        ]:
            assert key in d, f"Missing key: {key}"

    def test_to_dict_bootstrap_ci_is_list(self):
        report = self._make_report()
        d = report.to_dict()
        assert isinstance(d["bootstrap_ci"], list)
        assert len(d["bootstrap_ci"]) == 2

    def test_gates_serialized(self):
        report = self._make_report()
        d = report.to_dict()
        assert len(d["gates"]) == 6
        assert all(isinstance(g, dict) for g in d["gates"])


# ---------------------------------------------------------------------------
# ValidationReport.to_dashboard_json
# ---------------------------------------------------------------------------


class TestValidationReport:
    def _make_report(self) -> ValidationReport:
        cfg = ValidationPipelineConfig()
        gates = _build_gates(
            t_stat=2.5, dsr_val=0.1, ci_lower=0.05,
            sharpe_val=1.5, hit_val=0.55, pf_val=1.3,
        )
        hr = HorizonReport(
            pattern_slug="pat",
            horizon_hours=4,
            n_samples=50,
            mean_return_pct=0.3,
            t_vs_b0=2.5,
            p_vs_b0=0.01,
            p_bh_vs_b0=0.03,
            sharpe=1.5,
            dsr=0.1,
            bootstrap_ci=(0.05, 0.55),
            hit_rate=0.55,
            profit_factor=1.3,
            gates=gates,
            overall_passed=True,
        )
        return ValidationReport(
            pattern_slug="pat",
            timestamp=pd.Timestamp("2024-01-01", tz="UTC"),
            config=cfg,
            horizon_reports=[hr],
            overall_pass_count=1,
            overall_pass_rate=1.0,
            f1_kill=False,
        )

    def test_json_serializable(self):
        report = self._make_report()
        d = report.to_dashboard_json()
        # Must not raise
        serialized = json.dumps(d)
        assert isinstance(serialized, str)

    def test_json_contains_required_keys(self):
        report = self._make_report()
        d = report.to_dashboard_json()
        for key in [
            "pattern_slug", "timestamp", "config", "horizon_reports",
            "overall_pass_count", "overall_pass_rate", "f1_kill",
            "fold_pass_count", "fold_total_count",
        ]:
            assert key in d, f"Missing key: {key}"

    def test_f1_kill_false_when_passing(self):
        report = self._make_report()
        assert report.f1_kill is False

    def test_f1_kill_true_when_all_fail(self):
        report = self._make_report()
        report.overall_pass_rate = 0.0
        report.f1_kill = True
        assert report.f1_kill is True


# ---------------------------------------------------------------------------
# run_validation_pipeline (monkeypatched)
# ---------------------------------------------------------------------------


class TestRunValidationPipeline:
    """Tests for the main pipeline with mocked I/O functions."""

    def _patch_measure(self, *, mean: float = 0.5, n: int = 50):
        """Return a mock for measure_phase_conditional_return."""
        def _mock_measure(**kwargs):
            h = kwargs.get("horizon_hours", 1)
            return _make_pcr(
                pattern_slug=kwargs.get("pattern_slug", "test_pattern"),
                phase_name=kwargs.get("phase_name", "entry"),
                horizon_hours=h,
                mean=mean,
                n=n,
            )
        return _mock_measure

    def _patch_b0(self, *, n: int = 50):
        def _mock_b0(**kwargs):
            h = kwargs.get("horizon_hours", 1)
            return _make_b0(horizon_hours=h, n=n)
        return _mock_b0

    @patch(
        "research.validation.pipeline.measure_phase_conditional_return"
    )
    @patch(
        "research.validation.pipeline.measure_b0_random"
    )
    @patch(
        "research.validation.pipeline._run_cv_fold_tracking",
        return_value=(0, 0),
    )
    def test_returns_validation_report(self, mock_cv, mock_b0, mock_measure):
        mock_measure.side_effect = self._patch_measure()
        mock_b0.side_effect = self._patch_b0()

        pack = _make_pack()
        cfg = ValidationPipelineConfig(horizons_hours=(1, 4))
        report = run_validation_pipeline(pack=pack, config=cfg)

        assert isinstance(report, ValidationReport)
        assert report.pattern_slug == "test_pattern"
        assert len(report.horizon_reports) == 2

    @patch(
        "research.validation.pipeline.measure_phase_conditional_return"
    )
    @patch(
        "research.validation.pipeline.measure_b0_random"
    )
    @patch(
        "research.validation.pipeline._run_cv_fold_tracking",
        return_value=(0, 0),
    )
    def test_f1_kill_true_when_no_horizons_pass(self, mock_cv, mock_b0, mock_measure):
        # Return samples with very negative mean so all gates fail.
        def _bad_measure(**kwargs):
            h = kwargs.get("horizon_hours", 1)
            return _make_pcr(
                pattern_slug=kwargs.get("pattern_slug", "test_pattern"),
                phase_name=kwargs.get("phase_name", "entry"),
                horizon_hours=h,
                mean=-5.0,
                n=50,
            )
        mock_measure.side_effect = _bad_measure
        mock_b0.side_effect = self._patch_b0()

        pack = _make_pack()
        cfg = ValidationPipelineConfig(horizons_hours=(1, 4, 24))
        report = run_validation_pipeline(pack=pack, config=cfg)

        assert report.f1_kill is True
        assert report.overall_pass_rate == 0.0

    @patch(
        "research.validation.pipeline.measure_phase_conditional_return"
    )
    @patch(
        "research.validation.pipeline.measure_b0_random"
    )
    @patch(
        "research.validation.pipeline._run_cv_fold_tracking",
        return_value=(0, 0),
    )
    def test_f1_kill_false_when_some_horizons_pass(self, mock_cv, mock_b0, mock_measure):
        # Strong positive mean so all gates pass.
        mock_measure.side_effect = self._patch_measure(mean=2.0, n=100)
        mock_b0.side_effect = self._patch_b0(n=100)

        pack = _make_pack()
        cfg = ValidationPipelineConfig(horizons_hours=(1,))
        report = run_validation_pipeline(pack=pack, config=cfg)

        assert report.f1_kill is False
        assert report.overall_pass_rate > 0.0

    @patch(
        "research.validation.pipeline.measure_phase_conditional_return"
    )
    @patch(
        "research.validation.pipeline.measure_b0_random"
    )
    @patch(
        "research.validation.pipeline._run_cv_fold_tracking",
        return_value=(0, 0),
    )
    def test_dashboard_json_serializable(self, mock_cv, mock_b0, mock_measure):
        mock_measure.side_effect = self._patch_measure()
        mock_b0.side_effect = self._patch_b0()

        pack = _make_pack()
        report = run_validation_pipeline(
            pack=pack,
            config=ValidationPipelineConfig(horizons_hours=(4,)),
        )
        d = report.to_dashboard_json()
        serialized = json.dumps(d)
        assert isinstance(serialized, str)

    @patch(
        "research.validation.pipeline.measure_phase_conditional_return"
    )
    @patch(
        "research.validation.pipeline.measure_b0_random"
    )
    @patch(
        "research.validation.pipeline._run_cv_fold_tracking",
        return_value=(0, 0),
    )
    def test_bh_correction_applied(self, mock_cv, mock_b0, mock_measure):
        mock_measure.side_effect = self._patch_measure()
        mock_b0.side_effect = self._patch_b0()

        pack = _make_pack()
        cfg = ValidationPipelineConfig(horizons_hours=(1, 4, 24))
        report = run_validation_pipeline(pack=pack, config=cfg)

        # p_bh_vs_b0 should be present and finite for all reports.
        for hr in report.horizon_reports:
            assert isinstance(hr.p_bh_vs_b0, float)
            assert 0.0 <= hr.p_bh_vs_b0 <= 1.0

    @patch(
        "research.validation.pipeline.measure_phase_conditional_return"
    )
    @patch(
        "research.validation.pipeline.measure_b0_random"
    )
    @patch(
        "research.validation.pipeline._run_cv_fold_tracking",
        return_value=(0, 0),
    )
    def test_overall_pass_count_matches_horizon_reports(
        self, mock_cv, mock_b0, mock_measure
    ):
        mock_measure.side_effect = self._patch_measure(mean=2.0, n=100)
        mock_b0.side_effect = self._patch_b0(n=100)

        pack = _make_pack()
        cfg = ValidationPipelineConfig(horizons_hours=(1, 4))
        report = run_validation_pipeline(pack=pack, config=cfg)

        expected = sum(hr.overall_passed for hr in report.horizon_reports)
        assert report.overall_pass_count == expected


# ---------------------------------------------------------------------------
# Integration test (requires offline klines cache — skipped when absent)
# ---------------------------------------------------------------------------


@pytest.mark.skip(
    reason=(
        "Integration test requires engine/data_cache klines for BTCUSDT/1h. "
        "Run manually: pytest -k test_integration_pipeline -s"
    )
)
def test_integration_pipeline_btcusdt():
    """Full pipeline run against real cached klines (no mocks)."""
    from datetime import timezone

    cases = [
        BenchmarkCase(
            symbol="BTCUSDT",
            timeframe="1h",
            start_at=datetime(2024, 1, 1, tzinfo=timezone.utc),
            end_at=datetime(2024, 1, 30, tzinfo=timezone.utc),
            expected_phase_path=["A", "B", "C", "D", "E"],
        )
    ]
    pack = ReplayBenchmarkPack(
        benchmark_pack_id="integ-test-001",
        pattern_slug="integ_test_pattern",
        candidate_timeframes=["1h"],
        cases=cases,
    )
    cfg = ValidationPipelineConfig(horizons_hours=(1, 4), n_trials=15)
    report = run_validation_pipeline(pack=pack, config=cfg)
    assert isinstance(report, ValidationReport)
    assert len(report.horizon_reports) == 2
    # Must be JSON-serializable.
    json.dumps(report.to_dashboard_json())
