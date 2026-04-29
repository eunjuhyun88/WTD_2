"""Tests for robustness.py (W-0290 Phase 2)."""
from __future__ import annotations

import pytest
from research.validation.robustness import run_robustness_checks, RobustnessResult


def _uniform_returns(n: int = 40, value: float = 20.0) -> list[float]:
    return [value] * n


class TestRunRobustnessChecks:
    def test_empty_returns_no_slices(self):
        result = run_robustness_checks([], horizon_hours=4)
        assert result.slices == []

    def test_time_split_always_run(self):
        returns = _uniform_returns(40, 20.0)
        result = run_robustness_checks(returns, horizon_hours=4)
        axes = result.axes_tested
        assert "time" in axes

    def test_time_split_positive_both_halves(self):
        returns = _uniform_returns(40, 20.0)
        result = run_robustness_checks(returns, horizon_hours=4)
        time_slices = result.slices_for_axis("time")
        assert len(time_slices) == 2
        for s in time_slices:
            assert s.passed
            assert s.mean_net_bps > 0

    def test_time_split_negative_both_halves(self):
        returns = _uniform_returns(40, -15.0)
        result = run_robustness_checks(returns, horizon_hours=4)
        for s in result.slices_for_axis("time"):
            assert not s.passed

    def test_volatility_axis_when_proxy_provided(self):
        n = 40
        returns = _uniform_returns(n, 20.0)
        vol_proxy = [float(i % 5) for i in range(n)]
        result = run_robustness_checks(returns, horizon_hours=4, volatility_proxy=vol_proxy)
        assert "volatility" in result.axes_tested
        vol_slices = result.slices_for_axis("volatility")
        assert len(vol_slices) == 2
        labels = {s.label for s in vol_slices}
        assert "high_vol" in labels
        assert "low_vol" in labels

    def test_volatility_axis_skipped_when_no_proxy(self):
        returns = _uniform_returns(40, 20.0)
        result = run_robustness_checks(returns, horizon_hours=4)
        assert "volatility" not in result.axes_tested

    def test_cap_group_axis_when_provided(self):
        n = 40
        returns = _uniform_returns(n, 20.0)
        cap_groups = ["large"] * 20 + ["mid"] * 20
        result = run_robustness_checks(returns, horizon_hours=4, cap_groups=cap_groups)
        assert "cap_group" in result.axes_tested
        labels = {s.label for s in result.slices_for_axis("cap_group")}
        assert "large" in labels
        assert "mid" in labels

    def test_cap_group_skipped_below_min(self):
        n = 40
        returns = _uniform_returns(n, 20.0)
        # Only 1 entry for "micro" — below min_n=3, should be skipped
        cap_groups = ["large"] * 39 + ["micro"] * 1
        result = run_robustness_checks(returns, horizon_hours=4, cap_groups=cap_groups)
        labels = {s.label for s in result.slices_for_axis("cap_group")}
        assert "micro" not in labels

    def test_summary_structure(self):
        returns = _uniform_returns(40, 20.0)
        result = run_robustness_checks(returns, horizon_hours=4)
        s = result.summary()
        assert s["horizon_hours"] == 4
        assert "time" in s["axes"]

    def test_axis_pass_count_matches_slices(self):
        returns = _uniform_returns(40, 20.0)
        result = run_robustness_checks(returns, horizon_hours=4)
        count = result.axis_pass_count("time")
        assert count == sum(1 for s in result.slices_for_axis("time") if s.passed)

    def test_mixed_time_split(self):
        """First half positive, second half negative."""
        half = 20
        returns = [25.0] * half + [-15.0] * half
        result = run_robustness_checks(returns, horizon_hours=4)
        time_slices = result.slices_for_axis("time")
        labels = {s.label: s.passed for s in time_slices}
        assert labels["first_half"] is True
        assert labels["second_half"] is False

    def test_insufficient_returns_no_time_split(self):
        """Fewer than 4 samples → time split should not fire."""
        result = run_robustness_checks([10.0, 20.0], horizon_hours=4)
        assert "time" not in result.axes_tested
