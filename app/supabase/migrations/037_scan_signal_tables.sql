-- W-0367: scan_signal_events + scan_signal_outcomes
-- migration 번호: 037 (034=chart_notes, 035=pattern_signals, 036=autoresearch_runs)

CREATE TABLE IF NOT EXISTS scan_signal_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fired_at         TIMESTAMPTZ NOT NULL,
  symbol           TEXT NOT NULL,
  pattern          TEXT NOT NULL,
  direction        TEXT NOT NULL DEFAULT 'long',
  entry_price      DOUBLE PRECISION,
  tp_pct           DOUBLE PRECISION NOT NULL DEFAULT 0.60,
  sl_pct           DOUBLE PRECISION NOT NULL DEFAULT 0.30,
  component_scores JSONB NOT NULL DEFAULT '{}',
  schema_version   INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sse_symbol_fired ON scan_signal_events (symbol, fired_at DESC);
CREATE INDEX IF NOT EXISTS sse_pattern_fired ON scan_signal_events (pattern, fired_at DESC);
CREATE INDEX IF NOT EXISTS sse_fired_at ON scan_signal_events (fired_at DESC);
CREATE INDEX IF NOT EXISTS sse_component_scores_gin ON scan_signal_events USING gin (component_scores);

CREATE TABLE IF NOT EXISTS scan_signal_outcomes (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id              UUID NOT NULL REFERENCES scan_signal_events(id) ON DELETE CASCADE,
  horizon_h              INTEGER NOT NULL,
  outcome_at             TIMESTAMPTZ,
  realized_pnl_pct       DOUBLE PRECISION,
  peak_pnl_pct           DOUBLE PRECISION,
  triple_barrier_outcome TEXT CHECK (triple_barrier_outcome IN ('profit_take','stop_loss','timeout')),
  outcome_error          TEXT,
  resolved_at            TIMESTAMPTZ,
  UNIQUE (signal_id, horizon_h)
);

CREATE INDEX IF NOT EXISTS sso_signal_id ON scan_signal_outcomes (signal_id);
CREATE INDEX IF NOT EXISTS sso_unresolved ON scan_signal_outcomes (resolved_at) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS sso_horizon ON scan_signal_outcomes (horizon_h, resolved_at);

COMMENT ON TABLE scan_signal_events IS 'W-0367: per-signal component scores at fire time';
COMMENT ON TABLE scan_signal_outcomes IS 'W-0367: multi-horizon P&L outcomes per signal';
