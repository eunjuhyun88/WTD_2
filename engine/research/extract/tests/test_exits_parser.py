"""Tests for engine.research.extract.parsers.exits"""

from __future__ import annotations

from pathlib import Path

import pytest

from research.extract.parsers.exits import (
    _compute_trade_distances,
    _linear_regression_no_intercept,
    extract_exit_rules,
)


class TestComputeTradeDistances:
    def test_long_trade(self):
        trade = {
            "entry_price": 100.0,
            "stop_price": 98.5,
            "tp1": 101.0,
            "tp2": 102.0,
            "tp3": 103.0,
            "atr_at_entry": 1.5,
            "direction": "long",
        }
        result = _compute_trade_distances(trade)
        assert result is not None
        assert abs(result["stop_dist"] - 0.015) < 0.0001  # 1.5%
        assert abs(result["tp1_dist"] - 0.01) < 0.0001
        assert abs(result["tp2_dist"] - 0.02) < 0.0001
        assert abs(result["tp3_dist"] - 0.03) < 0.0001

    def test_short_trade(self):
        trade = {
            "entry_price": 100.0,
            "stop_price": 101.5,
            "tp1": 99.0,
            "tp2": 98.0,
            "tp3": 97.0,
            "atr_at_entry": 1.5,
            "direction": "short",
        }
        result = _compute_trade_distances(trade)
        assert result is not None
        assert abs(result["stop_dist"] - 0.015) < 0.0001
        assert abs(result["tp3_dist"] - 0.03) < 0.0001

    def test_returns_none_on_missing_fields(self):
        trade = {"entry_price": 100.0, "stop_price": 98.5}  # missing tp fields
        assert _compute_trade_distances(trade) is None

    def test_returns_none_on_zero_entry(self):
        trade = {
            "entry_price": 0.0,
            "stop_price": 0.1,
            "tp1": 0.2,
            "tp2": 0.3,
            "tp3": 0.4,
        }
        assert _compute_trade_distances(trade) is None


class TestLinearRegressionNoIntercept:
    def test_perfect_fit(self):
        x = [1.0, 2.0, 3.0, 4.0, 5.0]
        y = [2.0, 4.0, 6.0, 8.0, 10.0]  # y = 2x
        k, r2 = _linear_regression_no_intercept(x, y)
        assert abs(k - 2.0) < 0.01
        # R² close to 1.0 (might be >1 for no-intercept but close)

    def test_slope_direction(self):
        x = [0.01, 0.02, 0.015]
        y = [0.015, 0.03, 0.0225]
        k, _ = _linear_regression_no_intercept(x, y)
        assert k > 0


class TestExtractExitRules:
    def test_returns_valid_structure(self, minimal_dump_dir: Path):
        result = extract_exit_rules(minimal_dump_dir)
        assert "brackets" in result
        assert "long" in result["brackets"]
        assert "short" in result["brackets"]

    def test_long_brackets_have_stop_and_tps(self, minimal_dump_dir: Path):
        result = extract_exit_rules(minimal_dump_dir)
        long_b = result["brackets"]["long"]
        assert "stop" in long_b
        assert "tp1" in long_b
        assert "tp2" in long_b
        assert "tp3" in long_b

    def test_k_values_are_positive(self, minimal_dump_dir: Path):
        result = extract_exit_rules(minimal_dump_dir)
        long_b = result["brackets"]["long"]
        for key in ("stop", "tp1", "tp2", "tp3"):
            assert long_b[key]["k"] > 0, f"k value for {key} not positive"

    def test_size_pcts_sum_to_100(self, minimal_dump_dir: Path):
        result = extract_exit_rules(minimal_dump_dir)
        long_b = result["brackets"]["long"]
        total = long_b["tp1"]["size_pct"] + long_b["tp2"]["size_pct"] + long_b["tp3"]["size_pct"]
        assert total == 100

    def test_regression_metadata_present(self, minimal_dump_dir: Path):
        result = extract_exit_rules(minimal_dump_dir)
        assert "_regression_meta" in result
        meta = result["_regression_meta"]
        assert "n_trades" in meta

    def test_time_exit_hours(self, minimal_dump_dir: Path):
        result = extract_exit_rules(minimal_dump_dir)
        assert result.get("time_exit_hours") == 24
