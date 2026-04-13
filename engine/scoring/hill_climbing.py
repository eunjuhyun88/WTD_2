"""Hill Climbing optimizer for ensemble weight tuning.

AI Researcher rationale:
    Gradient-based methods (SGD, Adam) require differentiable loss.
    Our ensemble combines discrete block signals with continuous ML scores —
    the landscape is non-smooth and low-dimensional (3-5 weights).

    Hill Climbing is ideal here because:
    1. Only 3-5 parameters → exhaustive neighborhood search is cheap
    2. Objective (expectancy × √n) is non-differentiable (uses verdict logic)
    3. Converges in ~50-200 iterations for this scale
    4. Easy to constrain (weights sum to 1, all ≥ 0)

Algorithm:
    1. Start with current weights [w_ml, w_block, w_regime]
    2. For each iteration:
       a. Generate N neighbors by perturbing one weight ±δ
       b. Re-normalize so weights sum to 1
       c. Evaluate objective on trade_log
       d. Accept if objective improves (greedy)
    3. Reduce δ on plateau (simulated annealing schedule)
    4. Stop after max_iter or convergence

Objective function:
    score = expectancy × sqrt(n_trades) × (1 - max_drawdown)
    This balances:
    - expectancy: average PnL per trade (must be positive)
    - n_trades: coverage (√ to avoid rewarding overtrading)
    - drawdown penalty: risk management (catastrophic draws are worse than low returns)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np


@dataclass
class TradeLogEntry:
    """One completed trade for HC optimization."""
    p_win: float          # ML probability at signal time
    block_score: float    # block convergence score at signal time
    regime_score: float   # regime alignment score at signal time
    pnl_pct: float        # realized PnL
    outcome: int          # 1=win, 0=loss


@dataclass
class HCResult:
    """Hill Climbing optimization result."""
    best_weights: np.ndarray     # [w_ml, w_block, w_regime]
    best_objective: float
    initial_objective: float
    n_iterations: int
    improved: bool
    history: list[float] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "best_weights": {
                "w_ml": round(float(self.best_weights[0]), 4),
                "w_block": round(float(self.best_weights[1]), 4),
                "w_regime": round(float(self.best_weights[2]), 4),
            },
            "best_objective": round(self.best_objective, 6),
            "initial_objective": round(self.initial_objective, 6),
            "improvement_pct": round(
                (self.best_objective - self.initial_objective) / abs(self.initial_objective) * 100
                if self.initial_objective != 0 else 0.0,
                2,
            ),
            "n_iterations": self.n_iterations,
            "improved": self.improved,
        }


def _evaluate_weights(
    weights: np.ndarray,
    trades: list[TradeLogEntry],
    threshold: float = 0.55,
) -> float:
    """Evaluate ensemble weights on a trade log.

    For each trade, compute ensemble score with given weights.
    Only count trades where ensemble ≥ threshold (simulates filtered trading).

    Returns:
        objective = expectancy × √n_trades × (1 - max_drawdown)
    """
    if not trades:
        return -1.0

    w_ml, w_block, w_regime = weights

    # Simulate trading with these weights
    pnls: list[float] = []
    for t in trades:
        score = w_ml * t.p_win + w_block * t.block_score + w_regime * t.regime_score
        if score >= threshold:
            pnls.append(t.pnl_pct)

    if len(pnls) < 5:
        return -1.0  # not enough trades to evaluate

    pnls_arr = np.array(pnls)
    expectancy = float(pnls_arr.mean())

    # Max drawdown from cumulative PnL
    cumsum = np.cumsum(pnls_arr)
    running_max = np.maximum.accumulate(cumsum)
    drawdowns = running_max - cumsum
    max_dd = float(drawdowns.max()) if len(drawdowns) > 0 else 0.0

    n_trades = len(pnls)

    # Objective: positive expectancy × coverage × risk-adjusted
    if expectancy <= 0:
        return expectancy * np.sqrt(n_trades)  # negative, penalize

    return expectancy * np.sqrt(n_trades) * (1.0 - min(max_dd, 0.5))


def _normalize_weights(w: np.ndarray) -> np.ndarray:
    """Ensure weights are non-negative and sum to 1."""
    w = np.maximum(w, 0.01)  # minimum 1% per weight
    return w / w.sum()


def optimize_weights(
    trades: list[TradeLogEntry],
    *,
    initial_weights: Optional[np.ndarray] = None,
    max_iter: int = 200,
    n_neighbors: int = 10,
    delta_start: float = 0.05,
    delta_min: float = 0.005,
    patience: int = 20,
    threshold: float = 0.55,
    seed: int = 42,
) -> HCResult:
    """Run Hill Climbing to optimize ensemble weights.

    Args:
        trades:           list of TradeLogEntry from historical signals.
        initial_weights:  starting point [w_ml, w_block, w_regime].
        max_iter:         maximum optimization iterations.
        n_neighbors:      number of candidate neighbors per iteration.
        delta_start:      initial perturbation size.
        delta_min:        minimum perturbation (stop shrinking).
        patience:         iterations without improvement before shrinking δ.
        threshold:        ensemble score threshold for taking trades.
        seed:             random seed for reproducibility.

    Returns:
        HCResult with optimal weights and improvement metrics.
    """
    rng = np.random.RandomState(seed)

    if initial_weights is None:
        current = np.array([0.50, 0.35, 0.15])  # default from ensemble.py
    else:
        current = _normalize_weights(initial_weights.copy())

    current_obj = _evaluate_weights(current, trades, threshold)
    best = current.copy()
    best_obj = current_obj
    initial_obj = current_obj

    delta = delta_start
    stale_count = 0
    history: list[float] = [current_obj]

    for iteration in range(max_iter):
        improved_this_iter = False

        for _ in range(n_neighbors):
            # Perturb: pick a random dimension, shift by ±δ
            neighbor = current.copy()
            dim = rng.randint(len(neighbor))
            perturbation = rng.uniform(-delta, delta)
            neighbor[dim] += perturbation
            neighbor = _normalize_weights(neighbor)

            obj = _evaluate_weights(neighbor, trades, threshold)
            if obj > current_obj:
                current = neighbor
                current_obj = obj
                improved_this_iter = True

                if obj > best_obj:
                    best = neighbor.copy()
                    best_obj = obj

        history.append(current_obj)

        if not improved_this_iter:
            stale_count += 1
            if stale_count >= patience:
                delta = max(delta * 0.5, delta_min)
                stale_count = 0
                if delta <= delta_min:
                    break  # converged
        else:
            stale_count = 0

    return HCResult(
        best_weights=best,
        best_objective=best_obj,
        initial_objective=initial_obj,
        n_iterations=len(history) - 1,
        improved=best_obj > initial_obj,
        history=history,
    )
