"""verdict_velocity — daily rolling 7d verdict count snapshot (W-0401-P4).

Called by APScheduler cron at 03:00 UTC via engine/api/main.py.
Upserts a row per user into verdict_velocity_snapshots.
"""
from __future__ import annotations

import logging
import os
from datetime import date, timedelta

log = logging.getLogger("engine.observability.verdict_velocity")


def snapshot_verdict_velocity() -> int:
    """Upsert today's rolling 7d verdict count for each active user.

    Returns the number of users snapshotted.
    """
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        log.warning("SUPABASE creds missing — skipping velocity snapshot")
        return 0

    sb = create_client(url, key)
    today = date.today().isoformat()
    since_7d = (date.today() - timedelta(days=7)).isoformat()

    try:
        # Aggregate: distinct users with verdicts in last 7 days
        agg_res = (
            sb.table("ledger_verdicts")
            .select("user_id")
            .gte("created_at", since_7d)
            .execute()
        )
        rows = agg_res.data or []

        from collections import Counter
        counts = Counter(r["user_id"] for r in rows if r.get("user_id"))

        upserted = 0
        for user_id, count_7d in counts.items():
            sb.table("verdict_velocity_snapshots").upsert(
                {
                    "user_id": user_id,
                    "snapshot_date": today,
                    "count_7d": count_7d,
                },
                on_conflict="user_id,snapshot_date",
            ).execute()
            upserted += 1

        log.info("verdict_velocity snapshot: %d users upserted for %s", upserted, today)
        return upserted
    except Exception as exc:
        log.error("verdict_velocity snapshot failed: %s", exc)
        raise
