"""Tests for LedgerStore JSON-based persistence."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pandas as pd
import pytest

from ledger.store import LedgerRecordStore, LedgerStore
from ledger.types import PatternLedgerRecord, PatternOutcome, PatternStats


SLUG = "tradoor-oi-reversal-v1"


@pytest.fixture
def store(tmp_path: Path) -> LedgerStore:
    """LedgerStore backed by a temp directory — never touches real ledger_data/."""
    return LedgerStore(base_dir=tmp_path / "ledger")


def _make_outcome(
    slug: str = SLUG,
    symbol: str = "PTBUSDT",
    outcome: str = "pending",
    entry_price: float | None = None,
    peak_price: float | None = None,
    accumulation_at: datetime | None = None,
    breakout_at: datetime | None = None,
) -> PatternOutcome:
    o = PatternOutcome(
        pattern_slug=slug,
        symbol=symbol,
        outcome=outcome,  # type: ignore[arg-type]
        entry_price=entry_price,
        peak_price=peak_price,
        accumulation_at=accumulation_at,
        breakout_at=breakout_at,
    )
    return o


class TestSave:
    def test_save_creates_json_file(self, store: LedgerStore) -> None:
        o = _make_outcome()
        path = store.save(o)
        assert path.exists()
        assert path.suffix == ".json"
        assert path.stem == o.id

    def test_save_in_correct_subdirectory(self, store: LedgerStore) -> None:
        o = _make_outcome(slug=SLUG)
        path = store.save(o)
        assert path.parent.name == SLUG

    def test_save_updates_updated_at(self, store: LedgerStore) -> None:
        o = _make_outcome()
        before = datetime.now()
        store.save(o)
        assert o.updated_at >= before


class TestLoad:
    def test_load_roundtrips_data(self, store: LedgerStore) -> None:
        acc_at = datetime(2025, 3, 10, 12, 0, 0)
        o = _make_outcome(
            symbol="AAVEUSDT",
            entry_price=100.0,
            accumulation_at=acc_at,
        )
        store.save(o)

        loaded = store.load(SLUG, o.id)
        assert loaded is not None
        assert loaded.id == o.id
        assert loaded.symbol == "AAVEUSDT"
        assert loaded.entry_price == 100.0
        assert loaded.accumulation_at is not None
        assert loaded.accumulation_at.year == 2025

    def test_load_returns_none_for_missing(self, store: LedgerStore) -> None:
        result = store.load(SLUG, "nonexistent")
        assert result is None

    def test_load_preserves_outcome_field(self, store: LedgerStore) -> None:
        o = _make_outcome(outcome="success")
        store.save(o)
        loaded = store.load(SLUG, o.id)
        assert loaded is not None
        assert loaded.outcome == "success"


class TestListPending:
    def test_list_pending_only_returns_pending(self, store: LedgerStore) -> None:
        pending = _make_outcome(symbol="SYM1", outcome="pending")
        success = _make_outcome(symbol="SYM2", outcome="success")
        failure = _make_outcome(symbol="SYM3", outcome="failure")

        store.save(pending)
        store.save(success)
        store.save(failure)

        results = store.list_pending(SLUG)
        symbols = {r.symbol for r in results}
        assert "SYM1" in symbols
        assert "SYM2" not in symbols
        assert "SYM3" not in symbols

    def test_list_pending_empty_when_none(self, store: LedgerStore) -> None:
        o = _make_outcome(outcome="success")
        store.save(o)
        assert store.list_pending(SLUG) == []

    def test_list_all_returns_all(self, store: LedgerStore) -> None:
        for sym in ["A", "B", "C"]:
            store.save(_make_outcome(symbol=sym))
        assert len(store.list_all(SLUG)) == 3


class TestCloseOutcome:
    def test_close_outcome_updates_result(self, store: LedgerStore) -> None:
        o = _make_outcome(entry_price=100.0)
        store.save(o)

        closed = store.close_outcome(SLUG, o.id, "success", peak_price=150.0)
        assert closed is not None
        assert closed.outcome == "success"
        assert closed.peak_price == 150.0

    def test_close_outcome_computes_max_gain_pct(self, store: LedgerStore) -> None:
        o = _make_outcome(entry_price=100.0)
        store.save(o)

        closed = store.close_outcome(SLUG, o.id, "success", peak_price=150.0)
        assert closed is not None
        assert closed.max_gain_pct == pytest.approx(0.5)  # (150-100)/100

    def test_close_outcome_computes_duration_hours(self, store: LedgerStore) -> None:
        acc_at = datetime(2025, 1, 1, 0, 0, 0)
        brk_at = datetime(2025, 1, 1, 6, 0, 0)
        o = _make_outcome(entry_price=50.0, accumulation_at=acc_at)
        store.save(o)

        closed = store.close_outcome(
            SLUG, o.id, "success", peak_price=75.0, breakout_at=brk_at
        )
        assert closed is not None
        assert closed.duration_hours == pytest.approx(6.0)

    def test_close_outcome_returns_none_for_missing(self, store: LedgerStore) -> None:
        result = store.close_outcome(SLUG, "nope", "failure")
        assert result is None

    def test_close_outcome_persists_to_disk(self, store: LedgerStore) -> None:
        o = _make_outcome(entry_price=200.0)
        store.save(o)
        store.close_outcome(SLUG, o.id, "failure")

        reloaded = store.load(SLUG, o.id)
        assert reloaded is not None
        assert reloaded.outcome == "failure"


class TestAutoEvaluatePending:
    def test_uses_only_post_entry_window_for_peak_and_exit(
        self,
        store: LedgerStore,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        acc_at = datetime(2025, 1, 1, 0, 0, tzinfo=timezone.utc)
        o = _make_outcome(entry_price=100.0, accumulation_at=acc_at)
        store.save(o)

        index = pd.to_datetime(
            [
                "2024-12-31T23:00:00Z",
                "2025-01-01T00:00:00Z",
                "2025-01-02T12:00:00Z",
                "2025-01-03T23:00:00Z",
                "2025-01-04T00:00:00Z",
                "2025-01-04T06:00:00Z",
            ],
            utc=True,
        )
        klines = pd.DataFrame(
            {"close": [250.0, 100.0, 108.0, 115.0, 110.0, 180.0]},
            index=index,
        )

        monkeypatch.setattr("data_cache.loader.load_klines", lambda symbol, offline=True: klines)

        evaluated = store.auto_evaluate_pending(SLUG)

        assert len(evaluated) == 1
        reloaded = store.load(SLUG, o.id)
        assert reloaded is not None
        assert reloaded.outcome == "success"
        assert reloaded.peak_price == pytest.approx(115.0)
        assert reloaded.exit_price == pytest.approx(110.0)
        assert reloaded.max_gain_pct == pytest.approx(0.15)
        assert reloaded.exit_return_pct == pytest.approx(0.10)

    def test_handles_aware_entry_timestamp_without_time_math_errors(
        self,
        store: LedgerStore,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        entry_at = datetime.now(timezone.utc) - timedelta(hours=90)
        outcome = _make_outcome(
            symbol="AAVEUSDT",
            entry_price=100.0,
            accumulation_at=entry_at,
        )
        store.save(outcome)

        index = pd.date_range(entry_at, periods=5, freq="24h", tz="UTC")
        klines = pd.DataFrame({"close": [100.0, 98.0, 95.0, 89.0, 96.0]}, index=index)
        monkeypatch.setattr("data_cache.loader.load_klines", lambda symbol, offline=True: klines)

        evaluated = store.auto_evaluate_pending(SLUG)

        assert len(evaluated) == 1
        reloaded = store.load(SLUG, outcome.id)
        assert reloaded is not None
        assert reloaded.outcome == "failure"
        assert reloaded.exit_price == pytest.approx(89.0)


class TestComputeStats:
    def test_empty_returns_zeros(self, store: LedgerStore) -> None:
        stats = store.compute_stats(SLUG)
        assert stats.total_instances == 0
        assert stats.success_rate == 0.0
        assert stats.avg_gain_pct is None

    def test_success_rate_calculation(self, store: LedgerStore) -> None:
        # 2 success, 1 failure, 1 pending
        for i in range(2):
            o = _make_outcome(symbol=f"WIN{i}", entry_price=100.0)
            store.save(o)
            store.close_outcome(SLUG, o.id, "success", peak_price=120.0)

        o_fail = _make_outcome(symbol="LOSE")
        store.save(o_fail)
        store.close_outcome(SLUG, o_fail.id, "failure")

        o_pend = _make_outcome(symbol="WAIT")
        store.save(o_pend)

        stats = store.compute_stats(SLUG)
        assert stats.total_instances == 4
        assert stats.success_count == 2
        assert stats.failure_count == 1
        assert stats.pending_count == 1
        assert stats.success_rate == pytest.approx(2 / 3)

    def test_avg_gain_pct_from_successful(self, store: LedgerStore) -> None:
        # outcome 1: 20% gain, outcome 2: 40% gain → avg 30%
        for gain_pct, sym in [(0.20, "SYM1"), (0.40, "SYM2")]:
            entry = 100.0
            peak = entry * (1 + gain_pct)
            o = _make_outcome(symbol=sym, entry_price=entry)
            store.save(o)
            store.close_outcome(SLUG, o.id, "success", peak_price=peak)

        stats = store.compute_stats(SLUG)
        assert stats.avg_gain_pct == pytest.approx(0.30)

    def test_recent_30d_count(self, store: LedgerStore) -> None:
        # Recent outcome (now)
        o_recent = _make_outcome(symbol="RECENT")
        store.save(o_recent)

        # Old outcome — manually set created_at far in the past by resaving
        o_old = _make_outcome(symbol="OLD")
        o_old.created_at = datetime(2020, 1, 1)
        store.save(o_old)

        stats = store.compute_stats(SLUG)
        assert stats.recent_30d_count == 1
        assert stats.total_instances == 2

    def test_timeout_counts_as_failure(self, store: LedgerStore) -> None:
        o = _make_outcome(symbol="TIMEOUT_SYM")
        store.save(o)
        store.close_outcome(SLUG, o.id, "timeout")

        stats = store.compute_stats(SLUG)
        assert stats.failure_count == 1
        assert stats.success_count == 0


class TestLedgerRecordStore:
    def test_append_and_load_roundtrip(self, tmp_path: Path) -> None:
        store = LedgerRecordStore(base_dir=tmp_path / "ledger-records")
        record = PatternLedgerRecord(
            record_type="entry",
            pattern_slug=SLUG,
            symbol="PTBUSDT",
            outcome_id="outcome-1",
            transition_id="transition-1",
            payload={"entry_price": 1.23},
        )

        store.append(record)
        loaded = store.load(SLUG, record.id)

        assert loaded is not None
        assert loaded.id == record.id
        assert loaded.record_type == "entry"
        assert loaded.payload["entry_price"] == 1.23

    def test_compute_family_stats_uses_entry_capture_ratio(self, tmp_path: Path) -> None:
        store = LedgerRecordStore(base_dir=tmp_path / "ledger-records")
        for idx in range(4):
            store.append(
                PatternLedgerRecord(
                    record_type="entry",
                    pattern_slug=SLUG,
                    symbol=f"SYM{idx}",
                )
            )
        for idx in range(2):
            store.append(
                PatternLedgerRecord(
                    record_type="capture",
                    pattern_slug=SLUG,
                    symbol=f"SYM{idx}",
                )
            )
        store.append(PatternLedgerRecord(record_type="score", pattern_slug=SLUG, symbol="SYM0"))
        store.append(PatternLedgerRecord(record_type="verdict", pattern_slug=SLUG, symbol="SYM0"))

        stats = store.compute_family_stats(SLUG)

        assert stats.entry_count == 4
        assert stats.capture_count == 2
        assert stats.score_count == 1
        assert stats.verdict_count == 1
        assert stats.capture_to_entry_rate == pytest.approx(0.5)
