-- W-0379: ensemble_rounds — Per-strategy performance tracking
-- Tracks each ensemble strategy's performance over cycles for battle UI

CREATE TYPE ensemble_round_outcome AS ENUM (
  'accepted',    -- Strategy's proposal passed all validation gates
  'rejected',    -- Failed one or more gates
  'timeout',     -- Strategy exceeded budget_seconds
  'error'        -- Runtime exception
);

CREATE TABLE IF NOT EXISTS ensemble_rounds (
  id                    uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              int                   NOT NULL,
  strategy_name         text                  NOT NULL,  -- "judge-arbitrate", "debate", etc.
  ensemble_group        text                  NOT NULL,  -- "A_parallel", "B_hierarchical", "C_iterative"

  -- Round execution
  outcome               ensemble_round_outcome NOT NULL,
  proposal_score        real,                 -- Quality score for comparison
  dsr_delta_predicted   real,                 -- LLM predicted DSR improvement
  dsr_delta_actual      real,                 -- Actual DSR from backtest (filled later)

  -- Cost and latency
  cost_usd              real,
  latency_sec           real,
  budget_seconds        int,

  -- Metadata
  error_message         text,                 -- If outcome = 'error'
  proposer_tracks       text[],               -- Which model tracks participated
  created_at            timestamptz           NOT NULL DEFAULT now(),

  -- Link to main ledger for correlation
  ledger_id             uuid REFERENCES autoresearch_ledger(id) ON DELETE CASCADE
);

-- Query patterns: strategy battle, cycle comparison, cost per strategy
CREATE INDEX idx_ensemble_rounds_cycle_strategy
  ON ensemble_rounds (cycle_id, strategy_name);

CREATE INDEX idx_ensemble_rounds_strategy_date
  ON ensemble_rounds (strategy_name, created_at DESC);

CREATE INDEX idx_ensemble_rounds_outcome
  ON ensemble_rounds (outcome, created_at DESC);

-- RLS: service role only (engine writes, app reads)
ALTER TABLE ensemble_rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON ensemble_rounds
  FOR ALL USING (auth.role() = 'service_role');
