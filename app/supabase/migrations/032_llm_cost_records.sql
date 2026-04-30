-- W-0316: LLM cost tracking per discovery cycle
-- Used by: CostTracker.flush_to_supabase()

CREATE TABLE IF NOT EXISTS llm_cost_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      TEXT NOT NULL,
  task          TEXT NOT NULL,       -- judge / summary / scan
  model         TEXT NOT NULL,
  input_tokens  INT  NOT NULL DEFAULT 0,
  output_tokens INT  NOT NULL DEFAULT 0,
  cost_usd      NUMERIC(10,6) NOT NULL DEFAULT 0,
  cumulative_usd NUMERIC(10,6) NOT NULL DEFAULT 0,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_cost_records_cycle ON llm_cost_records (cycle_id);
CREATE INDEX IF NOT EXISTS llm_cost_records_recorded ON llm_cost_records (recorded_at DESC);

COMMENT ON TABLE llm_cost_records IS
  'W-0316: per-LLM-call cost records. $0.50/cycle hard cap enforced in Python.';
