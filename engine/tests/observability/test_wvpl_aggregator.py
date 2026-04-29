"""Tests for WVPL aggregator — active user detection + idempotent writer."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

import pytest

from ledger.store import LedgerRecordStore
from ledger.types import PatternLedgerRecord
from observability.wvpl import KST, WVPLBreakdown
from observability.wvpl_aggregator import (
    aggregate_weekly_wvpl,
    list_active_user_ids,
    register_scheduler,
)


def _ts(year: int, month: int, day: int, hour: int = 12) -> datetime:
    return datetime(year, month, day, hour, tzinfo=KST)


@pytest.fixture
def store(tmp_path: Path) -> LedgerRecordStore:
    s = LedgerRecordStore(base_dir=tmp_path / "ledger-records")
    for user_id, slug in (("alice", "pat-A"), ("bob", "pat-B"), ("alice", "pat-C")):
        s.append(
            PatternLedgerRecord(
                record_type="capture",
                pattern_slug=slug,
                user_id=user_id,
                created_at=_ts(2026, 4, 27),
            )
        )
        s.append(
            PatternLedgerRecord(
                record_type="verdict",
                pattern_slug=slug,
                user_id=user_id,
                created_at=_ts(2026, 4, 28),
            )
        )
    return s


def test_list_active_user_ids_returns_distinct_sorted(
    store: LedgerRecordStore,
) -> None:
    assert list_active_user_ids(store) == ["alice", "bob"]


def test_aggregate_weekly_calls_writer_for_each_user(
    store: LedgerRecordStore,
) -> None:
    captured: list[WVPLBreakdown] = []
    results = aggregate_weekly_wvpl(
        _ts(2026, 4, 26, 0),
        record_store=store,
        writer=captured.append,
    )
    assert len(results) == 2  # alice + bob
    assert {r.user_id for r in results} == {"alice", "bob"}
    # alice has 2 distinct patterns → 2 loops; bob has 1
    by_user = {r.user_id: r for r in results}
    assert by_user["alice"].loop_count == 2
    assert by_user["bob"].loop_count == 1
    # Writer received same payloads
    assert len(captured) == 2


def test_aggregate_swallows_writer_exceptions(
    store: LedgerRecordStore,
) -> None:
    def failing(_: WVPLBreakdown) -> None:
        raise RuntimeError("boom")

    # Should NOT raise — best-effort writer
    results = aggregate_weekly_wvpl(
        _ts(2026, 4, 26),
        record_store=store,
        writer=failing,
    )
    assert len(results) == 2  # still computed for both


def test_aggregate_with_explicit_user_ids_skips_active_scan(
    store: LedgerRecordStore,
) -> None:
    captured: list[WVPLBreakdown] = []
    results = aggregate_weekly_wvpl(
        _ts(2026, 4, 26),
        record_store=store,
        writer=captured.append,
        user_ids=["bob"],
    )
    assert [r.user_id for r in results] == ["bob"]


def test_register_scheduler_adds_weekly_job() -> None:
    class FakeScheduler:
        def __init__(self) -> None:
            self.jobs: list[dict] = []

        def add_job(self, func, **kwargs):
            self.jobs.append({"func": func, **kwargs})

    sched = FakeScheduler()
    register_scheduler(sched)
    assert len(sched.jobs) == 1
    job = sched.jobs[0]
    assert job["trigger"] == "cron"
    assert job["day_of_week"] == "sun"
    assert job["hour"] == 23
    assert job["minute"] == 55
    assert job["id"] == "wvpl_weekly_aggregate"
    assert job["replace_existing"] is True
