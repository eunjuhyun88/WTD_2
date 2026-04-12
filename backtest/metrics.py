"""Institutional metrics + the Phase D12 Stage 1 gate.

``compute_metrics`` is a **pure function**: given the list of closed
trades and the equity curve, it returns a ``BacktestMetrics`` record.
No I/O, no randomness.

Formulas (see ``docs/design/phase-d12-to-e.md`` §15.1):

* ``expectancy_pct`` = mean of ``realized_pnl_pct`` over all trades
* ``win_rate`` = fraction with ``realized_pnl_pct > 0``
* ``profit_factor`` = sum(wins) / |sum(losses)|; ``inf`` if no losses
* ``sortino`` = mean(return) / downside_stdev(return) (downside-only)
* ``calmar`` = CAGR / |MDD|; we use a bar-resampled proxy for CAGR
* ``max_drawdown_pct`` = most-negative drawdown of the equity curve
* ``tail_ratio`` = |P95| / |P5| on the realized-return distribution
* ``skew``, ``kurtosis`` = sample moments

``stage_1_gate`` returns ``(passed, failure_reasons)``. The six gate
conditions are the Phase D12 preregistration.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterable, Optional

import numpy as np

from backtest.portfolio import EquityPoint
from backtest.types import ExecutedTrade


@dataclass(frozen=True)
class BacktestMetrics:
    n_executed: int
    n_blocked: int
    expectancy_pct: float
    win_rate: float
    profit_factor: float
    max_drawdown_pct: float
    sortino: float
    calmar: float
    sharpe: float
    tail_ratio: float
    skew: float
    kurtosis: float
    avg_bars_to_exit: float
    exit_reason_counts: dict[str, int]
    initial_equity: float
    final_equity: float


# ---------------------------------------------------------------------------
# Core computation
# ---------------------------------------------------------------------------


def compute_metrics(
    trades: list[ExecutedTrade],
    equity_curve: list[EquityPoint],
    initial_equity: float,
    *,
    n_blocked: int = 0,
) -> BacktestMetrics:
    """Return the full ``BacktestMetrics`` record for the given run."""
    n = len(trades)

    returns = np.array(
        [t.realized_pnl_pct for t in trades],
        dtype=float,
    )

    if n == 0:
        final_equity = equity_curve[-1].equity if equity_curve else initial_equity
        return BacktestMetrics(
            n_executed=0,
            n_blocked=n_blocked,
            expectancy_pct=0.0,
            win_rate=0.0,
            profit_factor=0.0,
            max_drawdown_pct=0.0,
            sortino=0.0,
            calmar=0.0,
            sharpe=0.0,
            tail_ratio=0.0,
            skew=0.0,
            kurtosis=0.0,
            avg_bars_to_exit=0.0,
            exit_reason_counts={},
            initial_equity=initial_equity,
            final_equity=final_equity,
        )

    expectancy = float(returns.mean())
    wins = returns[returns > 0]
    losses = returns[returns < 0]
    win_rate = float(len(wins) / n)
    if len(losses) == 0:
        profit_factor = float("inf") if len(wins) > 0 else 0.0
    else:
        profit_factor = float(wins.sum() / abs(losses.sum()))

    mdd = _max_drawdown(equity_curve, initial_equity)
    sortino = _sortino(returns)
    sharpe = _sharpe(returns)
    calmar = _calmar(equity_curve, initial_equity, mdd)
    tail_ratio = _tail_ratio(returns)
    skew_val = _moment_skew(returns)
    kurt_val = _moment_kurtosis(returns)

    avg_bars = float(np.mean([t.bars_to_exit for t in trades]))
    reason_counts: dict[str, int] = {}
    for t in trades:
        reason_counts[t.exit_reason] = reason_counts.get(t.exit_reason, 0) + 1

    final_equity = equity_curve[-1].equity if equity_curve else initial_equity

    return BacktestMetrics(
        n_executed=n,
        n_blocked=n_blocked,
        expectancy_pct=expectancy,
        win_rate=win_rate,
        profit_factor=profit_factor,
        max_drawdown_pct=mdd,
        sortino=sortino,
        calmar=calmar,
        sharpe=sharpe,
        tail_ratio=tail_ratio,
        skew=skew_val,
        kurtosis=kurt_val,
        avg_bars_to_exit=avg_bars,
        exit_reason_counts=reason_counts,
        initial_equity=initial_equity,
        final_equity=float(final_equity),
    )


# ---------------------------------------------------------------------------
# Stage 1 gate
# ---------------------------------------------------------------------------


def stage_1_gate(m: BacktestMetrics) -> tuple[bool, list[str]]:
    """Return ``(passed, failure_reasons)`` for the preregistered gate.

    The six conditions are fixed for Phase D12; see
    ``docs/design/phase-d12-to-e.md`` §6.2 / §6.9. Any change requires a
    new ADR and a new preregistration row in ``experiments_log.md``.
    """
    failures: list[str] = []
    if m.expectancy_pct <= 0:
        failures.append(f"expectancy {m.expectancy_pct:.4f} <= 0")
    if m.max_drawdown_pct < -0.20:
        failures.append(f"mdd {m.max_drawdown_pct:.4f} < -20%")
    if m.n_executed < 30:
        failures.append(f"n_trades {m.n_executed} < 30")
    if m.tail_ratio < 1.0:
        failures.append(f"tail_ratio {m.tail_ratio:.2f} < 1")
    if m.sortino < 0.5:
        failures.append(f"sortino {m.sortino:.2f} < 0.5")
    if m.profit_factor < 1.2:
        failures.append(f"profit_factor {m.profit_factor:.2f} < 1.2")
    return (len(failures) == 0, failures)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _max_drawdown(equity_curve: list[EquityPoint], initial_equity: float) -> float:
    """Return the most-negative drawdown as a signed fraction.

    If the equity curve never rises above the starting equity, the
    baseline is ``initial_equity``. Otherwise it's the running peak.
    Returned value is in ``[-1, 0]`` (0 = no drawdown).
    """
    if not equity_curve:
        return 0.0
    peak = initial_equity
    worst = 0.0
    for pt in equity_curve:
        if pt.equity > peak:
            peak = pt.equity
        dd = (pt.equity - peak) / peak if peak > 0 else 0.0
        if dd < worst:
            worst = dd
    return float(worst)


def _sortino(returns: np.ndarray) -> float:
    """Sortino ratio using downside stdev. Zero-return trades don't count as downside."""
    if len(returns) == 0:
        return 0.0
    mean_r = float(returns.mean())
    downside = returns[returns < 0]
    if len(downside) == 0:
        # No losses → Sortino is technically +inf; return a large finite
        # value so downstream ``min`` comparisons stay well-defined.
        return 1e9 if mean_r > 0 else 0.0
    d_std = float(np.sqrt((downside ** 2).mean()))
    if d_std == 0.0:
        return 1e9 if mean_r > 0 else 0.0
    return mean_r / d_std


