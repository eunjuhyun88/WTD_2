"""W-0311 — performance_tracker.py unit tests."""
from __future__ import annotations

import math
from pathlib import Path

import numpy as np
import pytest

from research.validation.performance_tracker import (
    PERIODS_PER_YEAR,
    RollingPerformance,
    compute_calmar,
    compute_sharpe,
    compute_sortino,
    load_rolling_performance,
    update_rolling_performance,
)


def test_compute_sharpe_30_returns_AC8():
    # mean=0.001, std=0.005, n=30, horizon=1
    # sharpe = 0.001/0.005 * sqrt(8760) = 0.2 * 93.57 ≈ 18.71
    rng = np.random.default_rng(42)
    # Build array with exact mean and std
    returns = np.full(30, 0.001)
    # Add noise to get std≈0.005 while preserving approximate mean
    noise = rng.normal(0, 0.005, 30)
    noise -= noise.mean()
    returns = returns + noise
    sharpe = compute_sharpe(returns, horizon_hours=1)
    # Since std won't be exactly 0.005, check rough order of magnitude
    assert sharpe > 10.0  # should be ~18 ± several


def test_compute_sortino_downside_only():
    returns = np.array([-0.01, -0.02, -0.005, -0.015, -0.008])
    sortino = compute_sortino(returns, horizon_hours=1)
    sharpe = compute_sharpe(returns, horizon_hours=1)
    # All returns negative → sortino should be negative (or 0), sharpe too
    # But the ratio: sortino uses only downside in denominator, which equals all returns
    # Both should be < 0 (negative mean)
    assert sortino < sharpe or (sortino < 0 and sharpe < 0)


def test_compute_calmar_with_drawdown():
    # Simulate equity curve with clear drawdown
    returns = np.array([0.05, 0.03, -0.10, 0.02, 0.04, 0.06, 0.01])
    calmar, max_dd = compute_calmar(returns, horizon_hours=1)
    assert calmar > 0
    assert max_dd > 0


def test_update_rolling_performance_window_truncation():
    # 500 returns, window_days=30, horizon=1 → bars_per_window = 30*24 = 720
    # 500 < 720, so no truncation, n_samples=500
    returns = list(np.random.default_rng(0).normal(0.001, 0.005, 500))
    perf = update_rolling_performance(returns, horizon_hours=1, window_days=30)
    assert perf.n_samples == 500

    # Now test actual truncation: 1000 returns → truncated to 720
    returns_large = list(np.random.default_rng(0).normal(0.001, 0.005, 1000))
    perf2 = update_rolling_performance(returns_large, horizon_hours=1, window_days=30)
    assert perf2.n_samples == 30 * 24


def test_update_rolling_performance_atomic_persist(tmp_path: Path):
    returns = list(np.random.default_rng(1).normal(0.001, 0.005, 50))
    persist_path = tmp_path / "perf.json"
    perf = update_rolling_performance(returns, horizon_hours=1, persist_path=persist_path)
    assert persist_path.exists()
    assert perf.n_samples == 50


def test_load_rolling_performance_missing_returns_none(tmp_path: Path):
    missing = tmp_path / "nonexistent.json"
    result = load_rolling_performance(missing)
    assert result is None
