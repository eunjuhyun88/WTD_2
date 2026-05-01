-- W-0379: autoresearch_ledger — Cycle results and statistical validation
-- Accumulates all autoresearch cycle results for UI analytics

CREATE TYPE autoresearch_status AS ENUM (
  'committed',   -- Rule change passed all 6 layers and committed to git
  'rejected',    -- Failed one or more validation gates
  'error'        -- Runtime exception (timeout, API failure, etc.)
);

CREATE TABLE IF NOT EXISTS autoresearch_ledger (
  id                    uuid              PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id              int               NOT NULL UNIQUE,
  cycle_date            timestamptz       NOT NULL DEFAULT now(),
  status                autoresearch_status NOT NULL,
  strategy              text              NOT NULL,  -- ensemble strategy name

  -- Proposal stats
  candidates_proposed   int,
  candidates_after_l2   int,
  best_proposal_ratio   text,             -- proposer_track that won

  -- Validation gates
  rejected_reason       text,             -- "all-gates-rejected", "dsr-delta-too-small", etc.
  dsr_delta             real,             -- Expected DSR improvement from best proposal

  -- Execution metrics
  latency_sec           real,             -- Total cycle execution time
  cost_usd              real,             -- API call costs (LLM tokens)
  budget_seconds        int,              -- Budget allocated for this cycle

  -- Git integration
  commit_sha            text,             -- Git commit SHA if committed
  rules_snapshot_json   jsonb,            -- active.yaml state at commit time

  -- Metadata
  sandbox_mode          boolean DEFAULT false,
  created_at            timestamptz       NOT NULL DEFAULT now()
);

-- Query patterns: cycle timeline, status distribution, cost trend
CREATE INDEX idx_autoresearch_ledger_cycle_date
  ON autoresearch_ledger (cycle_date DESC);

CREATE INDEX idx_autoresearch_ledger_status
  ON autoresearch_ledger (status, cycle_date DESC);

CREATE INDEX idx_autoresearch_ledger_strategy
  ON autoresearch_ledger (strategy, cycle_date DESC);

-- RLS: service role only (engine writes, app reads)
ALTER TABLE autoresearch_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON autoresearch_ledger
  FOR ALL USING (auth.role() = 'service_role');
