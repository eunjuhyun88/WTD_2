"""Tests for scanner.pnl.walk_one_trade — the Phase D12 PnL ground truth.

12 cases per ``docs/design/phase-d12-to-e.md`` §6.10:

1.  Long target hit first
2.  Long stop hit first
3.  Long intrabar both hit, pessimistic → stop
4.  Long intrabar both hit, optimistic → target
5.  Long timeout, positive close
6.  Long timeout, negative close
7.  Short target hit (sign flipped)
8.  Short stop hit (sign flipped)
9.  Short intrabar both hit, pessimistic → stop
10. Slippage > 0 affects entry_price_exec
11. Fee 0 → gross == net (except slippage)
12. ADV small → slippage scales via sqrt
"""
from __future__ import annotations

import math

import pandas as pd
import pytest

from exceptions import InsufficientDataError
from scanner.pnl import ExecutionCosts, walk_one_trade


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _klines(rows: list[tuple[float, float, float, float]]) -> pd.DataFrame:
    """Build a tiny OHLC DataFrame from a list of (o, h, l, c) tuples."""
    idx = pd.date_range("2024-01-01", periods=len(rows), freq="h", tz="UTC")
    return pd.DataFrame(
        rows,
        columns=["open", "high", "low", "close"],
        index=idx,
    )


ZERO_COSTS = ExecutionCosts(
    fee_maker_pct=0.0,
    fee_taker_pct=0.0,
    use_fee="taker",
    base_slippage_pct=0.0,
    adv_notional_fraction_threshold=1.0,
    impact_k=0.0,
)

DEFAULT_COSTS = ExecutionCosts()


# ---------------------------------------------------------------------------
# 1. Long target hit first
# ---------------------------------------------------------------------------


def test_long_target_hit_first():
    # Entry at bar 0 open=100. Target 4% (=104), stop 2% (=98). Bar 1
    # touches 104 but never 98.
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),  # entry bar, quiet
            (100.0, 105.0, 99.9, 104.5),  # target hit
            (104.0, 106.0, 103.0, 105.0),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert r.exit_reason == "target"
    assert r.exit_pos == 1
    assert r.bars_to_exit == 1
    assert math.isclose(r.exit_price_raw, 104.0)
    assert math.isclose(r.gross_pnl_pct, 0.04)
    assert math.isclose(r.realized_pnl_pct, 0.04)  # zero cost


# ---------------------------------------------------------------------------
# 2. Long stop hit first
# ---------------------------------------------------------------------------


def test_long_stop_hit_first():
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),  # quiet entry bar
            (100.0, 101.0, 97.0, 98.5),   # stop at 98 touched (low 97)
            (98.0, 100.0, 97.0, 99.0),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert r.exit_reason == "stop"
    assert r.exit_pos == 1
    assert math.isclose(r.exit_price_raw, 98.0)
    assert math.isclose(r.gross_pnl_pct, -0.02)


# ---------------------------------------------------------------------------
# 3. Long intrabar both hit, pessimistic → stop
# ---------------------------------------------------------------------------


def test_long_intrabar_both_hit_pessimistic_picks_stop():
    # Bar 1 high=104.5 (target), low=97 (stop) — both touched.
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 104.5, 97.0, 100.5),
            (100.5, 101.0, 100.0, 100.8),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
        intrabar_order="pessimistic",
    )
    assert r.exit_reason == "stop"
    assert math.isclose(r.exit_price_raw, 98.0)


# ---------------------------------------------------------------------------
# 4. Long intrabar both hit, optimistic → target
# ---------------------------------------------------------------------------


def test_long_intrabar_both_hit_optimistic_picks_target():
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 104.5, 97.0, 100.5),
            (100.5, 101.0, 100.0, 100.8),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
        intrabar_order="optimistic",
    )
    assert r.exit_reason == "target"
    assert math.isclose(r.exit_price_raw, 104.0)


# ---------------------------------------------------------------------------
# 5. Long timeout, positive close
# ---------------------------------------------------------------------------


def test_long_timeout_positive_close():
    # Horizon 3 bars, never touches 104 or 98. Closes at 102.
    k = _klines(
        [
            (100.0, 100.5, 99.8, 100.3),
            (100.3, 101.0, 99.5, 100.8),
            (100.8, 102.5, 100.0, 102.0),  # timeout close here
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert r.exit_reason == "timeout"
    assert r.exit_pos == 2
    assert r.bars_to_exit == 2
    assert math.isclose(r.exit_price_raw, 102.0)
    assert math.isclose(r.gross_pnl_pct, 0.02)


# ---------------------------------------------------------------------------
# 6. Long timeout, negative close
# ---------------------------------------------------------------------------


def test_long_timeout_negative_close():
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 100.5, 99.0, 99.5),
            (99.5, 99.8, 98.5, 99.0),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert r.exit_reason == "timeout"
    assert r.gross_pnl_pct < 0
    assert math.isclose(r.exit_price_raw, 99.0)


# ---------------------------------------------------------------------------
# 7. Short target hit (sign flipped)
# ---------------------------------------------------------------------------


def test_short_target_hit():
    # Short entry at open=100. Target 4% below = 96. Stop 2% above = 102.
    # Bar 1 drops to 95 (target).
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 100.5, 95.0, 96.0),
            (96.0, 97.0, 94.5, 95.5),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="short",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert r.exit_reason == "target"
    assert math.isclose(r.exit_price_raw, 96.0)
    # Short pnl is (entry - exit) / entry = (100 - 96)/100 = +0.04
    assert math.isclose(r.gross_pnl_pct, 0.04)


