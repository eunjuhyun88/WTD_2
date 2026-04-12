"""Tests for backtest.metrics."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
import pytest

from backtest.metrics import BacktestMetrics, compute_metrics, stage_1_gate
from backtest.portfolio import EquityPoint
from backtest.types import ExecutedTrade


def _trade(realized: float, bars: int = 1, reason: str = "target") -> ExecutedTrade:
    return ExecutedTrade(
        symbol="X",
        direction="long",
        source_model="t",
        entry_time=pd.Timestamp("2024-01-01", tz="UTC"),
        entry_price_raw=100.0,
        entry_price_exec=100.0,
        exit_time=pd.Timestamp("2024-01-01", tz="UTC") + pd.Timedelta(hours=bars),
        exit_price_raw=100 * (1 + realized),
        exit_price_exec=100 * (1 + realized),
        notional_usd=5_000.0,
        size_units=50.0,
        gross_pnl_pct=realized,
        fee_pct_total=0.0,
        slippage_pct_total=0.0,
        realized_pnl_pct=realized,
        realized_pnl_usd=5_000.0 * realized,
        exit_reason=reason,  # type: ignore[arg-type]
        bars_to_exit=bars,
    )


def _flat_curve(returns: list[float], initial: float = 10_000.0) -> list[EquityPoint]:
    """Build an equity curve by compounding the realized returns.

    Each trade is 5000 notional, so the equity delta per trade is
    5000 * realized. Good enough for MDD shape tests.
    """
    curve = [EquityPoint(pd.Timestamp("2024-01-01", tz="UTC"), initial)]
    eq = initial
    for i, r in enumerate(returns):
        eq += 5_000.0 * r
        curve.append(
            EquityPoint(
                time=pd.Timestamp("2024-01-01", tz="UTC") + pd.Timedelta(hours=i + 1),
                equity=eq,
            )
        )
    return curve


# ---------------------------------------------------------------------------
# 1. All wins → profit_factor inf, MDD near 0
# ---------------------------------------------------------------------------


def test_all_wins():
    returns = [0.02] * 30
    trades = [_trade(r) for r in returns]
    curve = _flat_curve(returns)
    m = compute_metrics(trades, curve, initial_equity=10_000.0)
    assert m.n_executed == 30
    assert m.win_rate == 1.0
    assert math.isinf(m.profit_factor)
    assert m.max_drawdown_pct == 0.0
    assert m.expectancy_pct > 0


# ---------------------------------------------------------------------------
# 2. All losses → expectancy < 0, Stage 1 fails
# ---------------------------------------------------------------------------


def test_all_losses_stage_1_fails():
    returns = [-0.02] * 30
    trades = [_trade(r, reason="stop") for r in returns]
    curve = _flat_curve(returns)
    m = compute_metrics(trades, curve, initial_equity=10_000.0)
    assert m.expectancy_pct < 0
    passed, reasons = stage_1_gate(m)
    assert passed is False
    assert any("expectancy" in r for r in reasons)


# ---------------------------------------------------------------------------
# 3. Realistic mixed → Sortino finite, Calmar finite
# ---------------------------------------------------------------------------


def test_realistic_mixed_distribution():
    rng = np.random.default_rng(13)
    raw = rng.normal(loc=0.006, scale=0.02, size=60)  # ~0.6% mean, 2% std
    returns = raw.tolist()
    trades = [_trade(r, reason="target" if r > 0 else "stop") for r in returns]
    curve = _flat_curve(returns)
    m = compute_metrics(trades, curve, initial_equity=10_000.0)
    assert m.n_executed == 60
    assert 0.3 <= m.win_rate <= 0.9
    assert 0 < m.profit_factor < 20
    assert abs(m.sortino) > 0
    assert abs(m.sharpe) > 0


# ---------------------------------------------------------------------------
# 4. Fat left tail → tail_ratio < 1 AND skew < 0
# ---------------------------------------------------------------------------


def test_fat_left_tail_detected():
    # 90 wins of +0.005, 10 crashes of -0.15 — fat left tail, positive win rate
    returns = [0.005] * 90 + [-0.15] * 10
    trades = [_trade(r) for r in returns]
    curve = _flat_curve(returns)
    m = compute_metrics(trades, curve, initial_equity=10_000.0)
    assert m.skew < 0
    assert m.tail_ratio < 1.0


# ---------------------------------------------------------------------------
# 5. Stage 1 gate with one failure → (False, [reason])
# ---------------------------------------------------------------------------


def test_stage_1_one_failure_reports_that_failure():
    m = BacktestMetrics(
        n_executed=50,
        n_blocked=0,
        expectancy_pct=0.01,
        win_rate=0.6,
        profit_factor=1.5,
        max_drawdown_pct=-0.05,
        sortino=1.2,
        calmar=2.0,
        sharpe=1.0,
        tail_ratio=0.8,  # <— the one failure
        skew=0.0,
        kurtosis=0.0,
        avg_bars_to_exit=3.0,
        exit_reason_counts={"target": 30, "stop": 20},
        initial_equity=10_000.0,
        final_equity=10_500.0,
    )
    passed, reasons = stage_1_gate(m)
    assert passed is False
    assert len(reasons) == 1
    assert "tail_ratio" in reasons[0]


# ---------------------------------------------------------------------------
# 6. Stage 1 gate all pass → (True, [])
# ---------------------------------------------------------------------------


def test_stage_1_all_pass():
    m = BacktestMetrics(
        n_executed=50,
        n_blocked=0,
        expectancy_pct=0.01,
        win_rate=0.6,
        profit_factor=1.5,
        max_drawdown_pct=-0.05,
        sortino=1.2,
        calmar=2.0,
        sharpe=1.0,
        tail_ratio=1.3,
        skew=0.2,
        kurtosis=0.0,
        avg_bars_to_exit=3.0,
        exit_reason_counts={"target": 30, "stop": 20},
        initial_equity=10_000.0,
        final_equity=10_500.0,
    )
    passed, reasons = stage_1_gate(m)
    assert passed is True
    assert reasons == []
