"""Tests for W-0099 event_tracker: ExtremeEventDetector, OutcomeTracker, BenchmarkPackBuilder."""
from __future__ import annotations

import json
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from research.event_tracker.models import ExtremeEvent
from research.event_tracker.detector import ExtremeEventDetector
from research.event_tracker.tracker import OutcomeTracker
from research.event_tracker.pack_builder import BenchmarkPackBuilder


# ---------------------------------------------------------------------------
# ExtremeEvent model
# ---------------------------------------------------------------------------

class TestExtremeEventModel:
    def test_round_trip_to_from_dict(self) -> None:
        now = datetime(2026, 4, 19, 12, 0, tzinfo=timezone.utc)
        ev = ExtremeEvent(
            symbol="DYMUSDT",
            event_type="funding_extreme",
            detected_at=now,
            trigger_value=-0.00338,
            outcome_72h=0.26,
            is_predictive=True,
        )
        d = ev.to_dict()
        restored = ExtremeEvent.from_dict(d)
        assert restored.symbol == "DYMUSDT"
        assert restored.trigger_value == pytest.approx(-0.00338)
        assert restored.outcome_72h == pytest.approx(0.26)
        assert restored.is_predictive is True
        assert restored.detected_at == now

    def test_from_dict_missing_detected_at(self) -> None:
        d = {"symbol": "TESTUSDT", "event_type": "compression", "trigger_value": 0.01}
        ev = ExtremeEvent.from_dict(d)
        assert ev.detected_at is None
        assert ev.is_predictive is None


# ---------------------------------------------------------------------------
# ExtremeEventDetector
# ---------------------------------------------------------------------------

def _make_perp_df(funding_rates: list[float], n: int | None = None) -> pd.DataFrame:
    if n is None:
        n = len(funding_rates)
    idx = pd.date_range("2026-04-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame({"funding_rate": funding_rates}, index=idx)


class TestExtremeEventDetector:
    def test_detects_funding_extreme_event(self) -> None:
        perp = _make_perp_df([-0.005, -0.003, -0.002, 0.0001, 0.0001])
        detector = ExtremeEventDetector(funding_threshold=-0.001)
        events = detector._detect_funding_extreme("TESTUSDT", "1h", perp, since=None)
        assert len(events) == 1
        assert events[0].event_type == "funding_extreme"
        assert events[0].symbol == "TESTUSDT"
        assert events[0].trigger_value == pytest.approx(-0.005)

    def test_no_event_when_funding_above_threshold(self) -> None:
        perp = _make_perp_df([0.0001, 0.0002, -0.0005, 0.0001])
        detector = ExtremeEventDetector(funding_threshold=-0.001)
        events = detector._detect_funding_extreme("TESTUSDT", "1h", perp, since=None)
        assert len(events) == 0

    def test_multiple_distinct_events(self) -> None:
        """Two separate extreme periods → two events detected."""
        funding = [-0.002, -0.002, 0.0001, 0.0001, -0.003, -0.003, 0.0001]
        perp = _make_perp_df(funding)
        detector = ExtremeEventDetector(funding_threshold=-0.001)
        events = detector._detect_funding_extreme("TESTUSDT", "1h", perp, since=None)
        assert len(events) == 2

    def test_since_filter(self) -> None:
        """Events before `since` should be excluded."""
        perp = _make_perp_df([-0.002] * 10)
        detector = ExtremeEventDetector(funding_threshold=-0.001)
        since = pd.Timestamp("2026-04-01 05:00", tz="UTC").to_pydatetime()
        events = detector._detect_funding_extreme("TESTUSDT", "1h", perp, since=since)
        # Only 1 event — rising edge was at bar 0, but bar 0 is before since
        assert all(ev.detected_at >= since for ev in events)

    def test_missing_funding_rate_column(self) -> None:
        """Perp without funding_rate → empty list (no crash)."""
        idx = pd.date_range("2026-04-01", periods=5, freq="h", tz="UTC")
        perp = pd.DataFrame({"oi_change_1h": [0.0] * 5}, index=idx)
        detector = ExtremeEventDetector()
        events = detector._detect_funding_extreme("TESTUSDT", "1h", perp, since=None)
        assert events == []

    def test_scan_universe_skips_missing_symbols(self) -> None:
        """scan_universe should not raise when a symbol has no perp data."""
        detector = ExtremeEventDetector()
        with patch("data_cache.loader.load_perp", return_value=None):
            events = detector.scan_universe(["UNKNOWNUSDT"])
        assert events == []


# ---------------------------------------------------------------------------
# OutcomeTracker
# ---------------------------------------------------------------------------

def _make_klines_df(prices: list[float], start: str = "2026-04-01") -> pd.DataFrame:
    n = len(prices)
    idx = pd.date_range(start, periods=n, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "open": prices, "high": [p * 1.01 for p in prices],
            "low": [p * 0.99 for p in prices], "close": prices,
            "volume": [1_000_000.0] * n,
            "taker_buy_base_volume": [500_000.0] * n,
        },
        index=idx,
    )


