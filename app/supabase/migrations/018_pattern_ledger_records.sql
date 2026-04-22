-- W-0126: Pattern ledger records — append-only event log for the pattern core loop.
-- Replaces engine/ledger_records/{slug}/*.json file store in production.
--
-- Performance rationale:
--   FileLedgerRecordStore.compute_family_stats() scans all *.json per slug → O(N files).
--   This table + plr_slug_type_created_idx enables O(1) GROUP BY aggregate per slug.
--   Multi-instance GCP deployments share state instead of each maintaining a local file cache.

CREATE TABLE IF NOT EXISTS pattern_ledger_records (
    id            TEXT        PRIMARY KEY,
    record_type   TEXT        NOT NULL,
    pattern_slug  TEXT        NOT NULL,
    symbol        TEXT,
    user_id       TEXT,
    outcome_id    TEXT,
    capture_id    TEXT,
    transition_id TEXT,
    scan_id       TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payload       JSONB       NOT NULL DEFAULT '{}'
);

-- Primary access pattern: all records for a slug, optionally filtered by type,
-- ordered newest-first.
CREATE INDEX IF NOT EXISTS plr_slug_type_created_idx
    ON pattern_ledger_records (pattern_slug, record_type, created_at DESC);

-- Secondary: full-slug scan ordered by created_at (used by list() with no type filter).
CREATE INDEX IF NOT EXISTS plr_slug_created_idx
    ON pattern_ledger_records (pattern_slug, created_at DESC);

-- RLS: engine service role only. Service key bypasses RLS; no explicit policy needed.
ALTER TABLE pattern_ledger_records ENABLE ROW LEVEL SECURITY;
