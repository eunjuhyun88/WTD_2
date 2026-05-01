-- W-0382: blocked_candidates — NEUTRAL signals with filter reason taxonomy
-- Enables counterfactual analysis: why was this signal discarded?

CREATE TYPE filter_reason AS ENUM (
  'below_min_conviction',
  'timing_conflict',
  'regime_mismatch',
  'heat_too_high',
  'insufficient_liquidity',
  'spread_too_wide',
  'duplicate_signal',
  'conflicting_signals',
  'stale_context'
);

CREATE TABLE IF NOT EXISTS blocked_candidates (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol          text          NOT NULL,
  timeframe       text          NOT NULL DEFAULT '1h',
  direction       text          NOT NULL,         -- 'long' | 'short' | 'neutral'
  reason          filter_reason NOT NULL,
  score           real,                            -- ensemble_score at block time
  p_win           real,                            -- model p_win before blocks
  blocked_at      timestamptz   NOT NULL DEFAULT now(),
  forward_1h      real,                            -- NULL until outcome fill
  forward_4h      real,
  forward_24h     real,
  forward_72h     real
);

-- Query patterns: symbol + time range, reason distribution, outcome fill
CREATE INDEX idx_blocked_candidates_symbol_time
  ON blocked_candidates (symbol, blocked_at DESC);

CREATE INDEX idx_blocked_candidates_reason
  ON blocked_candidates (reason, blocked_at DESC);

-- RLS: service role only (engine writes, app reads via service key)
ALTER TABLE blocked_candidates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON blocked_candidates
  FOR ALL USING (auth.role() = 'service_role');
