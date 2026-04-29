# W-0215 — Ledger Durability (Supabase Cutover)

## Goal

Eliminate the silent JSON-fallback failure mode that lets Cloud Run restarts
destroy judgment ledger data. After this work, the engine writes to Supabase
in production with no silent JSON path, and pre-Supabase JSON history is
migrated into Postgres.

Charter mapping: L6 ⚠️ — JSON files survive only the lifetime of a Cloud Run
container; losing them breaks moat #1 (user judgment ledger is uncopyable).

## Owner

engine

## Primary Change Type

Engine logic + ops script.

## Scope

Two PRs, merged in order:

### PR-1 (this branch) — Backfill script

- `engine/scripts/backfill_ledger_records.py` — new, idempotent
  - `--dry-run` (default) reports counts without touching Supabase
  - `--apply` upserts via `pattern_outcomes` and `pattern_ledger_records`
  - `--outcomes` / `--records` / `--both` (default) selects planes
  - Per-file errors are logged and counted; the run keeps going
  - Re-running is safe — Supabase upsert keys on the JSON `id` PK
- `engine/tests/test_backfill_ledger_records.py` — covers dry-run, apply,
  idempotent re-run, parse-error and upsert-error paths, and CLI

### PR-2 (separate branch) — Production fail-fast

- `engine/ledger/store.py::get_ledger_store()` and `get_ledger_record_store()`
  raise when running in production (`K_SERVICE` set by Cloud Run, or
  `ENGINE_RUNTIME_ROLE in {"api","worker"}` per W-0126 deploy decisions) but
  Supabase env is missing.
- Local dev keeps the silent file fallback.
- Tests assert the new fail-fast path and that local dev still gets
  `FileLedgerStore` / `LedgerRecordStore`.

## Non-Goals

- Removing `FileLedgerStore` / `LedgerRecordStore` (still the local dev path)
- Schema changes — `pattern_outcomes` and `pattern_ledger_records` migrations
  already shipped under W-0126
- Hot-path consumer changes — already done in W-0126
- Backfill automation in CI — the script is intentionally an ops tool

## Canonical Files

- `engine/scripts/backfill_ledger_records.py`
- `engine/tests/test_backfill_ledger_records.py`
- `engine/ledger/store.py` (PR-2 only)

## Facts

1. `pattern_outcomes` and `pattern_ledger_records` Supabase tables and
   indexes are live (W-0126 migration 018, verified).
2. `get_ledger_store()` and `get_ledger_record_store()` already auto-route to
   Supabase whenever `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set —
   the failure mode is *missing env in prod*, not wrong routing.
3. Both Supabase stores upsert by primary key `id`, so re-running the
   backfill is naturally idempotent.
4. Cloud Run sets `K_SERVICE` automatically on every deployed revision; we do
   not have to add a new flag for the prod marker.

## Decisions

- Backfill script ships before fail-fast so ops can rebuild Supabase from any
  surviving JSON snapshot before the silent-fallback path is removed.
- The script reuses `FileLedgerStore.load()` and `LedgerRecordStore.load()`
  rather than reading JSON directly — keeps deserialization in one place.
- The script does not check Supabase for "already exists" before upserting;
  upsert by PK gives the same result with one fewer roundtrip per row.
- Dry-run does not import the `supabase` package — keeps the report mode
  runnable in a local venv with no creds.

## Verification

- `python -m pytest tests/test_backfill_ledger_records.py -q` — 9 tests pass.
- `python -m pytest tests/test_ledger_store.py tests/test_ledger_dataset.py
  tests/test_backfill_ledger_records.py -q` — 36 tests pass.
- `python scripts/backfill_ledger_records.py --dry-run` — prints per-plane
  counts without contacting Supabase.

## Exit Criteria

- [x] Backfill script runs `--dry-run` against the engine ledger directories
  with no errors
- [x] Tests cover both planes, dry-run, apply, idempotent rerun, parse error,
  upsert error, and CLI surface
- [ ] PR-1 reviewed and merged
- [ ] Ops dry-run + apply executed against production Supabase
- [ ] PR-2 (fail-fast) opens after PR-1 merges, with tests covering both the
  Cloud Run prod marker and the local dev fallback
