"""Integration tests for backtest.simulator.run_backtest — 5 cases per §6.10."""
from __future__ import annotations

import io

import pandas as pd

from backtest.config import RiskConfig
from backtest.simulator import BacktestResult, run_backtest
from backtest.types import EntrySignal
from observability.logging import StructuredLogger
from scanner.pnl import ExecutionCosts


ZERO_COSTS = ExecutionCosts(
    fee_maker_pct=0.0,
    fee_taker_pct=0.0,
    use_fee="taker",
    base_slippage_pct=0.0,
    adv_notional_fraction_threshold=1.0,
    impact_k=0.0,
)


def _logger() -> StructuredLogger:
    return StructuredLogger("test.sim", run_id="t", stream=io.StringIO())


def _bars(rows: list[tuple[float, float, float, float]], start: str) -> pd.DataFrame:
    idx = pd.date_range(start, periods=len(rows), freq="h", tz="UTC")
    return pd.DataFrame(
        rows, columns=["open", "high", "low", "close"], index=idx
    )


def _sig(symbol: str, t: str, prob: float = 0.9, direction: str = "long") -> EntrySignal:
    return EntrySignal(
        symbol=symbol,
        timestamp=pd.Timestamp(t, tz="UTC"),
        direction=direction,  # type: ignore[arg-type]
        predicted_prob=prob,
        source_model="test",
    )


# ---------------------------------------------------------------------------
# 1. Simple 1-signal backtest → 1 trade closed
# ---------------------------------------------------------------------------


def test_simple_single_signal_closes_one_trade():
    # One symbol, 5 bars, signal at bar 0. Bar 1 hits target.
    klines = _bars(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 105.0, 99.9, 104.5),
            (104.0, 106.0, 103.0, 105.0),
            (105.0, 105.5, 104.5, 105.0),
            (105.0, 105.5, 104.5, 105.0),
        ],
        "2024-01-01",
    )
    entries = [_sig("BTCUSDT", "2024-01-01 00:00")]
    result = run_backtest(
        entries=entries,
        klines_by_symbol={"BTCUSDT": klines},
        adv_by_symbol={"BTCUSDT": 1_000_000_000.0},
        risk_cfg=RiskConfig(),
        costs=ZERO_COSTS,
        threshold=0.5,
        logger=_logger(),
    )
    assert len(result.trades) == 1
    assert result.trades[0].exit_reason == "target"
    assert result.metrics.n_executed == 1
    # 5 equity samples: 1 at open, 1 at close → we record at entry + exit
    assert len(result.equity_curve) == 2


# ---------------------------------------------------------------------------
# 2. Second signal blocked by concurrent limit
# ---------------------------------------------------------------------------


def test_second_signal_blocked_by_max_concurrent():
    # 3 symbols' worth of signals at the same timestamp → 4th rejected
    klines_rows = [
        (100.0, 100.5, 99.5, 100.0),
        (100.0, 100.5, 99.9, 100.2),  # slow bar, no stop / no target
        (100.2, 100.8, 99.8, 100.5),
        (100.5, 101.0, 100.0, 100.8),  # target at 104 not hit
        (100.8, 101.5, 100.3, 101.0),  # timeout close at 101.0
    ]
    klines_by_symbol = {
        s: _bars(klines_rows, "2024-01-01") for s in ("A", "B", "C", "D")
    }
    adv_by_symbol = {s: 1_000_000_000.0 for s in ("A", "B", "C", "D")}
    entries = [
        _sig("A", "2024-01-01 00:00"),
        _sig("B", "2024-01-01 00:00"),
        _sig("C", "2024-01-01 00:00"),
        _sig("D", "2024-01-01 00:00"),
    ]
    result = run_backtest(
        entries=entries,
        klines_by_symbol=klines_by_symbol,
        adv_by_symbol=adv_by_symbol,
        risk_cfg=RiskConfig(max_concurrent_positions=3, max_hold_bars=5),
        costs=ZERO_COSTS,
        threshold=0.5,
        logger=_logger(),
    )
    assert len(result.trades) == 3
    assert result.block_reasons.get("max_concurrent", 0) == 1


# ---------------------------------------------------------------------------
# 3. Daily halt kicks in mid-day → subsequent signals blocked
# ---------------------------------------------------------------------------


