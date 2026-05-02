"""W-0368: CLI for replaying dead-letter queue entries.

Usage:
    uv run python -m research.dlq_replay [--limit N] [--dry-run] [--pattern-slug SLUG]
"""
from __future__ import annotations

import argparse
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
log = logging.getLogger("research.dlq_replay")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Replay scan_signal_events_dlq entries back into scan_signal_events"
    )
    parser.add_argument("--limit", type=int, default=200, help="Max rows to process")
    parser.add_argument("--dry-run", action="store_true", help="List rows without writing")
    parser.add_argument("--pattern-slug", type=str, default=None, help="Filter by pattern name")
    args = parser.parse_args(argv)

    from research.signal_event_store import fetch_dlq_pending, mark_dlq_replayed
    import os
    from supabase import create_client

    rows = fetch_dlq_pending(limit=args.limit)

    if args.pattern_slug:
        rows = [r for r in rows if (r.get("original_data") or {}).get("pattern") == args.pattern_slug]

    if not rows:
        log.info("No pending DLQ rows (limit=%d, pattern_slug=%s)", args.limit, args.pattern_slug)
        return 0

    log.info("Found %d DLQ rows to process (dry_run=%s)", len(rows), args.dry_run)

    if args.dry_run:
        for row in rows:
            data = row.get("original_data") or {}
            log.info(
                "[DRY-RUN] id=%s symbol=%s pattern=%s error=%s",
                row["id"], data.get("symbol"), data.get("pattern"), row.get("error_msg"),
            )
        return 0

    sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    replayed = errors = 0
    for row in rows:
        data = row.get("original_data") or {}
        try:
            sb.table("scan_signal_events").insert(data).execute()
            mark_dlq_replayed(row["id"])
            replayed += 1
            log.info("Replayed id=%s symbol=%s", row["id"], data.get("symbol"))
        except Exception as e:
            errors += 1
            log.error("Replay failed id=%s: %s", row["id"], e)

    log.info("Done: replayed=%d errors=%d", replayed, errors)
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