# ---------------------------------------------------------------------------
# 8. Short stop hit (sign flipped)
# ---------------------------------------------------------------------------


def test_short_stop_hit():
    # Short at 100. Stop at 102. Bar 1 spikes to 103.
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 103.0, 99.8, 102.5),
            (102.0, 103.0, 101.0, 102.0),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="short",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert r.exit_reason == "stop"
    assert math.isclose(r.exit_price_raw, 102.0)
    # Short pnl = (100 - 102)/100 = -0.02
    assert math.isclose(r.gross_pnl_pct, -0.02)


# ---------------------------------------------------------------------------
# 9. Short intrabar both hit, pessimistic → stop
# ---------------------------------------------------------------------------


def test_short_intrabar_both_hit_pessimistic_picks_stop():
    # Short at 100. Target=96, stop=102. Bar 1: high=103, low=95.
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 103.0, 95.0, 99.0),
            (99.0, 100.0, 98.0, 99.0),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="short",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=3,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
        intrabar_order="pessimistic",
    )
    assert r.exit_reason == "stop"
    assert math.isclose(r.exit_price_raw, 102.0)


# ---------------------------------------------------------------------------
# 10. Slippage > 0 affects entry_price_exec
# ---------------------------------------------------------------------------


def test_slippage_moves_entry_exec_for_long():
    # Long entry at open=100, 2 bps flat slippage → entry_exec = 100.02.
    # Target at 104 hit on bar 1.
    k = _klines(
        [
            (100.0, 100.2, 99.8, 100.0),
            (100.0, 105.0, 99.9, 104.5),
        ]
    )
    costs = ExecutionCosts(
        fee_maker_pct=0.0,
        fee_taker_pct=0.0,
        use_fee="taker",
        base_slippage_pct=0.0002,
        adv_notional_fraction_threshold=1.0,
        impact_k=0.0,
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=2,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=costs,
    )
    assert math.isclose(r.entry_price_exec, 100.0 * (1 + 0.0002))
    # Exit slippage is opposite direction (long sells out): exec < raw
    assert math.isclose(r.exit_price_exec, 104.0 * (1 - 0.0002))
    # Realized = gross - fees (0) - 2 * slippage (4 bps total)
    assert math.isclose(r.realized_pnl_pct, 0.04 - 2 * 0.0002)


# ---------------------------------------------------------------------------
# 11. Fee 0 → gross == net (except slippage already accounted)
# ---------------------------------------------------------------------------


def test_zero_fee_zero_slippage_gross_equals_realized():
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 105.0, 99.9, 104.5),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=2,
        notional_usd=1_000.0,
        adv_notional_usd=1_000_000.0,
        costs=ZERO_COSTS,
    )
    assert math.isclose(r.fee_pct_total, 0.0)
    assert math.isclose(r.slippage_pct_total, 0.0)
    assert math.isclose(r.realized_pnl_pct, r.gross_pnl_pct)


# ---------------------------------------------------------------------------
# 12. Small ADV → sqrt impact blows up slippage
# ---------------------------------------------------------------------------


def test_sqrt_impact_slippage_when_trade_exceeds_adv_threshold():
    # notional 1000 vs ADV 10000 → frac = 0.1 (above 1% threshold)
    # slip = 0.0002 + 0.1 * sqrt(0.1) ≈ 0.0002 + 0.03162 = 0.03182
    costs = ExecutionCosts(
        fee_maker_pct=0.0,
        fee_taker_pct=0.0,
        use_fee="taker",
        base_slippage_pct=0.0002,
        adv_notional_fraction_threshold=0.01,
        impact_k=0.1,
    )
    k = _klines(
        [
            (100.0, 100.5, 99.5, 100.0),
            (100.0, 105.0, 99.9, 104.0),
        ]
    )
    r = walk_one_trade(
        k,
        entry_pos=0,
        direction="long",
        target_pct=0.04,
        stop_pct=0.02,
        horizon_bars=2,
        notional_usd=1_000.0,
        adv_notional_usd=10_000.0,
        costs=costs,
    )
    expected_single = 0.0002 + 0.1 * math.sqrt(1_000.0 / 10_000.0)
    assert math.isclose(r.slippage_pct_total / 2, expected_single, rel_tol=1e-12)
    # Slippage alone wipes out the target — realized should be negative
    assert r.realized_pnl_pct < 0


# ---------------------------------------------------------------------------
# Input validation (bonus coverage — failures must be loud)
# ---------------------------------------------------------------------------


def test_insufficient_data_raises():
    k = _klines([(100.0, 101.0, 99.0, 100.5)])
    with pytest.raises(InsufficientDataError):
        walk_one_trade(
            k,
            entry_pos=0,
            direction="long",
            target_pct=0.04,
            stop_pct=0.02,
            horizon_bars=5,
            notional_usd=1_000.0,
            adv_notional_usd=1_000_000.0,
            costs=DEFAULT_COSTS,
        )


def test_bad_direction_raises():
    k = _klines([(100.0, 101.0, 99.0, 100.5), (100.0, 101.0, 99.0, 100.5)])
    with pytest.raises(ValueError):
        walk_one_trade(
            k,
            entry_pos=0,
            direction="sideways",  # type: ignore[arg-type]
            target_pct=0.04,
            stop_pct=0.02,
            horizon_bars=2,
            notional_usd=1_000.0,
            adv_notional_usd=1_000_000.0,
            costs=DEFAULT_COSTS,
        )
