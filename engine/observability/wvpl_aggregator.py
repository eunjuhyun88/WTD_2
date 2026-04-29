"""Weekly WVPL aggregation — APScheduler job.

Runs every Sunday 23:55 KST to compute WVPL for the just-completed week
and upsert into ``user_wvpl_weekly``.

Design: work/active/W-0305-d2-wvpl-nsm-instrumentation.md (D-001 batch, idempotent upsert)
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Callable, Iterable

from ledger.store import LEDGER_RECORD_STORE, LedgerRecordStore
from observability.wvpl import KST, WVPLBreakdown, compute_wvpl_for_user, kst_week_start

log = logging.getLogger("engine.observability.wvpl_aggregator")

WriterFn = Callable[[WVPLBreakdown], None]


def list_active_user_ids(record_store: LedgerRecordStore) -> list[str]:
    """Return distinct user_ids that have any capture/verdict record."""
    seen: set[str] = set()
    for slug in record_store.list_pattern_slugs():
        for record in record_store.list(slug):
            if record.user_id:
                seen.add(record.user_id)
    return sorted(seen)


def aggregate_weekly_wvpl(
    week_start: datetime,
    *,
    record_store: LedgerRecordStore | None = None,
    writer: WriterFn | None = None,
    user_ids: Iterable[str] | None = None,
) -> list[WVPLBreakdown]:
    """Compute WVPL for every active user in the given week and upsert.

    Args:
        week_start: KST week boundary; will be normalized.
        record_store: Defaults to ``LEDGER_RECORD_STORE``.
        writer: Optional function to persist each breakdown. When ``None``,
            tries the Supabase writer; on failure logs a warning (idempotent
            catch-up next run).
        user_ids: Optional explicit user list (overrides ``list_active_user_ids``).

    Returns:
        Computed breakdowns (one per user).
    """
    store = record_store or LEDGER_RECORD_STORE
    aligned = kst_week_start(week_start)
    targets = list(user_ids) if user_ids is not None else list_active_user_ids(store)

    results: list[WVPLBreakdown] = []
    persist = writer or _supabase_writer

    for user_id in targets:
        breakdown = compute_wvpl_for_user(user_id, aligned, record_store=store)
        try:
            persist(breakdown)
        except Exception as exc:  # noqa: BLE001 — non-fatal; weekly retry is acceptable
            log.warning("wvpl writer failed for user=%s week=%s: %s", user_id, aligned.isoformat(), exc)
        results.append(breakdown)

    return results


def aggregate_previous_week(
    *,
    record_store: LedgerRecordStore | None = None,
    writer: WriterFn | None = None,
) -> list[WVPLBreakdown]:
    """Aggregate the most recently completed KST week."""
    now = datetime.now(tz=KST)
    last_week = kst_week_start(now) - timedelta(days=7)
    return aggregate_weekly_wvpl(last_week, record_store=record_store, writer=writer)


def register_scheduler(scheduler) -> None:  # type: ignore[no-untyped-def]
    """Schedule the weekly job: every Sunday 23:55 KST.

    Caller passes an ``apscheduler.schedulers.background.BackgroundScheduler``
    instance. The aggregator runs at week-end so the just-completed window is
    fully closed.
    """
    scheduler.add_job(
        aggregate_previous_week,
        trigger="cron",
        day_of_week="sun",
        hour=23,
        minute=55,
        timezone=KST,
        id="wvpl_weekly_aggregate",
        replace_existing=True,
    )


def _supabase_writer(breakdown: WVPLBreakdown) -> None:
    """Default writer: upsert into Supabase ``user_wvpl_weekly`` table.

    Best-effort. Callers should set SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
    """
    import os

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not (url and key):
        log.debug("supabase env unset; skipping wvpl write")
        return

    from supabase import create_client  # type: ignore[import]

    client = create_client(url, key)
    client.table("user_wvpl_weekly").upsert(
        {
            "user_id": breakdown.user_id,
            "week_start": breakdown.week_start.date().isoformat(),
            "loop_count": breakdown.loop_count,
            "capture_n": breakdown.capture_n,
            "search_n": breakdown.search_n,
            "verdict_n": breakdown.verdict_n,
        },
        on_conflict="user_id,week_start",
    ).execute()
