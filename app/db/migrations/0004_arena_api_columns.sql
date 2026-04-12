-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — Arena API Column Additions (B-01)
-- Adds columns used by arenaService.ts
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- arenaService uses 'phase' but schema has 'status'
-- Add phase as alias column, keep status for backward compat
ALTER TABLE arena_matches
  ADD COLUMN IF NOT EXISTS phase match_phase_enum;

-- Sync phase from status for existing rows
UPDATE arena_matches SET phase = status WHERE phase IS NULL;

-- analysis_results: full agent output JSON (arenaService stores here)
ALTER TABLE arena_matches
  ADD COLUMN IF NOT EXISTS analysis_results jsonb DEFAULT '[]';

-- result: full MatchResult JSON (winnerId, scores, agentBreakdown)
ALTER TABLE arena_matches
  ADD COLUMN IF NOT EXISTS result jsonb;

-- Create a view that maps both column names for convenience
CREATE OR REPLACE VIEW arena_matches_v AS
  SELECT *,
    COALESCE(phase, status) AS current_phase
  FROM arena_matches;

COMMIT;
