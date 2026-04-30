"""W-0350: Seed 52 PatternObjects from PATTERN_LIBRARY into Supabase.

Usage:
    python -m patterns.seed              # upsert all
    python -m patterns.seed --dry-run   # print rows, no DB write
    python -m patterns.seed --count     # just print DB count
"""
from __future__ import annotations

import argparse
import logging
import sys

log = logging.getLogger(__name__)


def seed(dry_run: bool = False) -> tuple[int, int]:
    """Upsert all patterns. Returns (success_count, skip_count)."""
    from patterns.library import PATTERN_LIBRARY
    from patterns.store import PatternStore

    store = PatternStore()
    success, skipped = 0, 0
    seen_slugs: set[str] = set()

    for slug, pattern in PATTERN_LIBRARY.items():
        if slug in seen_slugs:
            log.warning("duplicate slug %r — skipping", slug)
            skipped += 1
            continue
        seen_slugs.add(slug)

        if dry_run:
            log.info("DRY slug=%s phases=%s tags=%s",
                     slug, [ph.phase_id for ph in pattern.phases], pattern.tags)
            success += 1
            continue

        try:
            store.upsert(pattern)
            success += 1
            log.debug("upserted %s", slug)
        except Exception as exc:
            log.error("failed to upsert %s: %s", slug, exc)
            skipped += 1

    return success, skipped


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description="Seed PatternObjects into Supabase")
    parser.add_argument("--dry-run", action="store_true", help="Print rows, no DB write")
    parser.add_argument("--count", action="store_true", help="Print current DB count and exit")
    args = parser.parse_args()

    if args.count:
        from patterns.store import PatternStore
        n = PatternStore().count()
        print(f"pattern_objects rows: {n}")
        return

    log.info("Starting PatternObject seed (dry_run=%s)", args.dry_run)
    success, skipped = seed(dry_run=args.dry_run)
    log.info("Done — success=%d skipped=%d", success, skipped)

    if skipped > 2:
        log.warning("Too many skipped (%d) — check errors above", skipped)
        sys.exit(1)


if __name__ == "__main__":
    main()
