-- W-0361: autoresearch_runs — one row per scheduled research cycle
-- Used by: autoresearch_runner.py, GET /research/runs/{run_id}

CREATE TABLE IF NOT EXISTS autoresearch_runs (
  run_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'running'
               CHECK (status IN ('running', 'completed', 'failed', 'skipped')),
  n_symbols    INTEGER NOT NULL DEFAULT 0,
  n_patterns   INTEGER NOT NULL DEFAULT 0,
  n_promoted   INTEGER NOT NULL DEFAULT 0,
  elapsed_s    DOUBLE PRECISION,
  error_msg    TEXT,
  meta         JSONB
);

CREATE INDEX IF NOT EXISTS autoresearch_runs_started_at
  ON autoresearch_runs (started_at DESC);

COMMENT ON TABLE autoresearch_runs IS
  'W-0361: one row per autoresearch 4h cycle. Used for run history + dedup guard.';