def test_daily_halt_blocks_later_signals_same_day():
    # Signal fires at bar T close; entry executes at bar T+1 open.
    # Both A and B lose ~2%. Daily limit 3% → halt after B closes.
    # C's signal (bar 2) is blocked before it can enter at bar 3.
    losing_rows = [
        # bar 0 (00:00): A's signal bar — quiet, no action.
        (100.0, 100.5, 99.5, 100.0),
        # bar 1 (01:00): A enters open=100, low=97 hits stop at 98 → −2%.
        (100.0, 100.5, 97.0, 98.0),
        # bar 2 (02:00): B enters open=98, low=95 hits stop at 96.04 → −2%.
        (98.0, 98.5, 95.0, 96.0),
        # bar 3 (03:00): C would enter here — blocked by daily_loss_halt.
        (96.0, 96.5, 95.5, 96.0),
        (96.0, 96.5, 95.5, 96.0),
    ]
    klines_by_symbol = {
        s: _bars(losing_rows, "2024-01-01") for s in ("A", "B", "C")
    }
    adv_by_symbol = {s: 1_000_000_000.0 for s in ("A", "B", "C")}
    entries = [
        _sig("A", "2024-01-01 00:00"),
        _sig("B", "2024-01-01 01:00"),
        _sig("C", "2024-01-01 02:00"),
    ]
    result = run_backtest(
        entries=entries,
        klines_by_symbol=klines_by_symbol,
        adv_by_symbol=adv_by_symbol,
        risk_cfg=RiskConfig(
            max_concurrent_positions=3,
            max_hold_bars=3,
            daily_loss_limit_pct=0.03,
            cooldown_bars_per_symbol=0,
            max_consecutive_losses=99,  # keep pause out of it
        ),
        costs=ZERO_COSTS,
        threshold=0.5,
        logger=_logger(),
    )
    # A and B both close at stop → cumulative -4% → halt
    # C should then be blocked by daily_loss_halt
    assert len(result.trades) == 2
    assert result.block_reasons.get("daily_loss_halt", 0) == 1


# ---------------------------------------------------------------------------
# 4. Walk-forward time ordering correct — trades sorted by exit time
# ---------------------------------------------------------------------------


def test_trade_ordering_is_monotonic():
    # Two non-overlapping signals, second comes after first's exit.
    # Verify exit_time of trade 0 <= exit_time of trade 1.
    rows = [
        (100.0, 100.5, 99.5, 100.0),
        (100.0, 105.0, 99.9, 104.5),  # target @ bar 1
        (104.0, 105.0, 103.0, 104.0),
        (104.0, 109.0, 103.9, 108.5),  # target @ bar 3 for next signal
        (108.0, 109.0, 107.0, 108.0),
    ]
    klines = _bars(rows, "2024-01-01")
    entries = [
        _sig("BTCUSDT", "2024-01-01 00:00"),
        _sig("BTCUSDT", "2024-01-01 02:00"),
    ]
    result = run_backtest(
        entries=entries,
        klines_by_symbol={"BTCUSDT": klines},
        adv_by_symbol={"BTCUSDT": 1_000_000_000.0},
        risk_cfg=RiskConfig(cooldown_bars_per_symbol=0),
        costs=ZERO_COSTS,
        threshold=0.5,
        logger=_logger(),
    )
    assert len(result.trades) == 2
    assert result.trades[0].exit_time <= result.trades[1].exit_time
    # Equity curve strictly ordered
    times = [pt.time for pt in result.equity_curve]
    assert times == sorted(times)


# ---------------------------------------------------------------------------
# 5. Threshold filter drops low-prob signals before the simulator
# ---------------------------------------------------------------------------


def test_threshold_filter_drops_below_threshold():
    rows = [
        (100.0, 100.5, 99.5, 100.0),
        (100.0, 105.0, 99.9, 104.5),  # would hit target
        (104.0, 105.0, 103.0, 104.0),
    ]
    klines = _bars(rows, "2024-01-01")
    entries = [
        _sig("BTCUSDT", "2024-01-01 00:00", prob=0.40),  # dropped
        _sig("BTCUSDT", "2024-01-01 00:00", prob=0.70),  # kept — but same symbol/time…
    ]
    result = run_backtest(
        entries=entries,
        klines_by_symbol={"BTCUSDT": klines},
        adv_by_symbol={"BTCUSDT": 1_000_000_000.0},
        risk_cfg=RiskConfig(),
        costs=ZERO_COSTS,
        threshold=0.60,
        logger=_logger(),
    )
    # One survives the threshold and one trade runs. Block_reasons
    # should NOT include a threshold entry (we drop those silently
    # before the simulator loop).
    assert len(result.trades) == 1
    assert result.metrics.n_executed == 1
