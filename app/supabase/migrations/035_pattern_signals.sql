-- W-0361: pattern_signals — promoted patterns from autoresearch cycles
-- Used by: GET /research/signals/{symbol}
-- Upsert key: (symbol, pattern, timeframe, run_bucket) — one row per 4h bucket

CREATE TABLE IF NOT EXISTS pattern_signals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID REFERENCES autoresearch_runs(run_id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  pattern      TEXT NOT NULL,
  timeframe    TEXT NOT NULL DEFAULT '1h',
  run_bucket   TIMESTAMPTZ NOT NULL,   -- truncated to 4h bucket
  sharpe       DOUBLE PRECISION,
  hit_rate     DOUBLE PRECISION,
  n_trades     INTEGER,
  expectancy   DOUBLE PRECISION,
  max_dd       DOUBLE PRECISION,
  promoted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,   -- promoted_at + 7d
  signal_json  JSONB,
  UNIQUE (symbol, pattern, timeframe, run_bucket)
);

CREATE INDEX IF NOT EXISTS pattern_signals_symbol_expires
  ON pattern_signals (symbol, expires_at DESC);

CREATE INDEX IF NOT EXISTS pattern_signals_expires
  ON pattern_signals (expires_at);

COMMENT ON TABLE pattern_signals IS
  'W-0361: promoted patterns from autoresearch. expires_at = promoted_at + 7d.';
