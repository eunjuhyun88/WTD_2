"""Event-driven portfolio backtest loop.

``run_backtest`` is the Phase D12 top-level entry point. Given a list
of entry signals plus the per-symbol kline cache, it runs the full
signal → portfolio → ``walk_one_trade`` → metrics pipeline and returns
a ``BacktestResult``.

Design notes:

* **Event-driven, not vectorised.** We sort signals by timestamp, then
  interleave them with scheduled exit events using a min-heap. This is
  slower than a post-hoc vectorised walk but makes portfolio-level
  constraints (max concurrent, cooldown, daily halt) trivial to
  enforce correctly.
* **Pure computation inside the loop.** ``walk_one_trade`` is pure, so
  we can compute each trade's full outcome at the moment we decide to
  open it, and then schedule its close as a future event.
* **Equity is sampled at each event**, not each bar, because the
  portfolio state only changes at entry/exit moments in D12. If we add
  per-bar mark-to-market in D14, the equity sample loop here is the
  natural place to do it.
* **Blocked signals are counted and logged**, never silently dropped.
  The ``block_reasons`` dict in ``BacktestResult`` tells you exactly
  why each rejected signal failed the portfolio admission check.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass
from typing import Iterable

import numpy as np
import pandas as pd

from backtest.config import RiskConfig
from backtest.metrics import BacktestMetrics, compute_metrics
from backtest.portfolio import EquityPoint, Portfolio
from backtest.regime import Regime
from backtest.types import EntrySignal, ExecutedTrade
from exceptions import InsufficientDataError
from observability.logging import StructuredLogger
from scanner.pnl import ExecutionCosts, IntrabarOrder, walk_one_trade


@dataclass(frozen=True)
class BacktestResult:
    trades: list[ExecutedTrade]
    equity_curve: list[EquityPoint]
    metrics: BacktestMetrics
    block_reasons: dict[str, int]


_FAR_FUTURE = pd.Timestamp("2100-01-01", tz="UTC")


def run_backtest(
    entries: Iterable[EntrySignal],
    klines_by_symbol: dict[str, pd.DataFrame],
    adv_by_symbol: dict[str, float],
    risk_cfg: RiskConfig,
    costs: ExecutionCosts,
    threshold: float,
    logger: StructuredLogger,
    *,
    intrabar_order: IntrabarOrder = "pessimistic",
    regime_labels: dict[pd.Timestamp, Regime] | None = None,
) -> BacktestResult:
    """Run a portfolio-constrained backtest over ``entries``.

    Args:
        entries: iterable of ``EntrySignal`` — will be filtered by
            ``threshold`` and sorted by timestamp internally.
        klines_by_symbol: the per-symbol OHLC DataFrames. Each must be
            indexed by UTC DatetimeIndex and include ``open``, ``high``,
            ``low``, ``close`` columns.
        adv_by_symbol: per-symbol average daily notional in USD. Passed
            to ``walk_one_trade`` for slippage scaling. Missing symbols
            get ``0.0`` (flat base slippage).
        risk_cfg: the ``RiskConfig`` — preregistered defaults unless an
            ADR says otherwise.
        costs: execution cost model. Defaults come from ``ExecutionCosts()``.
        threshold: signals with ``predicted_prob < threshold`` are
            dropped before the simulation starts. Logged as
            ``threshold_filter`` below.
        logger: structured logger. The backtest writes roughly one
            event per signal / exit / block.
        intrabar_order: passed through to ``walk_one_trade``. Default
            ``"pessimistic"`` per ADR-002.

    Returns:
        A ``BacktestResult`` with trades, equity curve, metrics, and
        block-reason histogram.
    """
    portfolio = Portfolio(risk_cfg, costs, logger)

    filtered: list[EntrySignal] = []
    n_below_threshold = 0
    for e in entries:
        if e.predicted_prob < threshold:
            n_below_threshold += 1
            continue
        filtered.append(e)
    filtered.sort(key=lambda s: s.timestamp)

    logger.info(
        "backtest_start",
        n_candidates=len(filtered),
        n_below_threshold=n_below_threshold,
        threshold=threshold,
        config_hash=risk_cfg.content_hash(),
    )

    # Exit heap entries: (exit_time, seq, symbol, trade_result)
    # ``seq`` keeps the heap comparison total-ordered when two exits
    # share a timestamp (TradeResult doesn't define __lt__).
    exits: list[tuple[pd.Timestamp, int, str, object]] = []
    seq = 0

    def _flush_exits_until(t: pd.Timestamp) -> None:
        while exits and exits[0][0] <= t:
            exit_time, _, symbol, tr = heapq.heappop(exits)
            portfolio.mark_closed(symbol, tr)  # type: ignore[arg-type]
            portfolio.record_equity_sample(exit_time)

    block_reasons: dict[str, int] = {}

    def _record_block(sig: EntrySignal, reason: str) -> None:
        block_reasons[reason] = block_reasons.get(reason, 0) + 1
        logger.info(
            "signal_blocked",
            symbol=sig.symbol,
            reason=reason,
            t=sig.timestamp,
        )

    for sig in filtered:
        _flush_exits_until(sig.timestamp)

        if regime_labels and risk_cfg.regime_skip:
            regime = regime_labels.get(sig.timestamp)
            if regime is not None and regime in risk_cfg.regime_skip:
                _record_block(sig, f"regime_{regime}")
                continue

        ok, reason = portfolio.can_enter(sig.symbol, sig.timestamp)
        if not ok:
            assert reason is not None
            _record_block(sig, reason)
            continue

        klines = klines_by_symbol.get(sig.symbol)
        if klines is None:
            _record_block(sig, "missing_klines")
            continue

        try:
            loc = klines.index.get_loc(sig.timestamp)
        except KeyError:
            _record_block(sig, "timestamp_not_in_klines")
            continue
        # ``get_loc`` can return a slice or boolean ndarray when the
        # timestamp is duplicated. Treat those as data-quality issues
        # rather than guessing which duplicate to use.
        if isinstance(loc, (slice, np.ndarray)):
            _record_block(sig, "duplicate_timestamp")
            continue
        # Signal fires at bar T close → execute at bar T+1 open.
        # Using bar T's open would be lookahead (open precedes the close
        # that triggered the signal).
        entry_pos = int(loc) + 1

        entry_price_raw = float(klines.iloc[entry_pos]["open"])
        equity = portfolio.current_equity()
        size_units, notional_usd = portfolio.size_position(
            sig, entry_price_raw, equity
        )

        if sig.direction == "long":
            stop_price = entry_price_raw * (1.0 - risk_cfg.stop_loss_pct)
            target_price = entry_price_raw * (1.0 + risk_cfg.take_profit_pct)
        else:
            stop_price = entry_price_raw * (1.0 + risk_cfg.stop_loss_pct)
            target_price = entry_price_raw * (1.0 - risk_cfg.take_profit_pct)

        # Clamp horizon so that the backtest can still execute a signal
        # near the end of the available data. The trade will be
        # force-closed at the last available bar's close and reported
        # as ``exit_reason="timeout"``. This mirrors how a live trader
        # would be forced to flatten at data boundaries.
        available_bars = len(klines) - entry_pos
        if available_bars < 1:
            _record_block(sig, "no_future_bars")
            continue
        horizon = min(risk_cfg.max_hold_bars, available_bars)

        adv = adv_by_symbol.get(sig.symbol, 0.0)
        try:
            tr = walk_one_trade(
                klines=klines,
                entry_pos=entry_pos,
                direction=sig.direction,
                target_pct=risk_cfg.take_profit_pct,
                stop_pct=risk_cfg.stop_loss_pct,
                horizon_bars=horizon,
                notional_usd=notional_usd,
                adv_notional_usd=adv,
                costs=costs,
                intrabar_order=intrabar_order,
            )
        except InsufficientDataError:  # pragma: no cover - defensive
            _record_block(sig, "insufficient_data_at_entry")
            continue

        portfolio.enter(
            signal=sig,
            entry_price_raw=entry_price_raw,
            entry_price_exec=float(tr.entry_price_exec),
            size_units=size_units,
            notional_usd=notional_usd,
            stop_price=stop_price,
            target_price=target_price,
        )
        portfolio.record_equity_sample(sig.timestamp)

        seq += 1
        heapq.heappush(exits, (tr.exit_time, seq, sig.symbol, tr))

    # Drain pending exits after the final signal.
    _flush_exits_until(_FAR_FUTURE)

    metrics = compute_metrics(
        portfolio.closed_trades,
        portfolio.equity_curve,
        initial_equity=risk_cfg.initial_equity,
        n_blocked=sum(block_reasons.values()),
    )

    logger.info(
        "backtest_end",
        n_trades=len(portfolio.closed_trades),
        n_blocked=sum(block_reasons.values()),
        final_equity=metrics.final_equity,
        expectancy_pct=metrics.expectancy_pct,
    )

    return BacktestResult(
        trades=portfolio.closed_trades,
        equity_curve=portfolio.equity_curve,
        metrics=metrics,
        block_reasons=block_reasons,
    )
