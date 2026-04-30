-- W-0348: pattern_objects — 52 PatternObjects as first-class DB rows
-- Seeded by: python -m engine.patterns.seed
-- Used by: GET /api/patterns, verdict join, outcome aggregate

CREATE TABLE IF NOT EXISTS pattern_objects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  direction     TEXT NOT NULL DEFAULT 'long' CHECK (direction IN ('long', 'short')),
  timeframe     TEXT NOT NULL DEFAULT '1h',
  version       INT  NOT NULL DEFAULT 1,
  entry_phase   TEXT NOT NULL DEFAULT '',
  target_phase  TEXT NOT NULL DEFAULT '',
  phase_ids     TEXT[] NOT NULL DEFAULT '{}',
  tags          TEXT[] NOT NULL DEFAULT '{}',
  phases_json   JSONB NOT NULL DEFAULT '[]',
  labels        JSONB NOT NULL DEFAULT '[]',
  outcome       JSONB,
  universe_scope TEXT NOT NULL DEFAULT 'binance_dynamic',
  created_by    TEXT NOT NULL DEFAULT 'system',
  seeded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast slug lookup
CREATE INDEX IF NOT EXISTS pattern_objects_slug_idx ON pattern_objects (slug);

-- Phase filter: WHERE 'FAKE_DUMP' = ANY(phase_ids)
CREATE INDEX IF NOT EXISTS pattern_objects_phase_ids_gin ON pattern_objects USING GIN (phase_ids);

-- Tag filter
CREATE INDEX IF NOT EXISTS pattern_objects_tags_gin ON pattern_objects USING GIN (tags);

-- updated_at auto-bump
CREATE OR REPLACE FUNCTION pattern_objects_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS pattern_objects_updated_at ON pattern_objects;
CREATE TRIGGER pattern_objects_updated_at
  BEFORE UPDATE ON pattern_objects
  FOR EACH ROW EXECUTE FUNCTION pattern_objects_set_updated_at();

-- RLS: reads public (Jin sees all patterns), writes service-role only
ALTER TABLE pattern_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pattern_objects_select ON pattern_objects;
CREATE POLICY pattern_objects_select ON pattern_objects
  FOR SELECT USING (true);

COMMENT ON TABLE pattern_objects IS
  'W-0348: 52 PatternObjects seeded from engine/patterns/library.py. Phase 2 of W-0340.';
