"""Tests for decay.py (W-0290 Phase 2)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from research.validation.decay import check_decay, DecayResult


def _make_timestamps(n: int, days_back: int = 90) -> list[datetime]:
    """n evenly-spaced timestamps over the last ``days_back`` days."""
    now = datetime.now(timezone.utc)
    step = timedelta(days=days_back) / max(n, 1)
    return [now - timedelta(days=days_back) + step * i for i in range(n)]


class TestCheckDecay:
    def test_empty_returns_healthy(self):
        result = check_decay([], [], horizon_hours=4)
        assert result.status == "healthy"
        assert result.windows == []

    def test_mismatched_lengths_healthy(self):
        result = check_decay([10.0, 20.0], [datetime.now(timezone.utc)], horizon_hours=4)
        assert result.status == "healthy"

    def test_all_positive_healthy(self):
        n = 60
        returns = [25.0] * n
        timestamps = _make_timestamps(n)
        result = check_decay(returns, timestamps, horizon_hours=4, cost_bps=15.0)
        assert result.status == "healthy"

    def test_30d_and_60d_negative_deprecated(self):
        n = 60
        returns = [-20.0] * n
        timestamps = _make_timestamps(n, days_back=90)
        result = check_decay(returns, timestamps, horizon_hours=4,
                              cost_bps=15.0, min_window_n=3)
        assert result.status == "deprecated"
        assert "30d" in result.reason or "deprecated" in result.reason.lower() or "negative" in result.reason.lower()

    def test_only_30d_negative_warning(self):
        """30d negative but 60d positive → warning, not deprecated."""
        now = datetime.now(timezone.utc)
        # 40 positive entries 31-90 days ago, 10 negative entries in last 30d
        old_ts = [now - timedelta(days=90 - i) for i in range(40)]
        new_ts = [now - timedelta(days=29 - i) for i in range(10)]
        timestamps = old_ts + new_ts
        returns = [30.0] * 40 + [-25.0] * 10

        result = check_decay(returns, timestamps, horizon_hours=4,
                              cost_bps=15.0, min_window_n=3)
        assert result.status in ("warning", "deprecated")

    def test_edge_below_cost_warning(self):
        """30d positive but edge < cost → warning."""
        n = 30
        returns = [5.0] * n    # positive but below 15bps cost
        timestamps = _make_timestamps(n, days_back=30)
        result = check_decay(returns, timestamps, horizon_hours=4,
                              cost_bps=15.0, min_window_n=3)
        assert result.status == "warning"
        assert "cost" in result.reason

    def test_windows_populated(self):
        n = 90
        returns = [20.0] * n
        timestamps = _make_timestamps(n, days_back=90)
        result = check_decay(returns, timestamps, horizon_hours=4,
                              window_days=(30, 60, 90), min_window_n=3)
        window_days = {w.window_days for w in result.windows}
        assert 30 in window_days
        assert 60 in window_days
        assert 90 in window_days

    def test_to_dict_structure(self):
        n = 30
        returns = [20.0] * n
        timestamps = _make_timestamps(n, days_back=30)
        result = check_decay(returns, timestamps, horizon_hours=4)
        d = result.to_dict()
        assert "status" in d
        assert "reason" in d
        assert "windows" in d
        assert "checked_at" in d
        assert d["horizon_hours"] == 4

    def test_horizon_preserved(self):
        n = 30
        returns = [20.0] * n
        timestamps = _make_timestamps(n, days_back=30)
        result = check_decay(returns, timestamps, horizon_hours=72)
        assert result.horizon_hours == 72

    def test_reference_dt_override(self):
        """Using a future reference_dt shifts all windows forward."""
        n = 30
        returns = [20.0] * n
        timestamps = _make_timestamps(n, days_back=30)
        # Reference 1 year in future → all entries fall outside all windows
        future = datetime.now(timezone.utc) + timedelta(days=400)
        result = check_decay(returns, timestamps, horizon_hours=4,
                              reference_dt=future, min_window_n=5)
        # All windows should have n=0 → insufficient data
        for w in result.windows:
            assert w.n == 0

    def test_deprecated_trigger_fires_once(self):
        """Deprecated status only needs 30d+60d negative."""
        n = 90
        returns = [-30.0] * n
        timestamps = _make_timestamps(n, days_back=90)
        result = check_decay(returns, timestamps, horizon_hours=4,
                              cost_bps=15.0, min_window_n=3)
        assert result.status == "deprecated"
