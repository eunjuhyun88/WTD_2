"""WVPL (Weekly Verified Pattern Loops) — D2 NSM instrumentation.

A "loop" = 1 user × 1 pattern × {capture → search → verdict} sequence in a
weekly window. WVPL is the product North Star Metric: it measures how often
each user closes the discovery → research → judgement flywheel per week.

Charter: In-Scope L7 (Refinement) — feedback loop measurement.
Design:  work/active/W-0305-d2-wvpl-nsm-instrumentation.md
"""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ledger.store import LedgerRecordStore

KST = timezone(timedelta(hours=9))


@dataclass
class WVPLBreakdown:
    """Per-user weekly loop breakdown.

    loop_count = number of distinct patterns with ≥1 capture AND ≥1 verdict
    in the window. Orphan verdicts (no matching capture) count toward
    verdict_n but not loop_count, preserving loop-completion semantics.
    """

    user_id: str
    week_start: datetime  # KST Sunday 00:00
    capture_n: int = 0
    search_n: int = 0
    verdict_n: int = 0
    loop_count: int = 0

    def to_dict(self) -> dict:
        return {
            "user_id": self.user_id,
            "week_start": self.week_start.isoformat(),
            "capture_n": self.capture_n,
            "search_n": self.search_n,
            "verdict_n": self.verdict_n,
            "loop_count": self.loop_count,
        }


def kst_week_start(dt: datetime) -> datetime:
    """Return KST Sunday 00:00 of the week containing dt."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=KST)
    else:
        dt = dt.astimezone(KST)
    # Python weekday: Monday=0..Sunday=6. We want Sunday=start.
    days_since_sunday = (dt.weekday() + 1) % 7
    sunday = dt - timedelta(days=days_since_sunday)
    return sunday.replace(hour=0, minute=0, second=0, microsecond=0)


def compute_wvpl_for_user(
    user_id: str,
    week_start: datetime,
    *,
    record_store: "LedgerRecordStore",
    search_db_path: Path | str | None = None,
) -> WVPLBreakdown:
    """Compute WVPL for one user and one weekly window.

    Args:
        user_id: Target user id (must be non-empty).
        week_start: Start of the week. Normalized to KST Sunday 00:00 if
            non-aligned. Use ``kst_week_start()`` for explicit normalization.
        record_store: ``LedgerRecordStore`` providing capture/verdict records.
        search_db_path: Optional path to ``search_judgements.db``. When
            absent, ``search_n = 0`` (search instrumentation not yet wired).

    Returns:
        ``WVPLBreakdown`` with per-component counts and completed loop count.
    """
    if not user_id:
        raise ValueError("user_id is required")

    aligned_week_start = kst_week_start(week_start)
    week_end = aligned_week_start + timedelta(days=7)

    captures_by_pattern: dict[str, int] = {}
    verdicts_by_pattern: dict[str, int] = {}

    for pattern_slug in record_store.list_pattern_slugs():
        for record_type, bucket in (
            ("capture", captures_by_pattern),
            ("verdict", verdicts_by_pattern),
        ):
            for record in record_store.list(pattern_slug, record_type=record_type):
                if record.user_id != user_id:
                    continue
                created = record.created_at
                if created.tzinfo is None:
                    created = created.replace(tzinfo=KST)
                if not (aligned_week_start <= created < week_end):
                    continue
                bucket[pattern_slug] = bucket.get(pattern_slug, 0) + 1

    capture_n = sum(captures_by_pattern.values())
    verdict_n = sum(verdicts_by_pattern.values())
    loop_count = len(set(captures_by_pattern) & set(verdicts_by_pattern))

    search_n = 0
    if search_db_path is not None:
        search_n = _count_search_events(
            user_id, aligned_week_start, week_end, Path(search_db_path)
        )

    return WVPLBreakdown(
        user_id=user_id,
        week_start=aligned_week_start,
        capture_n=capture_n,
        search_n=search_n,
        verdict_n=verdict_n,
        loop_count=loop_count,
    )


def _count_search_events(
    user_id: str,
    window_start: datetime,
    window_end: datetime,
    db_path: Path,
) -> int:
    """Count search_judgements rows for this user in [window_start, window_end).

    ``judged_at`` is stored as UTC ISO. Convert window bounds to UTC ISO
    so SQLite lexicographic comparison stays correct.
    """
    if not db_path.exists():
        return 0

    start_utc = window_start.astimezone(timezone.utc).isoformat()
    end_utc = window_end.astimezone(timezone.utc).isoformat()

    with sqlite3.connect(str(db_path)) as conn:
        cursor = conn.execute(
            """
            SELECT COUNT(*) FROM search_judgements
            WHERE user_id = ?
              AND judged_at >= ?
              AND judged_at < ?
            """,
            (user_id, start_utc, end_utc),
        )
        row = cursor.fetchone()
        return int(row[0]) if row else 0
