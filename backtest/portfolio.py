"""Portfolio state for the Phase D12 event-driven simulator.

The Portfolio is the stateful companion to the pure ``scanner.pnl``
module. It owns:

* Realized cash
* Currently open positions (at most ``max_concurrent_positions``)
* Per-symbol cooldown timers
* Daily and weekly loss circuit breakers
* Consecutive-loss pause
* The equity curve (sampled at each ``record_equity_sample`` call)

All mutations go through explicit methods. Attribute access is fine
for reads (``portfolio.cash``, ``portfolio.open_positions``, etc.) and
is used by tests and by the simulator.

The sizing, cooldown, and circuit-breaker defaults are preregistered
in ``docs/design/phase-d12-to-e.md`` §6.14 and MUST NOT be quietly
changed. If a change is warranted, bump the content hash in
``experiments_log.md`` and explain why in an ADR.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date as date_t, timedelta
from typing import Optional

import pandas as pd

from backtest.config import RiskConfig
from backtest.types import EntrySignal, ExecutedTrade, OpenPosition
from exceptions import ConfigValidationError
from observability.logging import StructuredLogger
from scanner.pnl import ExecutionCosts, TradeResult


@dataclass
class EquityPoint:
    time: pd.Timestamp
    equity: float


class Portfolio:
    """Mutable portfolio with explicit mutation points.

    Typical lifecycle (see tests + simulator):

        p = Portfolio(cfg, costs, logger)
        ok, reason = p.can_enter("BTCUSDT", t)
        if ok:
            size, notional = p.size_position(signal, entry_raw, equity)
            p.enter(signal, entry_raw, entry_exec, size, notional,
                    stop_price, target_price)
        # ... later ...
        p.mark_closed(symbol, trade_result)
    """

    def __init__(
        self,
        cfg: RiskConfig,
        costs: ExecutionCosts,
        logger: StructuredLogger,
    ) -> None:
        self.cfg = cfg
        self.costs = costs
        self.logger = logger

        self.cash: float = cfg.initial_equity
        self.open_positions: dict[str, OpenPosition] = {}
        self.closed_trades: list[ExecutedTrade] = []
        self.equity_curve: list[EquityPoint] = []

        self.daily_pnl: dict[date_t, float] = {}
        self.weekly_pnl: dict[date_t, float] = {}  # keyed by Monday date
        self.cooldown_until: dict[str, pd.Timestamp] = {}

        self.consecutive_losses: int = 0
        self.pause_until: Optional[pd.Timestamp] = None
        self.halt_until_date: Optional[date_t] = None
        self.halt_until_week: Optional[date_t] = None

    # ------------------------------------------------------------------
    # Read-only helpers
    # ------------------------------------------------------------------
    def current_equity(self) -> float:
        """Cash + mark-to-market of open positions.

        Uses each open position's most recent ``last_mark_price``
        (refreshed by the simulator). ``unrealized_pnl_pct`` on the
        position is already kept in sync by ``update_mark``.
        """
        unrealized = 0.0
        for pos in self.open_positions.values():
            unrealized += pos.notional_usd * pos.unrealized_pnl_pct
        return self.cash + unrealized

    def can_enter(
        self,
        symbol: str,
        time: pd.Timestamp,
    ) -> tuple[bool, Optional[str]]:
        """Return ``(allowed, reason_if_denied)``.

        Reasons are stable short strings so tests and audit filters can
        assert exact matches: ``consecutive_loss_pause``, ``daily_loss_halt``,
        ``weekly_loss_halt``, ``max_concurrent``, ``already_open``,
        ``cooldown``.
        """
        if self.pause_until is not None and time < self.pause_until:
            return (False, "consecutive_loss_pause")
        if self.halt_until_date is not None and time.date() <= self.halt_until_date:
            return (False, "daily_loss_halt")
        if self.halt_until_week is not None and _week_key(time) <= self.halt_until_week:
            return (False, "weekly_loss_halt")
        if len(self.open_positions) >= self.cfg.max_concurrent_positions:
            return (False, "max_concurrent")
        if symbol in self.open_positions:
            return (False, "already_open")
        cd = self.cooldown_until.get(symbol)
        if cd is not None and time < cd:
            return (False, "cooldown")
        return (True, None)

    def size_position(
        self,
        signal: EntrySignal,
        entry_price_raw: float,
        equity: float,
    ) -> tuple[float, float]:
        """Return ``(size_units, notional_usd)`` for the given signal.

        Uses ``cfg.sizing_method``. Only ``fixed_risk`` is implemented
        in D12; ``kelly`` and ``fixed_notional`` raise
        ``ConfigValidationError`` until D14.
        """
        if self.cfg.sizing_method == "fixed_risk":
            # notional such that stop_loss_pct × notional = risk_per_trade_pct × equity
            risk_budget = equity * self.cfg.risk_per_trade_pct
            notional = risk_budget / self.cfg.stop_loss_pct
            size_units = notional / entry_price_raw
            return (size_units, notional)
        raise ConfigValidationError(
            f"sizing_method={self.cfg.sizing_method!r} not implemented in D12"
        )

    # ------------------------------------------------------------------
    # Mutations
    # ------------------------------------------------------------------
    def enter(
        self,
        signal: EntrySignal,
        entry_price_raw: float,
        entry_price_exec: float,
        size_units: float,
        notional_usd: float,
        stop_price: float,
        target_price: float,
    ) -> None:
        """Record a new open position. Precondition: ``can_enter`` returned True."""
        pos = OpenPosition(
            symbol=signal.symbol,
            direction=signal.direction,
            entry_time=signal.timestamp,
            entry_price_raw=entry_price_raw,
            entry_price_exec=entry_price_exec,
            size_units=size_units,
            notional_usd=notional_usd,
            stop_price=stop_price,
            target_price=target_price,
            source_model=signal.source_model,
            last_mark_price=entry_price_raw,
            unrealized_pnl_pct=0.0,
        )
        self.open_positions[signal.symbol] = pos
        self.logger.info(
            "position_opened",
            symbol=signal.symbol,
            direction=signal.direction,
            entry_time=signal.timestamp,
            notional=notional_usd,
            source=signal.source_model,
        )

    def mark_closed(
        self,
        symbol: str,
        trade_result: TradeResult,
        *,
        force_reason_override: Optional[str] = None,
    ) -> ExecutedTrade:
        """Apply a ``TradeResult`` to close the named position.

        Updates cash, records the ``ExecutedTrade``, updates cooldown,
        daily/weekly accounting, and the consecutive-loss counter. Fires
        circuit breakers when their thresholds are crossed.
        """
        if symbol not in self.open_positions:
            raise KeyError(f"no open position for {symbol!r}")
        pos = self.open_positions.pop(symbol)

        realized_pnl_usd = pos.notional_usd * trade_result.realized_pnl_pct
        self.cash += realized_pnl_usd

        exit_reason_final = force_reason_override or trade_result.exit_reason
        executed = ExecutedTrade(
            symbol=symbol,
            direction=pos.direction,
            source_model=pos.source_model,
            entry_time=pos.entry_time,
            entry_price_raw=pos.entry_price_raw,
            entry_price_exec=pos.entry_price_exec,
            exit_time=trade_result.exit_time,
            exit_price_raw=trade_result.exit_price_raw,
            exit_price_exec=trade_result.exit_price_exec,
            notional_usd=pos.notional_usd,
            size_units=pos.size_units,
            gross_pnl_pct=trade_result.gross_pnl_pct,
            fee_pct_total=trade_result.fee_pct_total,
            slippage_pct_total=trade_result.slippage_pct_total,
            realized_pnl_pct=trade_result.realized_pnl_pct,
            realized_pnl_usd=realized_pnl_usd,
            exit_reason=exit_reason_final,  # type: ignore[arg-type]
            bars_to_exit=trade_result.bars_to_exit,
        )
        self.closed_trades.append(executed)

        # Cooldown
        cd_bars = self.cfg.cooldown_bars_per_symbol
        if cd_bars > 0:
            # We use 1h bars throughout Phase D — conversion will move
            # to a configurable timeframe in D14.
            self.cooldown_until[symbol] = trade_result.exit_time + timedelta(hours=cd_bars)

        # Daily + weekly accounting (based on the exit bar's date)
        day = trade_result.exit_time.date()
        self.daily_pnl[day] = self.daily_pnl.get(day, 0.0) + trade_result.realized_pnl_pct
        wk = _week_key(trade_result.exit_time)
        self.weekly_pnl[wk] = self.weekly_pnl.get(wk, 0.0) + trade_result.realized_pnl_pct

        # Daily loss halt — triggered when cumulative daily return <= -limit
        if self.daily_pnl[day] <= -self.cfg.daily_loss_limit_pct:
            self.halt_until_date = day
            self.logger.warning(
                "daily_loss_halt",
                day=day,
                cumulative_pct=self.daily_pnl[day],
            )

        # Weekly loss halt
        if self.weekly_pnl[wk] <= -self.cfg.weekly_loss_limit_pct:
            self.halt_until_week = wk
            self.logger.warning(
                "weekly_loss_halt",
                week_start=wk,
                cumulative_pct=self.weekly_pnl[wk],
            )

        # Consecutive loss pause
        if trade_result.realized_pnl_pct < 0:
            self.consecutive_losses += 1
            if self.consecutive_losses >= self.cfg.max_consecutive_losses:
                self.pause_until = trade_result.exit_time + timedelta(
                    hours=self.cfg.consecutive_loss_pause_bars
                )
                self.logger.warning(
                    "consecutive_loss_pause",
                    count=self.consecutive_losses,
                    pause_until=self.pause_until,
                )
                self.consecutive_losses = 0  # reset after pause trigger
        else:
            self.consecutive_losses = 0

        self.logger.info(
            "position_closed",
            symbol=symbol,
            realized_pnl_pct=trade_result.realized_pnl_pct,
            exit_reason=exit_reason_final,
            bars_to_exit=trade_result.bars_to_exit,
        )
        return executed

    def mark_positions(self, mark_prices: dict[str, float]) -> None:
        """Refresh every open position's ``last_mark_price`` in place."""
        for symbol, price in mark_prices.items():
            pos = self.open_positions.get(symbol)
            if pos is not None:
                pos.update_mark(price)

    def record_equity_sample(self, time: pd.Timestamp) -> None:
        """Append an equity-curve sample at the given time.

        Uses ``current_equity()`` which relies on the most recent
        ``mark_positions`` call, so the simulator is responsible for
        calling ``mark_positions`` before ``record_equity_sample`` on
        each bar.
        """
        self.equity_curve.append(EquityPoint(time=time, equity=self.current_equity()))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _week_key(ts: pd.Timestamp) -> date_t:
    """Return the Monday date for the ISO week containing ``ts``.

    Used as the key for weekly PnL accounting so calendar weeks line up
    regardless of intra-week exit timing.
    """
    py_date: date_t = ts.date() if hasattr(ts, "date") else ts
    # isoweekday(): Monday=1 ... Sunday=7
    days_from_monday = py_date.isoweekday() - 1
    result: date_t = py_date - timedelta(days=days_from_monday)
    return result
