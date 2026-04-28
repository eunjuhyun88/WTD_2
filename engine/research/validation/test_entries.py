"""Tests for W-0290 Phase 1 phase entry extraction module."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

from engine.research.validation.entries import (
    PhaseEntryEvent,
    extract_phase_entries,
    extract_phase_entries_from_benchmark,
)


def _make_case(
    start_at: datetime | None = None,
    symbol: str = "BTCUSDT",
    entry_price: float = 50000.0,
    side: str = "long",
    taxonomy_id: str = "T001",
    phase_name: str = "breakout",
    phase_index: int = 1,
    feature_snapshot: dict | None = None,
    regime_label: str | None = None,
) -> MagicMock:
    case = MagicMock()
    case.start_at = start_at or datetime(2024, 1, 10, tzinfo=timezone.utc)
    case.symbol = symbol
    case.entry_price = entry_price
    case.side = side
    case.taxonomy_id = taxonomy_id
    case.phase_name = phase_name
    case.phase_index = phase_index
    case.feature_snapshot = feature_snapshot or {}
    case.regime_label = regime_label
    return case


class TestExtractFromBenchmarkBasic:
    def test_single_case_produces_one_event(self) -> None:
        case = _make_case()
        events = extract_phase_entries_from_benchmark([case], pattern_slug="breakout_v1")
        assert len(events) == 1
        e = events[0]
        assert isinstance(e, PhaseEntryEvent)
        assert e.pattern_slug == "breakout_v1"
        assert e.symbol == "BTCUSDT"
        assert e.source == "benchmark_proxy"
        assert e.entry_price == pytest.approx(50000.0)

    def test_id_format(self) -> None:
        case = _make_case(symbol="ETHUSDT")
        events = extract_phase_entries_from_benchmark([case], pattern_slug="my_pattern")
        assert events[0].id == "my_pattern_ETHUSDT_0"

    def test_side_preserved(self) -> None:
        long_case = _make_case(side="long")
        short_case = _make_case(side="short")
        events = extract_phase_entries_from_benchmark(
            [long_case, short_case], pattern_slug="test"
        )
        assert events[0].side == "long"
        assert events[1].side == "short"

    def test_invalid_side_defaults_to_long(self) -> None:
        case = _make_case(side="unknown_value")
        events = extract_phase_entries_from_benchmark([case], pattern_slug="test")
        assert events[0].side == "long"

    def test_feature_snapshot_copied(self) -> None:
        features = {"rsi": 60.0, "volume_ratio": 1.5}
        case = _make_case(feature_snapshot=features)
        events = extract_phase_entries_from_benchmark([case], pattern_slug="test")
        assert events[0].feature_snapshot == features

    def test_regime_label_preserved(self) -> None:
        case = _make_case(regime_label="bull")
        events = extract_phase_entries_from_benchmark([case], pattern_slug="test")
        assert events[0].regime_label == "bull"

    def test_multiple_cases(self) -> None:
        cases = [_make_case(symbol=f"SYM{i}") for i in range(5)]
        events = extract_phase_entries_from_benchmark(cases, pattern_slug="multi")
        assert len(events) == 5


class TestExtractSkipsMissingStartAt:
    def test_no_start_at_or_timestamp_skipped(self) -> None:
        case = MagicMock()
        case.start_at = None
        case.timestamp = None
        case.symbol = "BTCUSDT"
        events = extract_phase_entries_from_benchmark([case], pattern_slug="test")
        assert len(events) == 0

    def test_timestamp_fallback_used(self) -> None:
        """start_at=None but timestamp present → use timestamp."""
        case = MagicMock()
        ts = datetime(2024, 3, 1, tzinfo=timezone.utc)
        case.start_at = None
        case.timestamp = ts
        case.symbol = "BTCUSDT"
        case.entry_price = 1000.0
        case.side = "long"
        case.taxonomy_id = "T1"
        case.phase_name = "entry"
        case.phase_index = 0
        case.feature_snapshot = {}
        case.regime_label = None
        events = extract_phase_entries_from_benchmark([case], pattern_slug="test")
        assert len(events) == 1
        assert events[0].entered_at == ts

    def test_mixed_valid_and_missing(self) -> None:
        valid = _make_case()
        missing = MagicMock()
        missing.start_at = None
        missing.timestamp = None
        events = extract_phase_entries_from_benchmark([valid, missing], pattern_slug="test")
        assert len(events) == 1


class TestUseLedgerFallback:
    def test_use_ledger_true_still_returns_events(self) -> None:
        """use_ledger=True falls back to benchmark_proxy — returns events."""
        case = _make_case()
        events = extract_phase_entries([case], pattern_slug="test", use_ledger=True)
        assert len(events) == 1
        assert events[0].source == "benchmark_proxy"

    def test_use_ledger_false_default(self) -> None:
        case = _make_case()
        events = extract_phase_entries([case], pattern_slug="test", use_ledger=False)
        assert len(events) == 1
