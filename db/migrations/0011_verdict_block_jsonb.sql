-- ═══════════════════════════════════════════════════════════════
-- 0011: Harness engine E4 — decision_trajectories v2 extension
--
-- Purely additive extension for the harness engine integration plan
-- (`docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md`
-- §3 E4). Adds columns that let agent/engine-side writers persist a
-- frozen `VerdictBlock` + envelope metadata without touching the
-- passport ML pipeline path.
--
-- Safety guarantees
--   * Does NOT drop any existing column.
--   * Does NOT backfill passport rows.
--   * Relaxes two NOT NULL constraints that are passport-envelope
--     specific (user_id, source_event_id). Passport writes still
--     populate both fields as before, so this relaxation is
--     backwards-compatible.
--   * New indexes are all partial and gated on `verdict_block
--     IS NOT NULL`, so they do not touch legacy passport rows.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- v2 agent/engine rows carry a frozen VerdictBlock plus a row-level
-- schema version so readers (E5 research spine DB source, downstream
-- ORPO consumers) can distinguish legacy passport rows from harness
-- engine v2 rows without having to guess from payload shape.
ALTER TABLE decision_trajectories
  ADD COLUMN IF NOT EXISTS verdict_block jsonb,
  ADD COLUMN IF NOT EXISTS schema_version text;

-- v2 writers are agent/engine initiated and do not flow through the
-- passport event outbox, so they do not carry a user_id or a source
-- event envelope. Relaxing NOT NULL lets v2 inserts leave those fields
-- NULL. The UNIQUE constraint on `source_event_id` remains intact —
-- PostgreSQL permits multiple NULLs under a UNIQUE constraint, so
-- this does not collide with the passport upsert path.
ALTER TABLE decision_trajectories ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE decision_trajectories ALTER COLUMN source_event_id DROP NOT NULL;

-- Partial index for the E5 research spine DB source. It filters on
-- the join of "has a verdict block" AND "outcome is filled in", which
-- is exactly the selection predicate `createDbDatasetSource` will use
-- to feed the RQ-B real-data experiment.
CREATE INDEX IF NOT EXISTS idx_decision_trajectories_v2_resolved
  ON decision_trajectories (created_at DESC)
  WHERE verdict_block IS NOT NULL AND outcome_features IS NOT NULL;

-- Lightweight partial index for "count / list all v2 rows" queries
-- that do not care about outcome resolution yet (dashboard, metrics).
CREATE INDEX IF NOT EXISTS idx_decision_trajectories_verdict_block_notnull
  ON decision_trajectories (created_at DESC)
  WHERE verdict_block IS NOT NULL;

COMMIT;
