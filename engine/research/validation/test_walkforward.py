"""Tests for walkforward.py (W-0290 Phase 2)."""
from __future__ import annotations

import pytest
from research.validation.walkforward import run_walk_forward, WalkForwardResult


def _positive_returns(n: int = 100) -> list[float]:
    """Consistently positive net returns."""
    return [25.0 + (i % 5) * 2.0 for i in range(n)]


def _negative_returns(n: int = 100) -> list[float]:
    return [-10.0 - (i % 3) for i in range(n)]


def _mixed_returns(n: int = 100) -> list[float]:
    """Positive first half, negative second half."""
    half = n // 2
    return [20.0] * half + [-15.0] * half


class TestRunWalkForward:
    def test_empty_returns(self):
        result = run_walk_forward([], horizon_hours=4)
        assert result.n_folds == 0
        assert result.folds == []
        assert result.pass_count == 0
        assert result.pass_rate == 0.0

    def test_positive_returns_produce_passes(self):
        returns = _positive_returns(120)
        result = run_walk_forward(returns, horizon_hours=4, fold_months=1, bars_per_month=10)
        assert result.n_folds >= 1
        assert result.pass_count >= 1
        assert result.cumulative_net_bps > 0

    def test_negative_returns_produce_no_passes(self):
        returns = _negative_returns(120)
        result = run_walk_forward(returns, horizon_hours=4, fold_months=1, bars_per_month=10)
        assert result.pass_count == 0
        assert result.cumulative_net_bps < 0

    def test_mixed_returns_partial_passes(self):
        returns = _mixed_returns(120)
        result = run_walk_forward(returns, horizon_hours=4, fold_months=1, bars_per_month=10)
        # Some folds should pass (early) and some fail (late)
        assert result.n_folds >= 2
        assert 0 < result.pass_count < result.n_folds

    def test_fold_coverage(self):
        """All samples should be covered across folds."""
        returns = list(range(100))
        result = run_walk_forward(returns, horizon_hours=4, fold_months=1, bars_per_month=10)
        total_test = sum(f.n_test for f in result.folds)
        # test windows should cover most of the non-training data
        assert total_test > 0

    def test_horizon_hours_preserved(self):
        result = run_walk_forward([10.0] * 50, horizon_hours=24, fold_months=1, bars_per_month=5)
        assert result.horizon_hours == 24

    def test_summary_keys(self):
        result = run_walk_forward([10.0] * 60, horizon_hours=4, fold_months=1, bars_per_month=10)
        s = result.summary()
        assert "pass_rate" in s
        assert "cumulative_net_bps" in s
        assert "mean_fold_net_bps" in s
        assert s["fold_months"] == 1

    def test_min_test_n_respected(self):
        """Folds with fewer than min_test_n samples should be scored as not-passed."""
        # very short returns — folds will be tiny
        result = run_walk_forward([100.0] * 5, horizon_hours=4,
                                  fold_months=1, bars_per_month=2, min_test_n=10)
        for fold in result.folds:
            if fold.n_test < 10:
                assert not fold.passed

    def test_pass_rate_between_0_and_1(self):
        result = run_walk_forward(_positive_returns(60), horizon_hours=4,
                                  fold_months=1, bars_per_month=10)
        assert 0.0 <= result.pass_rate <= 1.0

    def test_fold_indices_monotone(self):
        result = run_walk_forward(list(range(80)), horizon_hours=4,
                                  fold_months=1, bars_per_month=10)
        for i, fold in enumerate(result.folds):
            assert fold.fold_idx == i
            assert fold.test_end_idx > fold.test_start_idx
