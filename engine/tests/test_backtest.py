"""Smoke tests for research.backtest — W-0104."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch

import pandas as pd
import pytest

from research.backtest import (
    BacktestResult,
    BacktestSignal,
    _measure_fwd,
    run_pattern_backtest,
)


# ── _measure_fwd ─────────────────────────────────────────────────────────────

def _make_klines(closes: list[float], highs: list[float] | None = None) -> pd.DataFrame:
    n = len(closes)
    return pd.DataFrame({
        "open":   closes,
        "high":   highs if highs else closes,
        "low":    closes,
        "close":  closes,
        "volume": [1.0] * n,
    }, index=pd.date_range("2024-01-01", periods=n, freq="1h"))


class TestMeasureFwd:
    def test_basic_positive_return(self):
        klines = _make_klines([100.0] + [110.0] * 80, highs=[100.0] + [115.0] * 80)
        f24, f48, f72, peak, hit = _measure_fwd(klines, 0, 72, target_pct=0.10)
        assert f24 == pytest.approx(0.10, abs=0.01)
        assert f72 == pytest.approx(0.10, abs=0.01)
        assert peak == pytest.approx(0.15, abs=0.01)
        assert hit is True

    def test_target_miss(self):
        klines = _make_klines([100.0] + [105.0] * 80, highs=[100.0] + [105.0] * 80)
        _, _, _, peak, hit = _measure_fwd(klines, 0, 72, target_pct=0.20)
        assert peak == pytest.approx(0.05, abs=0.01)
        assert hit is False

    def test_not_enough_bars(self):
        # 3 bars only → all forward returns are None (need idx+24/48/72 which don't exist)
        klines = _make_klines([100.0, 110.0, 120.0])
        f24, f48, f72, peak, hit = _measure_fwd(klines, 0, 72, target_pct=0.10)
        assert f24 is None
        assert f48 is None
        assert f72 is None
        assert peak is not None   # peak uses the 2 available forward bars

    def test_zero_entry_price(self):
        klines = _make_klines([0.0, 1.0, 2.0])
        result = _measure_fwd(klines, 0, 72, target_pct=0.10)
        assert result == (None, None, None, None, False)


# ── BacktestResult ────────────────────────────────────────────────────────────

class TestBacktestResult:
    def _make_result(self, returns_72h: list[float], target_hit: list[bool]) -> BacktestResult:
        signals = [
            BacktestSignal(
                symbol="TESTUSDT",
                pattern_slug="tradoor-oi-reversal-v1",
                entry_time=datetime(2024, 1, 1, tzinfo=timezone.utc),
                entry_price=100.0,
                fwd_return_72h=r,
                target_hit=h,
            )
            for r, h in zip(returns_72h, target_hit)
        ]
        return BacktestResult(
            pattern_slug="tradoor-oi-reversal-v1",
            timeframe="1h",
            universe_size=1,
            since=None,
            forward_bars=72,
            target_pct=0.20,
            signals=signals,
        )

    def test_win_rate(self):
        result = self._make_result([0.10, -0.05, 0.20, -0.10], [True, False, True, False])
        assert result.win_rate == pytest.approx(0.50)

    def test_hit_rate(self):
        result = self._make_result([0.10, -0.05, 0.20, -0.10], [True, False, True, False])
        assert result.hit_rate == pytest.approx(0.50)

    def test_avg_return(self):
        result = self._make_result([0.10, 0.20], [True, True])
        assert result.avg_return_72h == pytest.approx(0.15)

    def test_empty_signals(self):
        result = BacktestResult(
            pattern_slug="test", timeframe="1h", universe_size=0,
            since=None, forward_bars=72, target_pct=0.20,
        )
        assert result.n_signals == 0
        assert result.win_rate is None
        assert result.hit_rate is None

    def test_summary_prints(self):
        result = self._make_result([0.10, -0.05], [True, False])
        s = result.summary()
        assert "tradoor-oi-reversal-v1" in s
        assert "n_signals" in s
        assert "win_rate" in s


# ── run_pattern_backtest integration (mocked) ─────────────────────────────────

class TestRunPatternBacktest:
    def test_unknown_pattern_returns_empty(self):
        result = run_pattern_backtest("nonexistent-pattern-v99", ["BTCUSDT"])
        assert result.n_signals == 0

    def test_empty_universe(self):
        result = run_pattern_backtest("tradoor-oi-reversal-v1", [])
        assert result.n_signals == 0
        assert result.universe_size == 0

    def test_missing_data_symbol_skipped(self):
        with patch("data_cache.loader.load_klines", side_effect=Exception("no cache")):
            result = run_pattern_backtest("tradoor-oi-reversal-v1", ["FAKEUSDT"])
        assert result.n_signals == 0

    def test_result_fields(self):
        result = run_pattern_backtest("tradoor-oi-reversal-v1", [])
        assert result.pattern_slug == "tradoor-oi-reversal-v1"
        assert result.timeframe == "1h"
        assert result.forward_bars == 72
        assert result.target_pct > 0
