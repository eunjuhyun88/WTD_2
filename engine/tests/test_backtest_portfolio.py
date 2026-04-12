"""Tests for backtest.portfolio.Portfolio — 10 cases per §6.10."""
from __future__ import annotations

import io
import math

import pandas as pd
import pytest

from backtest.config import RiskConfig
from backtest.portfolio import Portfolio, _week_key
from backtest.types import EntrySignal
from observability.logging import StructuredLogger
from scanner.pnl import ExecutionCosts, TradeResult


COSTS = ExecutionCosts()


def _logger() -> StructuredLogger:
    return StructuredLogger("test.portfolio", run_id="t", stream=io.StringIO())


def _sig(
    symbol: str,
    t: str,
    direction: str = "long",
    prob: float = 0.7,
) -> EntrySignal:
    return EntrySignal(
        symbol=symbol,
        timestamp=pd.Timestamp(t, tz="UTC"),
        direction=direction,  # type: ignore[arg-type]
        predicted_prob=prob,
        source_model="test",
    )


def _tr(
    entry_t: str,
    exit_t: str,
    realized: float,
    exit_reason: str = "target",
) -> TradeResult:
    return TradeResult(
        entry_time=pd.Timestamp(entry_t, tz="UTC"),
        entry_pos=0,
        direction="long",
        entry_price_raw=100.0,
        entry_price_exec=100.0,
        exit_time=pd.Timestamp(exit_t, tz="UTC"),
        exit_pos=1,
        exit_price_raw=100.0 * (1 + realized),
        exit_price_exec=100.0 * (1 + realized),
        gross_pnl_pct=realized,
        fee_pct_total=0.0,
        slippage_pct_total=0.0,
        realized_pnl_pct=realized,
        exit_reason=exit_reason,  # type: ignore[arg-type]
        bars_to_exit=1,
    )


def _enter(p: Portfolio, symbol: str, t: str, notional: float = 5_000.0) -> None:
    s = _sig(symbol, t)
    p.enter(
        signal=s,
        entry_price_raw=100.0,
        entry_price_exec=100.0,
        size_units=notional / 100.0,
        notional_usd=notional,
        stop_price=98.0,
        target_price=104.0,
    )


# ---------------------------------------------------------------------------
# 1. Max concurrent 3, 4th signal blocked
# ---------------------------------------------------------------------------


def test_max_concurrent_blocks_fourth():
    p = Portfolio(RiskConfig(), COSTS, _logger())
    _enter(p, "A", "2024-01-01 00:00")
    _enter(p, "B", "2024-01-01 00:00")
    _enter(p, "C", "2024-01-01 00:00")
    ok, reason = p.can_enter("D", pd.Timestamp("2024-01-01 00:00", tz="UTC"))
    assert ok is False
    assert reason == "max_concurrent"


# ---------------------------------------------------------------------------
# 2. Cooldown blocks same symbol within N bars
# ---------------------------------------------------------------------------


def test_cooldown_blocks_same_symbol():
    p = Portfolio(RiskConfig(cooldown_bars_per_symbol=3), COSTS, _logger())
    _enter(p, "BTCUSDT", "2024-01-01 00:00")
    tr = _tr("2024-01-01 00:00", "2024-01-01 01:00", realized=0.01)
    p.mark_closed("BTCUSDT", tr)

    # 2h after exit, still in cooldown (3h window)
    t_try = pd.Timestamp("2024-01-01 03:00", tz="UTC")
    ok, reason = p.can_enter("BTCUSDT", t_try - pd.Timedelta(hours=1))
    assert ok is False
    assert reason == "cooldown"

    # Beyond cooldown
    t_clear = pd.Timestamp("2024-01-01 04:00", tz="UTC") + pd.Timedelta(seconds=1)
    ok2, _ = p.can_enter("BTCUSDT", t_clear)
    assert ok2 is True


# ---------------------------------------------------------------------------
# 3. Daily loss halt after -3%
# ---------------------------------------------------------------------------


def test_daily_loss_halt_after_threshold():
    p = Portfolio(RiskConfig(daily_loss_limit_pct=0.03), COSTS, _logger())
    _enter(p, "A", "2024-01-01 00:00")
    p.mark_closed("A", _tr("2024-01-01 00:00", "2024-01-01 01:00", -0.02))
    _enter(p, "B", "2024-01-01 02:00")
    p.mark_closed("B", _tr("2024-01-01 02:00", "2024-01-01 03:00", -0.015))
    # Cumulative -3.5% > 3% threshold
    ok, reason = p.can_enter("C", pd.Timestamp("2024-01-01 04:00", tz="UTC"))
    assert ok is False
    assert reason == "daily_loss_halt"


# ---------------------------------------------------------------------------
# 4. Daily reset at midnight UTC (next day is allowed to trade again)
# ---------------------------------------------------------------------------


def test_daily_halt_clears_next_day():
    p = Portfolio(RiskConfig(daily_loss_limit_pct=0.03), COSTS, _logger())
    _enter(p, "A", "2024-01-01 12:00")
    p.mark_closed("A", _tr("2024-01-01 12:00", "2024-01-01 13:00", -0.04))
    ok_same_day, reason1 = p.can_enter(
        "B", pd.Timestamp("2024-01-01 14:00", tz="UTC")
    )
    assert ok_same_day is False
    assert reason1 == "daily_loss_halt"
    ok_next_day, _ = p.can_enter("B", pd.Timestamp("2024-01-02 01:00", tz="UTC"))
    assert ok_next_day is True


