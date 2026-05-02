-- W-0378 Phase 1: AI Agent LLM interaction log
-- Stores every /explain, /scan, /similar call for P&L back-verification via llm_verdict.

CREATE TABLE IF NOT EXISTS agent_interactions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  cmd           text        NOT NULL CHECK (cmd IN ('explain', 'scan', 'similar', 'judge', 'save')),
  args_json     jsonb       NOT NULL DEFAULT '{}',
  llm_response  text,
  llm_verdict   text        CHECK (llm_verdict IN ('buy', 'sell', 'watch') OR llm_verdict IS NULL),
  latency_ms    int,
  provider_used text,
  error_detail  text,
  news_count    int         DEFAULT 0,
  has_risk_news boolean     DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_interactions_verdict ON agent_interactions (llm_verdict, created_at DESC);
CREATE INDEX idx_agent_interactions_user_at ON agent_interactions (user_id, created_at DESC);
