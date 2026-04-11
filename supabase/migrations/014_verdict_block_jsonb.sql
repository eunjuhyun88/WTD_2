-- ═══════════════════════════════════════════════════════════════
-- 014: Harness engine E4 — decision_trajectories v2 extension
--
-- Purely additive extension for the harness engine integration plan
-- (`docs/exec-plans/active/harness-engine-integration-plan-2026-04-11.md`
-- §3 E4). Adds columns that let agent/engine-side writers persist a
-- frozen `VerdictBlock` + envelope metadata without touching the
-- passport ML pipeline path.
--
-- Mirror of `db/migrations/0011_verdict_block_jsonb.sql`.
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

ALTER TABLE decision_trajectories
  ADD COLUMN IF NOT EXISTS verdict_block jsonb,
  ADD COLUMN IF NOT EXISTS schema_version text;

ALTER TABLE decision_trajectories ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE decision_trajectories ALTER COLUMN source_event_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_trajectories_v2_resolved
  ON decision_trajectories (created_at DESC)
  WHERE verdict_block IS NOT NULL AND outcome_features IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_decision_trajectories_verdict_block_notnull
  ON decision_trajectories (created_at DESC)
  WHERE verdict_block IS NOT NULL;

COMMIT;