class TestOutcomeTracker:
    def test_append_and_load(self, tmp_path: Path) -> None:
        tracker = OutcomeTracker(log_path=tmp_path / "events.jsonl")
        ev = ExtremeEvent(
            symbol="TESTUSDT",
            event_type="funding_extreme",
            detected_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            trigger_value=-0.002,
        )
        count = tracker.append_events([ev])
        assert count == 1
        loaded = tracker.load_all()
        assert len(loaded) == 1
        assert loaded[0].symbol == "TESTUSDT"

    def test_append_deduplicates_by_event_id(self, tmp_path: Path) -> None:
        tracker = OutcomeTracker(log_path=tmp_path / "events.jsonl")
        ev = ExtremeEvent(
            symbol="TESTUSDT",
            detected_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            trigger_value=-0.002,
        )
        tracker.append_events([ev])
        count2 = tracker.append_events([ev])  # same event_id
        assert count2 == 0
        assert len(tracker.load_all()) == 1

    def test_update_outcomes_fills_in_returns(self, tmp_path: Path) -> None:
        """Simulate 72h elapsed — update_outcomes should fill outcome_72h."""
        tracker = OutcomeTracker(log_path=tmp_path / "events.jsonl", min_return=0.10)
        detected = datetime(2026, 4, 1, 0, tzinfo=timezone.utc)
        ev = ExtremeEvent(
            symbol="TESTUSDT",
            event_type="funding_extreme",
            detected_at=detected,
            trigger_value=-0.002,
        )
        tracker.append_events([ev])

        # Prices: 10.0 at detection → 12.0 at +72h = +20%
        prices = [10.0] * 1 + [11.0] * 23 + [11.5] * 24 + [12.0] * 26
        klines = _make_klines_df(prices, start="2026-04-01")

        # Patch load_klines + set now to after 72h
        future_now = detected + timedelta(hours=73)
        with (
            patch("data_cache.loader.load_klines", return_value=klines),
            patch("research.event_tracker.tracker.datetime") as mock_dt,
        ):
            mock_dt.now.return_value = future_now
            mock_dt.min = datetime.min
            mock_dt.fromisoformat = datetime.fromisoformat
            updated = tracker.update_outcomes()

        events = tracker.load_all()
        assert updated >= 1
        assert events[0].outcome_72h is not None
        assert events[0].outcome_72h > 0

    def test_get_predictive_events_filters_correctly(self, tmp_path: Path) -> None:
        tracker = OutcomeTracker(log_path=tmp_path / "events.jsonl", min_return=0.10)
        ev1 = ExtremeEvent(
            symbol="GOODUSDT",
            detected_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
            outcome_72h=0.26,
            is_predictive=True,
        )
        ev2 = ExtremeEvent(
            symbol="BADUSDT",
            detected_at=datetime(2026, 4, 2, tzinfo=timezone.utc),
            outcome_72h=0.03,
            is_predictive=False,
        )
        ev3 = ExtremeEvent(
            symbol="PENDINGUSDT",
            detected_at=datetime(2026, 4, 3, tzinfo=timezone.utc),
            # No outcome yet
        )
        tracker.append_events([ev1, ev2, ev3])
        predictive = tracker.get_predictive_events(min_return=0.10)
        assert len(predictive) == 1
        assert predictive[0].symbol == "GOODUSDT"

    def test_summary_structure(self, tmp_path: Path) -> None:
        tracker = OutcomeTracker(log_path=tmp_path / "events.jsonl")
        tracker.append_events([
            ExtremeEvent(symbol="A", outcome_72h=0.20, is_predictive=True, detected_at=datetime(2026,4,1,tzinfo=timezone.utc)),
            ExtremeEvent(symbol="B", outcome_72h=0.05, is_predictive=False, detected_at=datetime(2026,4,2,tzinfo=timezone.utc)),
            ExtremeEvent(symbol="C", detected_at=datetime(2026,4,3,tzinfo=timezone.utc)),
        ])
        s = tracker.summary()
        assert s["total"] == 3
        assert s["resolved"] == 2
        assert s["predictive"] == 1
        assert s["pending"] == 1


