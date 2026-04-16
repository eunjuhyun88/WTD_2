-- ═══════════════════════════════════════════════════════════════
-- Terminal persistence-first rollout
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS terminal_watchlist (
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_terminal_watchlist_user_sort
  ON terminal_watchlist(user_id, sort_order, updated_at DESC);

CREATE TABLE IF NOT EXISTS terminal_pins (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  pin_type TEXT NOT NULL,
  symbol TEXT,
  timeframe TEXT NOT NULL,
  label TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_pins_user_type
  ON terminal_pins(user_id, pin_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS terminal_alert_rules (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  kind TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  source_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT terminal_alert_rules_unique UNIQUE (user_id, symbol, timeframe, kind)
);

CREATE INDEX IF NOT EXISTS idx_terminal_alert_rules_user_updated
  ON terminal_alert_rules(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS terminal_export_jobs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  export_type TEXT NOT NULL,
  status TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  title TEXT,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_terminal_export_jobs_user_status
  ON terminal_export_jobs(user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS terminal_pattern_captures (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  context_kind TEXT NOT NULL,
  trigger_origin TEXT NOT NULL,
  pattern_slug TEXT,
  reason TEXT,
  note TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash TEXT,
  source_freshness JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terminal_pattern_captures_user_recent
  ON terminal_pattern_captures(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_terminal_pattern_captures_query
  ON terminal_pattern_captures(user_id, symbol, timeframe, trigger_origin, updated_at DESC);
