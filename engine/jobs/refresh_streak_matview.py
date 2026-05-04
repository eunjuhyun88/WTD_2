"""Nightly refresh of verdict_streak_history materialized view (W-0402 PR2).

Called by APScheduler cron at 03:30 UTC via engine/api/main.py.
Uses REFRESH CONCURRENTLY so no table lock during refresh.
Requires the unique index on (user_id, day_utc) — migration 064.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("engine.jobs.refresh_streak_matview")


def refresh_verdict_streak_matview() -> None:
    """Run REFRESH MATERIALIZED VIEW CONCURRENTLY verdict_streak_history."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        log.warning("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping refresh")
        return

    sb = create_client(url, key)
    try:
        sb.rpc("refresh_verdict_streak_matview", {}).execute()
        log.info("verdict_streak_history REFRESH CONCURRENTLY complete")
    except Exception as exc:
        log.error("verdict_streak_history REFRESH failed: %s", exc)
        raise
