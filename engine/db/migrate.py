"""Lightweight Supabase migration runner for the engine layer.

Applies SQL files from engine/db/migrations/*.sql in lexicographic order.
Tracks applied migrations in a `_engine_migrations` table in Supabase.
Safe to call at every startup — idempotent.

CLI:   python -m engine.db.migrate [--dry-run]
API:   from engine.db.migrate import run_pending
"""
from __future__ import annotations

import argparse
import logging
import os
import re
import sys
from pathlib import Path

log = logging.getLogger("engine.db.migrate")

MIGRATIONS_DIR = Path(__file__).parent / "migrations"

# Bootstrap DDL — runs before any tracked migration.
# Creates the tracking table if it doesn't exist.
_BOOTSTRAP_SQL = """
CREATE TABLE IF NOT EXISTS _engine_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def _sb():
    from supabase import create_client  # type: ignore
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def _is_valid_filename(name: str) -> bool:
    return bool(re.match(r"^\d{4}_[a-z0-9_]+\.sql$", name))


def list_migration_files() -> list[Path]:
    """Return all .sql files in MIGRATIONS_DIR sorted lexicographically."""
    if not MIGRATIONS_DIR.exists():
        return []
    files = sorted(
        f for f in MIGRATIONS_DIR.glob("*.sql")
        if _is_valid_filename(f.name)
    )
    return files


def list_applied() -> set[str]:
    """Return filenames of already-applied migrations."""
    try:
        result = _sb().table("_engine_migrations").select("filename").execute()
        return {row["filename"] for row in (result.data or [])}
    except Exception as exc:
        log.warning("Could not read _engine_migrations (may not exist yet): %s", exc)
        return set()


def run_pending(*, dry_run: bool = False) -> list[str]:
    """Apply all pending migrations. Returns list of applied filenames.

    Bootstraps the tracking table on first run.
    Skips already-applied migrations (idempotent).
    """
    client = _sb()

    # Bootstrap: ensure tracking table exists
    try:
        client.rpc("exec_sql", {"sql": _BOOTSTRAP_SQL}).execute()
    except Exception:
        # exec_sql RPC may not exist — fall through, table may already exist
        pass

    files = list_migration_files()
    if not files:
        log.info("No migration files found in %s", MIGRATIONS_DIR)
        return []

    applied = list_applied()
    pending = [f for f in files if f.name not in applied]

    if not pending:
        log.info("All %d migration(s) already applied", len(files))
        return []

    log.info("%d pending migration(s) to apply", len(pending))
    applied_names: list[str] = []

    for path in pending:
        sql = path.read_text(encoding="utf-8").strip()
        if not sql:
            log.warning("Skipping empty migration: %s", path.name)
            continue

        log.info("Applying %s ...", path.name)
        if dry_run:
            print(f"[dry-run] Would apply: {path.name}")
            continue

        try:
            # Supabase execute_sql via service role
            client.rpc("exec_sql", {"sql": sql}).execute()
        except Exception as exc:
            log.error("Failed to apply %s: %s", path.name, exc)
            raise

        # Record as applied
        client.table("_engine_migrations").upsert({"filename": path.name}).execute()
        applied_names.append(path.name)
        log.info("Applied %s", path.name)

    return applied_names


def status() -> dict[str, list[str]]:
    """Return dict with 'applied' and 'pending' migration filenames."""
    files = list_migration_files()
    applied = list_applied()
    return {
        "applied": [f.name for f in files if f.name in applied],
        "pending": [f.name for f in files if f.name not in applied],
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Engine DB migration runner")
    parser.add_argument("--dry-run", action="store_true", help="Print pending migrations without applying")
    parser.add_argument("--status", action="store_true", help="Show migration status and exit")
    args = parser.parse_args()

    if args.status:
        s = status()
        print(f"Applied ({len(s['applied'])}):", ", ".join(s["applied"]) or "none")
        print(f"Pending ({len(s['pending'])}):", ", ".join(s["pending"]) or "none")
        sys.exit(0)

    applied = run_pending(dry_run=args.dry_run)
    if applied:
        print(f"Applied {len(applied)} migration(s): {', '.join(applied)}")
    else:
        print("Nothing to apply.")
