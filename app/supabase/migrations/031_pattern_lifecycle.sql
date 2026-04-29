-- 031: Pattern lifecycle status + audit log
-- D7 file-first: patterns table is read-mirror of JSON files

ALTER TABLE patterns
  ADD COLUMN IF NOT EXISTS candidate_status TEXT
    NOT NULL DEFAULT 'object'
    CHECK (candidate_status IN ('draft', 'candidate', 'object', 'archived')),
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_patterns_candidate_status
  ON patterns (candidate_status)
  WHERE candidate_status IN ('draft', 'candidate');

-- Audit log
CREATE TABLE IF NOT EXISTS pattern_lifecycle_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL REFERENCES patterns(slug),
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  reason      TEXT,
  user_id     UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ple_slug ON pattern_lifecycle_events (slug);
CREATE INDEX IF NOT EXISTS idx_ple_created_at ON pattern_lifecycle_events (created_at DESC);
