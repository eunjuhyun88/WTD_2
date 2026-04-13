"""Tests for scoring.hill_climbing — weight optimizer."""
import pytest
import numpy as np

from scoring.hill_climbing import (
    TradeLogEntry,
    optimize_weights,
    _evaluate_weights,
    _normalize_weights,
)


def _make_trades(n: int = 100, win_rate: float = 0.55) -> list[TradeLogEntry]:
    """Generate synthetic trade log."""
    rng = np.random.RandomState(42)
    trades = []
    for _ in range(n):
        win = rng.random() < win_rate
        trades.append(TradeLogEntry(
            p_win=rng.uniform(0.4, 0.7),
            block_score=rng.uniform(0.0, 1.0),
            regime_score=rng.uniform(0.3, 0.7),
            pnl_pct=rng.uniform(0.005, 0.03) if win else rng.uniform(-0.02, -0.005),
            outcome=1 if win else 0,
        ))
    return trades


class TestNormalizeWeights:
    def test_sums_to_one(self):
        w = _normalize_weights(np.array([0.5, 0.3, 0.2]))
        assert abs(w.sum() - 1.0) < 1e-10

    def test_negative_clipped(self):
        w = _normalize_weights(np.array([-0.5, 0.3, 0.2]))
        assert all(w >= 0.01)

    def test_zero_handled(self):
        w = _normalize_weights(np.array([0.0, 0.0, 1.0]))
        assert all(w >= 0.009)  # minimum is 0.01 before renormalization


class TestEvaluateWeights:
    def test_positive_trades(self):
        trades = _make_trades(50, win_rate=0.65)
        weights = np.array([0.5, 0.35, 0.15])
        obj = _evaluate_weights(weights, trades, threshold=0.0)  # accept all
        # With 65% win rate, objective should be positive
        assert obj > 0

    def test_empty_trades(self):
        assert _evaluate_weights(np.array([0.5, 0.35, 0.15]), [], 0.5) == -1.0

    def test_high_threshold_few_trades(self):
        trades = _make_trades(10)
        obj = _evaluate_weights(np.array([0.5, 0.35, 0.15]), trades, threshold=0.99)
        assert obj == -1.0  # too few trades above threshold


class TestOptimizeWeights:
    def test_basic_optimization(self):
        trades = _make_trades(100, win_rate=0.60)
        result = optimize_weights(trades, max_iter=50)
        assert result.best_weights.shape == (3,)
        assert abs(result.best_weights.sum() - 1.0) < 0.01
        assert result.n_iterations > 0

    def test_improvement_over_random(self):
        trades = _make_trades(200, win_rate=0.58)
        result = optimize_weights(
            trades,
            initial_weights=np.array([0.33, 0.33, 0.34]),
            max_iter=100,
        )
        # Should find something at least as good as initial
        assert result.best_objective >= result.initial_objective - 0.01

    def test_to_dict(self):
        trades = _make_trades(50)
        result = optimize_weights(trades, max_iter=20)
        d = result.to_dict()
        assert "best_weights" in d
        assert "w_ml" in d["best_weights"]
        assert "improvement_pct" in d