# ---------------------------------------------------------------------------
# BenchmarkPackBuilder
# ---------------------------------------------------------------------------

def _make_predictive_events(n: int, returns: list[float] | None = None) -> list[ExtremeEvent]:
    if returns is None:
        returns = [0.20, 0.15, 0.12, 0.10, 0.08]
    events = []
    for i in range(n):
        ev = ExtremeEvent(
            symbol=f"TOKEN{i}USDT",
            event_type="funding_extreme",
            detected_at=datetime(2026, 4, i + 1, tzinfo=timezone.utc),
            trigger_value=-0.002,
            outcome_72h=returns[i] if i < len(returns) else 0.10,
            is_predictive=True,
        )
        events.append(ev)
    return events


class TestBenchmarkPackBuilder:
    def test_builds_pack_with_reference_and_holdouts(self, tmp_path: Path) -> None:
        builder = BenchmarkPackBuilder(pack_dir=tmp_path)
        events = _make_predictive_events(4, returns=[0.26, 0.21, 0.15, 0.10])

        with patch.object(builder, "_has_cache_data", return_value=True):
            pack = builder.build_from_events(
                "funding-flip-reversal-v1", events, n_reference=1, n_holdout=3
            )

        assert pack["pattern_slug"] == "funding-flip-reversal-v1"
        cases = pack["cases"]
        refs = [c for c in cases if c["role"] == "reference"]
        holdouts = [c for c in cases if c["role"] == "holdout"]
        assert len(refs) == 1
        assert len(holdouts) == 3
        # Reference should be the highest-return event
        assert refs[0]["symbol"] == "TOKEN0USDT"

    def test_raises_when_insufficient_events(self, tmp_path: Path) -> None:
        builder = BenchmarkPackBuilder(pack_dir=tmp_path)
        events = _make_predictive_events(1)
        with patch.object(builder, "_has_cache_data", return_value=True):
            with pytest.raises(ValueError, match="Need"):
                builder.build_from_events("test-pattern", events, n_reference=2)

    def test_raises_when_no_cache_data(self, tmp_path: Path) -> None:
        builder = BenchmarkPackBuilder(pack_dir=tmp_path)
        events = _make_predictive_events(3)
        with patch.object(builder, "_has_cache_data", return_value=False):
            with pytest.raises(ValueError):
                builder.build_from_events("test-pattern", events)

    def test_save_and_reload_pack(self, tmp_path: Path) -> None:
        builder = BenchmarkPackBuilder(pack_dir=tmp_path)
        events = _make_predictive_events(2, returns=[0.26, 0.15])
        with patch.object(builder, "_has_cache_data", return_value=True):
            pack = builder.build_from_events("funding-flip-reversal-v1", events)
        saved = builder.save_pack(pack, "test-pack.json")
        assert saved.exists()
        loaded = json.loads(saved.read_text())
        assert loaded["pattern_slug"] == "funding-flip-reversal-v1"

    def test_date_windows_computed_correctly(self, tmp_path: Path) -> None:
        builder = BenchmarkPackBuilder(pack_dir=tmp_path, lookback_days_before=7, lookahead_days_after=7)
        events = _make_predictive_events(2, returns=[0.20, 0.15])
        with patch.object(builder, "_has_cache_data", return_value=True):
            pack = builder.build_from_events("test-slug", events)
        case = pack["cases"][0]
        start = datetime.fromisoformat(case["start_at"])
        end = datetime.fromisoformat(case["end_at"])
        detected = datetime(2026, 4, 1, tzinfo=timezone.utc)
        assert (detected - start).days == 7
        assert (end - detected).days == 7
