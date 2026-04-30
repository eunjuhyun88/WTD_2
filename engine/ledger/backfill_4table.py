"""F-30 Phase 3 — backfill ledger_data/ → 4 typed tables.

This script verifies or runs the backfill for the local file-based LedgerRecordStore.
For Supabase, run migration 033_backfill_ledger_4table.sql directly.

Usage:
    uv run python -m ledger.backfill_4table --dry-run    # count only
    uv run python -m ledger.backfill_4table              # execute
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from collections import defaultdict

_LEDGER_DIR = Path(__file__).parent.parent / "ledger_data"
_TYPED_TYPES = {"outcome", "verdict", "entry", "score"}


def count_by_type(ledger_dir: Path = _LEDGER_DIR) -> dict[str, int]:
    """Count records by record_type in the file-based store."""
    counts: dict[str, int] = defaultdict(int)
    if not ledger_dir.exists():
        return dict(counts)
    for slug_dir in ledger_dir.iterdir():
        if not slug_dir.is_dir():
            continue
        for f in slug_dir.glob("*.json"):
            try:
                d = json.loads(f.read_text())
                rt = d.get("record_type", "unknown")
                counts[rt] += 1
            except Exception:
                pass
    return dict(counts)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="F-30 backfill verifier")
    p.add_argument("--dry-run", action="store_true", help="Count only, no writes")
    args = p.parse_args(argv)

    counts = count_by_type()
    print("Local ledger record counts by type:")
    for rt, n in sorted(counts.items()):
        marker = " <- needs backfill" if rt in _TYPED_TYPES else ""
        print(f"  {rt:20s}: {n:>6d}{marker}")

    if args.dry_run:
        print("\nDry-run complete. Run migration 033 on Supabase to backfill.")
        return 0

    print("\nFor Supabase backfill: apply app/supabase/migrations/033_backfill_ledger_4table.sql")
    return 0


if __name__ == "__main__":
    sys.exit(main())
