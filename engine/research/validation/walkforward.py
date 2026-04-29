"""W-0290 Phase 2 — Walk-forward validation.

6-month rolling walk-forward: each fold trains on all data before the test
window, evaluates on the test window, and reports cumulative net edge across
folds.  The result tells us whether a pattern's edge persists out-of-sample
over time — not just in a single holdout split.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import numpy as np

from research.validation.stats import hit_rate, profit_factor, bootstrap_ci


@dataclass
class WalkForwardFold:
    """Result for one walk-forward fold."""

    fold_idx: int
    train_end_idx: int         # last training bar index (exclusive of test)
    test_start_idx: int
    test_end_idx: int
    n_test: int
    mean_net_bps: float
    hit_rate: float
    profit_factor: float
    bootstrap_ci: tuple[float, float]
    passed: bool               # mean_net_bps > 0 AND hit_rate > 0.5


@dataclass
class WalkForwardResult:
    """Aggregate walk-forward result for a pattern × horizon."""

    horizon_hours: int
    n_folds: int
    fold_months: int
    folds: list[WalkForwardFold] = field(default_factory=list)

    @property
    def pass_count(self) -> int:
        return sum(f.passed for f in self.folds)

    @property
    def pass_rate(self) -> float:
        return self.pass_count / self.n_folds if self.n_folds else 0.0

    @property
    def cumulative_net_bps(self) -> float:
        """Sum of per-fold mean_net_bps (equal-weight folds)."""
        return sum(f.mean_net_bps for f in self.folds)

    @property
    def mean_fold_net_bps(self) -> float:
        if not self.folds:
            return 0.0
        return self.cumulative_net_bps / len(self.folds)

    def summary(self) -> dict:
        return {
            "horizon_hours": self.horizon_hours,
            "n_folds": self.n_folds,
            "fold_months": self.fold_months,
            "pass_count": self.pass_count,
            "pass_rate": round(self.pass_rate, 3),
            "cumulative_net_bps": round(self.cumulative_net_bps, 2),
            "mean_fold_net_bps": round(self.mean_fold_net_bps, 2),
        }


def run_walk_forward(
    net_returns: Sequence[float],
    *,
    horizon_hours: int = 4,
    fold_months: int = 1,
    bars_per_month: int = 180,   # 4h bars × 30d × 6 bars/day ≈ 180
    min_test_n: int = 5,
) -> WalkForwardResult:
    """Run rolling walk-forward over net return samples.

    Args:
        net_returns: Ordered sequence of per-entry net returns (bps) for one
            horizon.  Each element corresponds to one PhaseEntryEvent outcome.
            The ordering must be chronological.
        horizon_hours: Horizon these returns were labeled at.
        fold_months: Number of months per test fold.
        bars_per_month: Approx bar count per calendar month (for index mapping).
            Used only when ``net_returns`` indices correspond to bar positions.
            When returns are already one-per-entry, set to len(net_returns) //
            total_months to get ~equal fold sizes.
        min_test_n: Minimum test samples to score a fold; folds below this are
            skipped (but still counted in n_folds for pass_rate denominator).

    Returns:
        :class:`WalkForwardResult` with per-fold and aggregate metrics.
    """
    samples = np.array(net_returns, dtype=float)
    n = len(samples)
    if n == 0:
        return WalkForwardResult(horizon_hours=horizon_hours, n_folds=0, fold_months=fold_months)

    # Determine fold size in sample units
    fold_size = max(1, bars_per_month * fold_months)
    # Minimum training window = 2 folds worth of data
    min_train = fold_size * 2

    folds: list[WalkForwardFold] = []
    fold_idx = 0
    test_start = min_train

    while test_start < n:
        test_end = min(test_start + fold_size, n)
        test_samples = samples[test_start:test_end]
        n_test = len(test_samples)

        if n_test >= min_test_n:
            mn = float(np.mean(test_samples))
            hr = hit_rate(test_samples.tolist())
            pf = profit_factor(test_samples.tolist())
            ci = bootstrap_ci(test_samples.tolist())
            passed = mn > 0.0 and hr > 0.5
        else:
            mn = hr = pf = 0.0
            ci = (0.0, 0.0)
            passed = False

        folds.append(WalkForwardFold(
            fold_idx=fold_idx,
            train_end_idx=test_start,
            test_start_idx=test_start,
            test_end_idx=test_end,
            n_test=n_test,
            mean_net_bps=mn,
            hit_rate=hr,
            profit_factor=pf,
            bootstrap_ci=ci,
            passed=passed,
        ))
        fold_idx += 1
        test_start = test_end

    return WalkForwardResult(
        horizon_hours=horizon_hours,
        n_folds=len(folds),
        fold_months=fold_months,
        folds=folds,
    )
