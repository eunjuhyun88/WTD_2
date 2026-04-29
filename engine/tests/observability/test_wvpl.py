"""Tests for WVPL (Weekly Verified Pattern Loops) — D2 NSM instrumentation."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from ledger.store import LedgerRecordStore
from ledger.types import PatternLedgerRecord
from observability.wvpl import (
    KST,
    WVPLBreakdown,
    compute_wvpl_for_user,
    kst_week_start,
)


def _ts(year: int, month: int, day: int, hour: int = 12) -> datetime:
    """Helper: construct a KST timestamp."""
    return datetime(year, month, day, hour, tzinfo=KST)


def _append(
    store: LedgerRecordStore,
    *,
    user_id: str,
    pattern_slug: str,
    record_type: str,
    created_at: datetime,
) -> None:
    store.append(
        PatternLedgerRecord(
            record_type=record_type,  # type: ignore[arg-type]
            pattern_slug=pattern_slug,
            user_id=user_id,
            created_at=created_at,
        )
    )


@pytest.fixture
def store(tmp_path: Path) -> LedgerRecordStore:
    return LedgerRecordStore(base_dir=tmp_path / "ledger-records")


# ── kst_week_start ────────────────────────────────────────────────────────


class TestKSTWeekStart:
    def test_sunday_at_midnight_returns_self(self) -> None:
        # 2026-04-26 is a Sunday
        sunday = datetime(2026, 4, 26, 0, 0, tzinfo=KST)
        assert kst_week_start(sunday) == sunday

    def test_midweek_aligns_to_previous_sunday(self) -> None:
        wed = datetime(2026, 4, 29, 12, 30, tzinfo=KST)  # Wednesday
        sunday = datetime(2026, 4, 26, 0, 0, tzinfo=KST)
        assert kst_week_start(wed) == sunday

    def test_naive_datetime_treated_as_kst(self) -> None:
        naive = datetime(2026, 4, 29, 12, 30)
        assert kst_week_start(naive) == datetime(2026, 4, 26, 0, 0, tzinfo=KST)

    def test_utc_input_normalized_to_kst(self) -> None:
        # 2026-04-26 00:00 UTC = 2026-04-26 09:00 KST (still Sunday in KST)
        utc = datetime(2026, 4, 26, 0, 0, tzinfo=timezone.utc)
        assert kst_week_start(utc) == datetime(2026, 4, 26, 0, 0, tzinfo=KST)


# ── compute_wvpl_for_user ─────────────────────────────────────────────────


class TestComputeWVPL:
    WEEK = _ts(2026, 4, 26, 0)  # Sunday 00:00 KST

    def test_zero_loop_returns_empty_breakdown(
        self, store: LedgerRecordStore
    ) -> None:
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result == WVPLBreakdown(
            user_id="user-1",
            week_start=self.WEEK,
            capture_n=0,
            search_n=0,
            verdict_n=0,
            loop_count=0,
        )

    def test_one_complete_loop(self, store: LedgerRecordStore) -> None:
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="capture",
            created_at=_ts(2026, 4, 27, 10),  # Mon
        )
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="verdict",
            created_at=_ts(2026, 4, 28, 14),  # Tue
        )
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result.capture_n == 1
        assert result.verdict_n == 1
        assert result.loop_count == 1

    def test_multi_pattern_independent_loops(
        self, store: LedgerRecordStore
    ) -> None:
        for slug in ("pat-A", "pat-B", "pat-C"):
            _append(
                store,
                user_id="user-1",
                pattern_slug=slug,
                record_type="capture",
                created_at=_ts(2026, 4, 27),
            )
            _append(
                store,
                user_id="user-1",
                pattern_slug=slug,
                record_type="verdict",
                created_at=_ts(2026, 4, 29),
            )
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result.capture_n == 3
        assert result.verdict_n == 3
        assert result.loop_count == 3

    def test_orphan_verdict_not_counted_as_loop(
        self, store: LedgerRecordStore
    ) -> None:
        # verdict without matching capture → counted in verdict_n only
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-orphan",
            record_type="verdict",
            created_at=_ts(2026, 4, 28),
        )
        # complete loop in another pattern
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="capture",
            created_at=_ts(2026, 4, 27),
        )
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="verdict",
            created_at=_ts(2026, 4, 28),
        )
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result.capture_n == 1
        assert result.verdict_n == 2  # orphan + matched
        assert result.loop_count == 1  # only pat-A is complete

    def test_records_outside_window_excluded(
        self, store: LedgerRecordStore
    ) -> None:
        # Previous week
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="capture",
            created_at=_ts(2026, 4, 20),
        )
        # Next week
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="verdict",
            created_at=_ts(2026, 5, 3),
        )
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result.capture_n == 0
        assert result.verdict_n == 0
        assert result.loop_count == 0

    def test_other_users_excluded(self, store: LedgerRecordStore) -> None:
        _append(
            store,
            user_id="user-2",
            pattern_slug="pat-A",
            record_type="capture",
            created_at=_ts(2026, 4, 27),
        )
        _append(
            store,
            user_id="user-2",
            pattern_slug="pat-A",
            record_type="verdict",
            created_at=_ts(2026, 4, 28),
        )
        # user-1 has nothing
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result.loop_count == 0

    def test_week_boundary_inclusive_start_exclusive_end(
        self, store: LedgerRecordStore
    ) -> None:
        # Exactly at week_start: included
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="capture",
            created_at=self.WEEK,
        )
        # Exactly at week_end (next Sunday 00:00): excluded
        _append(
            store,
            user_id="user-1",
            pattern_slug="pat-A",
            record_type="verdict",
            created_at=self.WEEK + timedelta(days=7),
        )
        result = compute_wvpl_for_user("user-1", self.WEEK, record_store=store)
        assert result.capture_n == 1
        assert result.verdict_n == 0
        assert result.loop_count == 0

    def test_empty_user_id_raises(self, store: LedgerRecordStore) -> None:
        with pytest.raises(ValueError, match="user_id is required"):
            compute_wvpl_for_user("", self.WEEK, record_store=store)

    def test_search_n_from_db(
        self, store: LedgerRecordStore, tmp_path: Path
    ) -> None:
        db_path = tmp_path / "search.db"
        with sqlite3.connect(str(db_path)) as conn:
            conn.execute(
                """
                CREATE TABLE search_judgements (
                    judgement_id TEXT PRIMARY KEY,
                    run_id TEXT, candidate_id TEXT, symbol TEXT,
                    verdict TEXT, dominant_layer TEXT,
                    layer_a_score REAL, layer_b_score REAL, layer_c_score REAL,
                    final_score REAL, user_id TEXT, judged_at TEXT
                )
                """
            )
            in_window = _ts(2026, 4, 28).astimezone(timezone.utc).isoformat()
            out_of_window = _ts(2026, 4, 20).astimezone(timezone.utc).isoformat()
            conn.executemany(
                "INSERT INTO search_judgements (judgement_id, run_id, candidate_id, "
                "verdict, user_id, judged_at) VALUES (?, ?, ?, ?, ?, ?)",
                [
                    ("j1", "r1", "c1", "good", "user-1", in_window),
                    ("j2", "r1", "c2", "bad", "user-1", in_window),
                    ("j3", "r1", "c3", "good", "user-1", out_of_window),
                    ("j4", "r1", "c4", "good", "user-2", in_window),  # other user
                ],
            )

        result = compute_wvpl_for_user(
            "user-1",
            self.WEEK,
            record_store=store,
            search_db_path=db_path,
        )
        assert result.search_n == 2  # only in-window for user-1

    def test_search_n_is_zero_when_db_missing(
        self, store: LedgerRecordStore, tmp_path: Path
    ) -> None:
        result = compute_wvpl_for_user(
            "user-1",
            self.WEEK,
            record_store=store,
            search_db_path=tmp_path / "missing.db",
        )
        assert result.search_n == 0
