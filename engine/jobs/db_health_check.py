"""Daily DB health check — log full table scan counts (W-0402 PR4).

Called by APScheduler cron at 04:00 UTC via engine/api/main.py.
Logs Seq Scan count from pg_stat_user_tables. Target: 0 per day.
"""
from __future__ import annotations

import logging
import os

log = logging.getLogger("engine.jobs.db_health_check")


def run_db_health_check() -> None:
    """Query pg_stat_user_tables and log tables with Seq Scans."""
    from supabase import create_client

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        log.warning("SUPABASE creds missing — skipping DB health check")
        return

    sb = create_client(url, key)
    try:
        res = sb.rpc("get_seq_scan_stats", {}).execute()
        rows = res.data or []
        seq_scan_tables = [r for r in rows if r.get("seq_scan", 0) > 0]
        if seq_scan_tables:
            log.warning(
                "DB health: %d table(s) with Seq Scans: %s",
                len(seq_scan_tables),
                [r["relname"] for r in seq_scan_tables],
            )
        else:
            log.info("DB health: no Seq Scans detected")
    except Exception as exc:
        log.error("DB health check failed: %s", exc)