def _sharpe(returns: np.ndarray) -> float:
    if len(returns) < 2:
        return 0.0
    std = float(returns.std(ddof=1))
    if std == 0.0:
        return 0.0
    return float(returns.mean() / std)


def _calmar(
    equity_curve: list[EquityPoint],
    initial_equity: float,
    mdd: float,
) -> float:
    """CAGR / |MDD|. We approximate CAGR via total return over the curve span."""
    if not equity_curve or mdd == 0.0:
        return 0.0
    total_return = (equity_curve[-1].equity - initial_equity) / initial_equity
    return float(total_return / abs(mdd))


def _tail_ratio(returns: np.ndarray) -> float:
    if len(returns) < 20:
        # Below 20 trades the p95/p5 estimate is too noisy to be
        # meaningful. Return the ratio of max-gain to max-loss instead
        # so tests with small samples still get a finite number.
        max_gain = float(returns.max()) if returns.max() > 0 else 0.0
        max_loss = float(-returns.min()) if returns.min() < 0 else 0.0
        if max_loss == 0.0:
            return 1e9 if max_gain > 0 else 0.0
        return max_gain / max_loss
    p95 = float(np.quantile(returns, 0.95))
    p5 = float(np.quantile(returns, 0.05))
    denom = abs(p5)
    if denom == 0.0:
        return 1e9 if p95 > 0 else 0.0
    return abs(p95) / denom


def _moment_skew(returns: np.ndarray) -> float:
    if len(returns) < 3:
        return 0.0
    mean = returns.mean()
    std = returns.std(ddof=0)
    if std == 0.0:
        return 0.0
    return float(((returns - mean) ** 3).mean() / (std ** 3))


def _moment_kurtosis(returns: np.ndarray) -> float:
    if len(returns) < 4:
        return 0.0
    mean = returns.mean()
    std = returns.std(ddof=0)
    if std == 0.0:
        return 0.0
    return float(((returns - mean) ** 4).mean() / (std ** 4) - 3.0)  # excess kurtosis
