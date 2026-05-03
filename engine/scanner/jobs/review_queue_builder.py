"""W-0383: Daily cron job — review queue builder.

Builds top-10 suspect blocked candidates per pattern into a review queue
cache. Suspects are blocked_candidates rows where forward_24h > +1%, sorted
by forward return descending (highest missed opportunity first).

Usage (from scheduler or CLI):
    python -m scanner.jobs.review_queue_builder

The job is intentionally lightweight — it logs results rather than persisting
to a separate table. If a dedicated `review_queue` table is created in a
future migration, this job will be the writer.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger("engine.scanner.jobs.review_queue_builder")

SUSPECTS_PER_PATTERN = 10
WINDOW_DAYS = 30


def _get_supabase_client() -> Any:
    """Return a Supabase client, or raise RuntimeError if unconfigured."""
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    from supabase import create_client  # type: ignore[import]
    return create_client(url, key)


def build_review_queue() -> dict[str, list[dict[str, Any]]]:
    """Query blocked_candidates and return top suspects per pattern.

    Returns:
        Mapping of pattern slug → list of suspect rows (up to SUSPECTS_PER_PATTERN).
        Pattern key is the `reason` field since `blocked_candidates` does not store
        a pattern slug directly; callers can group by reason as a proxy.

    If the blocked_candidates table does not exist, logs a warning and returns {}.
    """
    try:
        sb = _get_supabase_client()
    except RuntimeError as exc:
        log.warning("review_queue_builder: %s — skipping", exc)
        return {}

    try:
        res = (
            sb.table("blocked_candidates")
            .select("id,symbol,direction,reason,blocked_at,forward_24h")
            .not_.is_("forward_24h", "null")
            .gt("forward_24h", 1.0)
            .gte("blocked_at", f"now() - interval '{WINDOW_DAYS} days'")
            .order("forward_24h", desc=True)
            .limit(SUSPECTS_PER_PATTERN * 20)
            .execute()
        )
        rows: list[dict[str, Any]] = res.data or []
    except Exception as exc:
        log.warning("review_queue_builder: table query failed (%s) — table may not exist yet", exc)
        return {}

    # Group by reason (proxy for pattern) and take top SUSPECTS_PER_PATTERN each
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        reason = row.get("reason", "unknown")
        bucket = grouped.setdefault(reason, [])
        if len(bucket) < SUSPECTS_PER_PATTERN:
            bucket.append({
                "candidate_id": row["id"],
                "symbol": row["symbol"],
                "direction": row["direction"],
                "blocked_reason": reason,
                "blocked_at": row["blocked_at"],
                "cf_24h": row.get("forward_24h"),
            })

    if grouped:
        total = sum(len(v) for v in grouped.values())
        log.info(
            "review_queue_builder: built %d suspect(s) across %d reason bucket(s) "
            "(window=%dd)",
            total,
            len(grouped),
            WINDOW_DAYS,
        )
    else:
        log.info("review_queue_builder: no suspects found in %d-day window", WINDOW_DAYS)

    return grouped


def run() -> None:
    """Entry point for the daily cron scheduler."""
    started_at = datetime.now(tz=timezone.utc).isoformat()
    log.info("review_queue_builder: starting (started_at=%s)", started_at)
    queue = build_review_queue()
    log.info(
        "review_queue_builder: complete — %d reason bucket(s)",
        len(queue),
    )


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run()
