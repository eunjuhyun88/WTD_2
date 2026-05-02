-- W-0387: judge + save indexes
-- No ALTER TABLE — evidence_hash, reason columns already exist in 004_terminal_persistence.sql

CREATE INDEX IF NOT EXISTS idx_terminal_pattern_captures_dedup
  ON terminal_pattern_captures(user_id, symbol, timeframe, evidence_hash);

CREATE INDEX IF NOT EXISTS idx_terminal_pattern_captures_origin
  ON terminal_pattern_captures(user_id, trigger_origin, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_interactions_cmd_at
  ON agent_interactions(cmd, created_at DESC);