# ---------------------------------------------------------------------------
# 5. Weekly halt after -8%
# ---------------------------------------------------------------------------


def test_weekly_loss_halt_after_threshold():
    p = Portfolio(
        RiskConfig(
            daily_loss_limit_pct=0.5,  # disable daily halt for this test
            weekly_loss_limit_pct=0.08,
        ),
        COSTS,
        _logger(),
    )
    # Three losing days, each -0.03, same ISO week
    for i, day in enumerate(["2024-01-01", "2024-01-02", "2024-01-03"]):
        _enter(p, f"S{i}", f"{day} 10:00")
        p.mark_closed(f"S{i}", _tr(f"{day} 10:00", f"{day} 11:00", -0.03))
    # Cumulative -9% → weekly halt on
    ok, reason = p.can_enter("NEXT", pd.Timestamp("2024-01-04 10:00", tz="UTC"))
    assert ok is False
    assert reason == "weekly_loss_halt"
    # Next week clears it
    ok_next, _ = p.can_enter("NEXT", pd.Timestamp("2024-01-08 10:00", tz="UTC"))
    assert ok_next is True


# ---------------------------------------------------------------------------
# 6. Consecutive loss pause after 5 losses
# ---------------------------------------------------------------------------


def test_consecutive_loss_pause():
    p = Portfolio(
        RiskConfig(
            max_consecutive_losses=3,
            consecutive_loss_pause_bars=24,
            daily_loss_limit_pct=0.5,  # keep daily halt out of the way
        ),
        COSTS,
        _logger(),
    )
    # Three consecutive small losses
    for i in range(3):
        _enter(p, f"S{i}", f"2024-01-0{i+1} 00:00")
        p.mark_closed(
            f"S{i}", _tr(f"2024-01-0{i+1} 00:00", f"2024-01-0{i+1} 01:00", -0.01)
        )
    # Pause until +24h from the last exit (2024-01-03 01:00)
    t_inside = pd.Timestamp("2024-01-03 20:00", tz="UTC")
    ok, reason = p.can_enter("X", t_inside)
    assert ok is False
    assert reason == "consecutive_loss_pause"
    t_outside = pd.Timestamp("2024-01-04 02:00", tz="UTC")
    ok2, _ = p.can_enter("X", t_outside)
    assert ok2 is True


# ---------------------------------------------------------------------------
# 7. Position sizing: risk 1%, stop 2% → notional = equity × 0.5
# ---------------------------------------------------------------------------


def test_fixed_risk_sizing():
    p = Portfolio(RiskConfig(), COSTS, _logger())
    s = _sig("BTCUSDT", "2024-01-01 00:00")
    size, notional = p.size_position(s, entry_price_raw=100.0, equity=10_000.0)
    assert math.isclose(notional, 5_000.0)
    assert math.isclose(size, 50.0)


# ---------------------------------------------------------------------------
# 8. already_open prevents re-entry
# ---------------------------------------------------------------------------


def test_already_open_blocks_second_entry():
    p = Portfolio(RiskConfig(), COSTS, _logger())
    _enter(p, "BTCUSDT", "2024-01-01 00:00")
    ok, reason = p.can_enter("BTCUSDT", pd.Timestamp("2024-01-01 00:00", tz="UTC"))
    assert ok is False
    assert reason == "already_open"


# ---------------------------------------------------------------------------
# 9. can_enter returns (True, None) when all clear
# ---------------------------------------------------------------------------


def test_can_enter_clear():
    p = Portfolio(RiskConfig(), COSTS, _logger())
    ok, reason = p.can_enter("BTCUSDT", pd.Timestamp("2024-01-01 00:00", tz="UTC"))
    assert ok is True
    assert reason is None


# ---------------------------------------------------------------------------
# 10. Equity curve ordered by time and reflects closes
# ---------------------------------------------------------------------------


def test_equity_curve_reflects_closes_in_order():
    p = Portfolio(RiskConfig(), COSTS, _logger())
    p.record_equity_sample(pd.Timestamp("2024-01-01 00:00", tz="UTC"))
    _enter(p, "A", "2024-01-01 00:00")
    p.mark_closed("A", _tr("2024-01-01 00:00", "2024-01-01 01:00", 0.02))
    p.record_equity_sample(pd.Timestamp("2024-01-01 01:00", tz="UTC"))
    _enter(p, "B", "2024-01-01 01:00")
    p.mark_closed("B", _tr("2024-01-01 01:00", "2024-01-01 02:00", -0.01))
    p.record_equity_sample(pd.Timestamp("2024-01-01 02:00", tz="UTC"))

    assert len(p.equity_curve) == 3
    times = [pt.time for pt in p.equity_curve]
    assert times == sorted(times)
    # Initial 10k, after +2% on 5k notional = +100, equity 10100
    assert math.isclose(p.equity_curve[0].equity, 10_000.0)
    assert math.isclose(p.equity_curve[1].equity, 10_100.0)
    # Then -1% on 5k notional = -50, equity 10050
    assert math.isclose(p.equity_curve[2].equity, 10_050.0)


# ---------------------------------------------------------------------------
# Bonus: week_key helper correctness
# ---------------------------------------------------------------------------


def test_week_key_monday_anchor():
    # 2024-01-03 is a Wednesday → Monday is 2024-01-01
    wk = _week_key(pd.Timestamp("2024-01-03 15:30", tz="UTC"))
    assert wk == pd.Timestamp("2024-01-01").date()
