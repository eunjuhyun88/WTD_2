"""Tests for scoring.verdict — auto verdict system."""
import pytest
import pandas as pd
import numpy as np

from scoring.verdict import (
    verdict_from_bars,
    VerdictOutcome,
    VerdictTracker,
)


def _make_bars(prices: list[tuple[float, float, float]]) -> pd.DataFrame:
    """Create bars DataFrame from [(high, low, close), ...]."""
    return pd.DataFrame(prices, columns=["high", "low", "close"])


class TestVerdictFromBars:
    def test_long_hit_target(self):
        # Entry at 100, target +1% = 101, bar 2 hits 101.5
        bars = _make_bars([
            (100.5, 99.8, 100.3),
            (101.5, 100.2, 101.2),  # high > 101
        ])
        v = verdict_from_bars(100.0, bars, direction="long", target_pct=0.01, stop_pct=0.01)
        assert v.outcome == VerdictOutcome.HIT
        assert v.pnl_pct == 0.01
        assert v.bars_held == 2

    def test_long_hit_stop(self):
        # Entry at 100, stop -1% = 99, bar 1 hits 98.5
        bars = _make_bars([
            (100.2, 98.5, 99.0),  # low < 99
        ])
        v = verdict_from_bars(100.0, bars, direction="long", target_pct=0.01, stop_pct=0.01)
        assert v.outcome == VerdictOutcome.MISS
        assert v.pnl_pct == -0.01
        assert v.bars_held == 1

    def test_long_void_timeout(self):
        # Price stays flat for 24 bars
        bars = _make_bars([(100.3, 99.8, 100.1)] * 24)
        v = verdict_from_bars(100.0, bars, direction="long", target_pct=0.01, stop_pct=0.01, max_bars=24)
        assert v.outcome == VerdictOutcome.VOID
        assert v.bars_held == 24

    def test_pessimistic_intrabar(self):
        # Both stop and target touched in same bar → MISS (pessimistic)
        bars = _make_bars([
            (101.5, 98.5, 100.0),  # high > target, low < stop
        ])
        v = verdict_from_bars(100.0, bars, direction="long", target_pct=0.01, stop_pct=0.01)
        assert v.outcome == VerdictOutcome.MISS  # pessimistic: stop checked first

    def test_short_hit_target(self):
        # Entry at 100, short target -1% = 99
        bars = _make_bars([
            (100.5, 99.5, 99.8),
            (99.8, 98.5, 98.8),  # low < 99
        ])
        v = verdict_from_bars(100.0, bars, direction="short", target_pct=0.01, stop_pct=0.01)
        assert v.outcome == VerdictOutcome.HIT
        assert v.bars_held == 2

    def test_short_hit_stop(self):
        # Entry at 100, short stop +1% = 101
        bars = _make_bars([
            (101.5, 100.0, 101.2),  # high > 101
        ])
        v = verdict_from_bars(100.0, bars, direction="short", target_pct=0.01, stop_pct=0.01)
        assert v.outcome == VerdictOutcome.MISS

    def test_empty_bars_pending(self):
        bars = pd.DataFrame(columns=["high", "low", "close"])
        v = verdict_from_bars(100.0, bars, direction="long")
        assert v.outcome == VerdictOutcome.PENDING

    def test_mfe_mae_tracked(self):
        bars = _make_bars([
            (102.0, 99.0, 100.5),  # MFE = +2%, MAE = -1%
            (100.5, 98.0, 98.5),   # stop hit
        ])
        v = verdict_from_bars(100.0, bars, direction="long", target_pct=0.03, stop_pct=0.02)
        assert v.max_favorable > 0
        assert v.max_adverse < 0

    def test_custom_target_stop(self):
        bars = _make_bars([
            (100.5, 99.0, 100.2),
            (103.0, 100.0, 102.5),  # +3% target
        ])
        v = verdict_from_bars(100.0, bars, direction="long", target_pct=0.03, stop_pct=0.02)
        assert v.outcome == VerdictOutcome.HIT
        assert v.pnl_pct == 0.03


class TestVerdictTracker:
    def test_live_tracking(self):
        tracker = VerdictTracker(entry_price=100.0, direction="long")
        assert not tracker.is_resolved

        v1 = tracker.feed(100.5, 99.8, 100.2)
        assert v1.outcome == VerdictOutcome.PENDING  # not enough bars for VOID

        v2 = tracker.feed(101.5, 100.2, 101.2)
        assert v2.outcome == VerdictOutcome.HIT
        assert tracker.is_resolved

    def test_already_resolved_returns_same(self):
        tracker = VerdictTracker(entry_price=100.0, direction="long")
        tracker.feed(101.5, 100.2, 101.2)
        v = tracker.feed(102.0, 101.0, 101.5)  # already resolved
        assert v.outcome == VerdictOutcome.HIT

    def test_to_dict(self):
        bars = _make_bars([(101.5, 100.2, 101.2)])
        v = verdict_from_bars(100.0, bars, direction="long")
        d = v.to_dict()
        assert "outcome" in d
        assert "pnl_pct" in d
        assert "max_favorable" in d
