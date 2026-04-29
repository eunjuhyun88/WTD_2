"""Tests for W-0290 Phase 1 label calculation module."""
from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from engine.research.validation.costs import BINANCE_PERP_TAKER_15BPS_V1
from engine.research.validation.labels import (
    ReturnLabel,
    TripleBarrierConfig,
    label_entries,
    label_entry,
)


def _prices(values: list[float]) -> pd.Series:
    return pd.Series(values, dtype=float)


class TestLongPositiveReturn:
    def test_long_positive_return(self) -> None:
        """Rising prices → positive raw bps for long."""
        # entry at index 0: price=100, exit at index 4: price=101
        prices = _prices([100.0, 100.5, 101.0, 101.0, 101.0])
        result = label_entry(prices, 0, horizon_hours=4, bars_per_hour=1.0)
        # (101-100)/100 * 10000 = 100 bps
        assert result.return_exact_h_bps_raw == pytest.approx(100.0)
        assert result.horizon_hours == 4


class TestShortPositiveReturn:
    def test_short_positive_return(self) -> None:
        """Falling prices → positive raw bps for short."""
        prices = _prices([100.0, 99.5, 99.0, 99.0, 99.0])
        result = label_entry(prices, 0, horizon_hours=4, bars_per_hour=1.0, side="short")
        # (100-99)/100 * 10000 = 100 bps
        assert result.return_exact_h_bps_raw == pytest.approx(100.0)


class TestNetLessThanGross:
    def test_net_less_than_gross(self) -> None:
        """Net return = gross - cost, so net < gross when cost > 0."""
        prices = _prices([100.0] * 5 + [101.0])
        result = label_entry(prices, 0, horizon_hours=5, bars_per_hour=1.0)
        assert result.return_exact_h_bps_net < result.return_exact_h_bps_raw

    def test_net_equals_raw_minus_cost(self) -> None:
        prices = _prices([100.0, 101.0])
        result = label_entry(prices, 0, horizon_hours=1, bars_per_hour=1.0)
        cost = BINANCE_PERP_TAKER_15BPS_V1.total_cost_bps(1)
        assert result.return_exact_h_bps_net == pytest.approx(
            result.return_exact_h_bps_raw - cost
        )


class TestMfeMaeBounds:
    def test_mfe_non_negative(self) -> None:
        """MFE must be >= 0 for any price path (long)."""
        prices = _prices([100.0, 98.0, 97.0, 96.0])
        result = label_entry(prices, 0, horizon_hours=3, bars_per_hour=1.0)
        assert result.mfe_bps >= 0.0

    def test_mae_non_positive(self) -> None:
        """MAE must be <= 0 for any price path (long)."""
        prices = _prices([100.0, 102.0, 104.0, 106.0])
        result = label_entry(prices, 0, horizon_hours=3, bars_per_hour=1.0)
        assert result.mae_bps <= 0.0

    def test_mfe_gt_mae_for_rising_prices(self) -> None:
        prices = _prices([100.0, 101.0, 102.0, 103.0, 104.0])
        result = label_entry(prices, 0, horizon_hours=4, bars_per_hour=1.0)
        assert result.mfe_bps > 0.0
        # For monotonically rising, mae at entry is 0.0
        assert result.mae_bps == pytest.approx(0.0)


class TestTripleBarrier:
    def test_profit_take(self) -> None:
        """Price reaches TP level → profit_take outcome."""
        # TP = 60 bps, entry=100, TP price = 100 * (1 + 60/10000) = 100.60
        prices = _prices([100.0, 100.3, 100.7, 100.5])
        tb = TripleBarrierConfig(profit_take_bps=60.0, stop_loss_bps=30.0)
        result = label_entry(
            prices, 0, horizon_hours=3, bars_per_hour=1.0, triple_barrier=tb
        )
        assert result.triple_barrier_outcome == "profit_take"

    def test_stop_loss(self) -> None:
        """Price reaches SL level → stop_loss outcome."""
        # SL = -30 bps, entry=100, SL price = 100 * (1 - 30/10000) = 99.70
        prices = _prices([100.0, 99.8, 99.65, 99.5])
        tb = TripleBarrierConfig(profit_take_bps=60.0, stop_loss_bps=30.0)
        result = label_entry(
            prices, 0, horizon_hours=3, bars_per_hour=1.0, triple_barrier=tb
        )
        assert result.triple_barrier_outcome == "stop_loss"

    def test_timeout(self) -> None:
        """Price stays within barriers → timeout outcome."""
        # Price fluctuates within ±20 bps, barriers at ±60/30
        prices = _prices([100.0, 100.1, 99.9, 100.05, 100.0])
        tb = TripleBarrierConfig(profit_take_bps=60.0, stop_loss_bps=30.0)
        result = label_entry(
            prices, 0, horizon_hours=4, bars_per_hour=1.0, triple_barrier=tb
        )
        assert result.triple_barrier_outcome == "timeout"


class TestInsufficientData:
    def test_entry_at_last_bar_returns_timeout(self) -> None:
        """When entry_idx is at or past the last bar, return timeout."""
        prices = _prices([100.0, 101.0])
        result = label_entry(prices, 10, horizon_hours=4, bars_per_hour=1.0)
        assert result.triple_barrier_outcome == "timeout"
        assert result.return_exact_h_bps_raw == pytest.approx(0.0)

    def test_single_bar_no_crash(self) -> None:
        prices = _prices([100.0])
        result = label_entry(prices, 0, horizon_hours=1, bars_per_hour=1.0)
        assert isinstance(result, ReturnLabel)


class TestLabelEntries:
    def test_batch_returns_correct_count(self) -> None:
        prices = _prices([100.0, 101.0, 102.0, 103.0, 104.0, 105.0])
        results = label_entries(prices, [0, 1, 2], horizon_hours=2, bars_per_hour=1.0)
        assert len(results) == 3

    def test_all_results_are_return_labels(self) -> None:
        prices = _prices([100.0] * 10)
        results = label_entries(prices, [0, 1], horizon_hours=2, bars_per_hour=1.0)
        for r in results:
            assert isinstance(r, ReturnLabel)
