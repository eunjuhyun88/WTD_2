#!/usr/bin/env python3
"""Backfill JSON ledger files into Supabase.

W-0215 — Ledger durability (P0). Migrates pre-Supabase JSON history into the
canonical Postgres tables so Cloud Run restarts no longer cause judgment ledger
loss.

Sources:
- engine/ledger_data/{slug}/*.json    -> pattern_outcomes
- engine/ledger_records/{slug}/*.json -> pattern_ledger_records

Usage (run from engine/ with venv activated):

    python scripts/backfill_ledger_records.py --dry-run            # report only
    python scripts/backfill_ledger_records.py --apply              # both planes
    python scripts/backfill_ledger_records.py --apply --outcomes   # outcomes only
    python scripts/backfill_ledger_records.py --apply --records    # records only

Idempotency: relies on Supabase upsert by primary key `id`. Re-running the
script over the same JSON files updates rows in place.

Failures on individual files are logged and counted, but do not abort the run.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterator

SCRIPT_DIR = Path(__file__).resolve().parent
ENGINE_DIR = SCRIPT_DIR.parent

# Ensure `engine/` is on sys.path so we can `from ledger.* import ...` when
# invoked as `python scripts/backfill_ledger_records.py`.
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from ledger.store import (  # noqa: E402  (sys.path adjusted above)
    LEDGER_DIR,
    LEDGER_RECORDS_DIR,
    FileLedgerStore,
    LedgerRecordStore,
)
from ledger.types import PatternLedgerRecord, PatternOutcome  # noqa: E402

log = logging.getLogger("engine.scripts.backfill_ledger")


@dataclass
class PlaneResult:
    plane: str            # "outcomes" | "records"
    scanned: int = 0
    parsed: int = 0
    upserted: int = 0
    parse_errors: int = 0
    upsert_errors: int = 0
    slugs: int = 0

    def render(self, *, dry_run: bool) -> str:
        verb = "would upsert" if dry_run else "upserted"
        return (
            f"[{self.plane}] slugs={self.slugs} scanned={self.scanned} "
            f"parsed={self.parsed} {verb}={self.upserted} "
            f"parse_errors={self.parse_errors} upsert_errors={self.upsert_errors}"
        )


def _iter_pattern_dirs(base: Path) -> Iterator[Path]:
    if not base.exists():
        return
    for child in sorted(base.iterdir()):
        if child.is_dir():
            yield child


def _backfill_outcomes(
    *,
    source_dir: Path,
    dry_run: bool,
    upsert: Callable[[dict], None],
) -> PlaneResult:
    """Read PatternOutcome JSON files via FileLedgerStore.load() and upsert."""
    result = PlaneResult(plane="outcomes")
    file_store = FileLedgerStore(base_dir=source_dir)

    for slug_dir in _iter_pattern_dirs(source_dir):
        result.slugs += 1
        slug = slug_dir.name
        for path in sorted(slug_dir.glob("*.json")):
            result.scanned += 1
            try:
                outcome: PatternOutcome | None = file_store.load(slug, path.stem)
            except Exception as exc:  # noqa: BLE001
                result.parse_errors += 1
                log.warning("parse fail outcomes/%s/%s: %s", slug, path.name, exc)
                continue
            if outcome is None:
                result.parse_errors += 1
                continue
            result.parsed += 1

            if dry_run:
                result.upserted += 1
                continue

            try:
                upsert(outcome.to_dict())
                result.upserted += 1
            except Exception as exc:  # noqa: BLE001
                result.upsert_errors += 1
                log.warning("upsert fail outcomes/%s/%s: %s", slug, path.name, exc)
    return result


def _backfill_records(
    *,
    source_dir: Path,
    dry_run: bool,
    upsert: Callable[[dict], None],
) -> PlaneResult:
    """Read PatternLedgerRecord JSON files via LedgerRecordStore.load() and upsert."""
    result = PlaneResult(plane="records")
    file_store = LedgerRecordStore(base_dir=source_dir)

    for slug_dir in _iter_pattern_dirs(source_dir):
        result.slugs += 1
        slug = slug_dir.name
        for path in sorted(slug_dir.glob("*.json")):
            result.scanned += 1
            try:
                record: PatternLedgerRecord | None = file_store.load(slug, path.stem)
            except Exception as exc:  # noqa: BLE001
                result.parse_errors += 1
                log.warning("parse fail records/%s/%s: %s", slug, path.name, exc)
                continue
            if record is None:
                result.parse_errors += 1
                continue
            result.parsed += 1

            if dry_run:
                result.upserted += 1
                continue

            try:
                upsert(record.to_dict())
                result.upserted += 1
            except Exception as exc:  # noqa: BLE001
                result.upsert_errors += 1
                log.warning("upsert fail records/%s/%s: %s", slug, path.name, exc)
    return result


def _make_supabase_upserters() -> tuple[Callable[[dict], None], Callable[[dict], None]]:
    """Return (outcomes_upsert, records_upsert) bound to a real Supabase client.

    Imported lazily so dry-run mode does not require Supabase credentials.
    """
    from supabase import create_client  # type: ignore

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise SystemExit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --apply"
        )
    client = create_client(url, key)

    def outcomes(row: dict) -> None:
        client.table("pattern_outcomes").upsert(row).execute()

    def records(row: dict) -> None:
        client.table("pattern_ledger_records").upsert(row).execute()

    return outcomes, records


def _noop_upsert(_: dict) -> None:
    """Sentinel for dry-run paths that never reach the Supabase client."""
    raise AssertionError("upsert called during dry-run — guard above is wrong")


def run(
    *,
    dry_run: bool,
    do_outcomes: bool,
    do_records: bool,
    outcomes_dir: Path,
    records_dir: Path,
    outcomes_upsert: Callable[[dict], None] | None = None,
    records_upsert: Callable[[dict], None] | None = None,
) -> tuple[PlaneResult | None, PlaneResult | None]:
    """Programmatic entrypoint — also used by tests with injected upserters."""
    if dry_run:
        outcomes_upsert = _noop_upsert
        records_upsert = _noop_upsert
    else:
        if outcomes_upsert is None or records_upsert is None:
            real_outcomes, real_records = _make_supabase_upserters()
            outcomes_upsert = outcomes_upsert or real_outcomes
            records_upsert = records_upsert or real_records

    outcomes_result: PlaneResult | None = None
    records_result: PlaneResult | None = None

    if do_outcomes:
        outcomes_result = _backfill_outcomes(
            source_dir=outcomes_dir,
            dry_run=dry_run,
            upsert=outcomes_upsert,
        )
    if do_records:
        records_result = _backfill_records(
            source_dir=records_dir,
            dry_run=dry_run,
            upsert=records_upsert,
        )

    return outcomes_result, records_result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Report only (default)")
    mode.add_argument("--apply", action="store_true", help="Upsert into Supabase")

    plane = parser.add_mutually_exclusive_group()
    plane.add_argument("--outcomes", action="store_true", help="Outcomes plane only")
    plane.add_argument("--records", action="store_true", help="Records plane only")
    plane.add_argument("--both", action="store_true", help="Both planes (default)")

    parser.add_argument(
        "--outcomes-dir",
        default=str(LEDGER_DIR),
        help=f"Source dir for PatternOutcome JSON (default: {LEDGER_DIR})",
    )
    parser.add_argument(
        "--records-dir",
        default=str(LEDGER_RECORDS_DIR),
        help=f"Source dir for PatternLedgerRecord JSON (default: {LEDGER_RECORDS_DIR})",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="Logging level (DEBUG/INFO/WARNING)",
    )

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=getattr(logging, args.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    # Default mode = dry-run unless --apply is set.
    dry_run = not args.apply

    # Default plane = both unless --outcomes or --records is set.
    do_outcomes = args.outcomes or args.both or not (args.outcomes or args.records)
    do_records = args.records or args.both or not (args.outcomes or args.records)

    print(
        f"backfill_ledger: mode={'dry-run' if dry_run else 'apply'} "
        f"outcomes={do_outcomes} records={do_records}"
    )

    outcomes_result, records_result = run(
        dry_run=dry_run,
        do_outcomes=do_outcomes,
        do_records=do_records,
        outcomes_dir=Path(args.outcomes_dir),
        records_dir=Path(args.records_dir),
    )

    if outcomes_result:
        print(outcomes_result.render(dry_run=dry_run))
    if records_result:
        print(records_result.render(dry_run=dry_run))

    # Non-zero exit if any plane had upsert errors during --apply.
    if not dry_run:
        for r in (outcomes_result, records_result):
            if r and r.upsert_errors > 0:
                return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
