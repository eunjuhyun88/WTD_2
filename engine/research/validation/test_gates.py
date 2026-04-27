"""Tests for V-11 gate v2 module (W-0224)."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from engine.research.validation.gates import (
    Gate,
    GateV2Config,
    GateV2Result,
    evaluate_gate_v2,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_horizon_report(
    *,
    t_vs_b0: float = 3.0,
    dsr: float = 0.5,
    hit_rate: float = 0.60,
    bootstrap_ci: tuple[float, float] = (0.01, 0.05),
    profit_factor: float = 1.5,
    overall_passed: bool = True,
) -> MagicMock:
    r = MagicMock()
    r.t_vs_b0 = t_vs_b0
    r.dsr = dsr
    r.hit_rate = hit_rate
    r.bootstrap_ci = bootstrap_ci
    r.profit_factor = profit_factor
    r.overall_passed = overall_passed
    return r


def _make_validation_report(
    horizon_reports: list | None = None,
    fold_pass_count: int = 4,
) -> MagicMock:
    vr = MagicMock()
    vr.horizon_reports = horizon_reports if horizon_reports is not None else [
        _make_horizon_report()
    ]
    vr.fold_pass_count = fold_pass_count
    return vr


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestEvaluateGateV2:
    def test_all_pass_gives_overall_pass(self) -> None:
        """When existing_pass=True and all new gates pass → overall_pass=True."""
        result = evaluate_gate_v2(
            _make_validation_report(),
            existing_pass=True,
        )
        assert result.overall_pass is True
        assert result.all_new_pass is True
        assert result.reason == ""

    def test_existing_fail_blocks_overall(self) -> None:
        """existing_pass=False → overall_pass=False even if all new gates pass."""
        result = evaluate_gate_v2(
            _make_validation_report(),
            existing_pass=False,
        )
        assert result.overall_pass is False
        assert "existing_gate=FAIL" in result.reason

    def test_g1_fail(self) -> None:
        """G1 (t < 2.0) → overall_pass=False."""
        vr = _make_validation_report(
            horizon_reports=[_make_horizon_report(t_vs_b0=1.5)]
        )
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.new_passes[Gate.G1] is False
        assert result.overall_pass is False
        assert "G1" in result.reason

    def test_g2_fail(self) -> None:
        """G2 (dsr <= 0) → overall_pass=False."""
        vr = _make_validation_report(
            horizon_reports=[_make_horizon_report(dsr=-0.1)]
        )
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.new_passes[Gate.G2] is False
        assert result.overall_pass is False

    def test_g3_fail(self) -> None:
        """G3 (hit_rate < 0.52) → overall_pass=False."""
        vr = _make_validation_report(
            horizon_reports=[_make_horizon_report(hit_rate=0.50)]
        )
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.new_passes[Gate.G3] is False
        assert result.overall_pass is False

    def test_g4_fail(self) -> None:
        """G4 (CI lower bound <= 0) → overall_pass=False."""
        vr = _make_validation_report(
            horizon_reports=[_make_horizon_report(bootstrap_ci=(-0.01, 0.05))]
        )
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.new_passes[Gate.G4] is False
        assert result.overall_pass is False

    def test_g5_fail(self) -> None:
        """G5 (profit_factor < 1.2) → overall_pass=False."""
        vr = _make_validation_report(
            horizon_reports=[_make_horizon_report(profit_factor=1.1)]
        )
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.new_passes[Gate.G5] is False
        assert result.overall_pass is False

    def test_g6_fail(self) -> None:
        """G6 (fold_pass_count < fold_pass_min) → overall_pass=False."""
        vr = _make_validation_report(fold_pass_count=2)
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.new_passes[Gate.G6] is False
        assert result.overall_pass is False

    def test_g7_disabled_by_default(self) -> None:
        """G7 should NOT appear in new_passes when g7_enabled=False."""
        result = evaluate_gate_v2(
            _make_validation_report(),
            existing_pass=True,
            g7_pass=False,  # supplied but disabled
        )
        assert Gate.G7 not in result.new_passes
        assert result.overall_pass is True  # g7 not blocking

    def test_g7_enabled_and_pass(self) -> None:
        """G7 enabled + g7_pass=True → included in new_passes and doesn't block."""
        cfg = GateV2Config(g7_enabled=True)
        result = evaluate_gate_v2(
            _make_validation_report(),
            existing_pass=True,
            config=cfg,
            g7_pass=True,
        )
        assert result.new_passes[Gate.G7] is True
        assert result.overall_pass is True

    def test_g7_enabled_and_fail(self) -> None:
        """G7 enabled + g7_pass=False → overall_pass=False."""
        cfg = GateV2Config(g7_enabled=True)
        result = evaluate_gate_v2(
            _make_validation_report(),
            existing_pass=True,
            config=cfg,
            g7_pass=False,
        )
        assert result.new_passes[Gate.G7] is False
        assert result.overall_pass is False
        assert "G7" in result.reason

    def test_no_horizon_reports(self) -> None:
        """Empty horizon_reports → overall_pass=False with reason."""
        vr = _make_validation_report(horizon_reports=[])
        result = evaluate_gate_v2(vr, existing_pass=True)
        assert result.overall_pass is False
        assert "no horizon reports" in result.reason

    def test_best_horizon_used(self) -> None:
        """The horizon with highest t_vs_b0 is used for gate evaluation."""
        low = _make_horizon_report(t_vs_b0=1.0)   # would fail G1
        high = _make_horizon_report(t_vs_b0=5.0)  # passes G1
        vr = _make_validation_report(horizon_reports=[low, high])
        result = evaluate_gate_v2(vr, existing_pass=True)
        # Best horizon (t=5) is used → G1 passes
        assert result.new_passes[Gate.G1] is True

    def test_to_dict_serializable(self) -> None:
        """to_dict() should return JSON-safe structure."""
        import json
        result = evaluate_gate_v2(_make_validation_report(), existing_pass=True)
        d = result.to_dict()
        json.dumps(d)  # should not raise
        assert isinstance(d["new_passes"], dict)
        assert isinstance(d["overall_pass"], bool)
