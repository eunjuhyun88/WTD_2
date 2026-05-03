-- W-0395 Ph7 PR0: Agent persistence — equity snapshots + stats view
-- Builds on agent_interactions (migration 047).

-- Daily agent equity snapshots (scheduler or on-demand)
CREATE TABLE IF NOT EXISTS agent_equity_snapshots (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id             text        NOT NULL,  -- 'judge' | 'save' | 'scan' | 'similar' | 'explain'
  snapshot_date        date        NOT NULL,
  decision_count       int         NOT NULL DEFAULT 0,
  buy_count            int         NOT NULL DEFAULT 0,
  sell_count           int         NOT NULL DEFAULT 0,
  watch_count          int         NOT NULL DEFAULT 0,
  avg_latency_ms       numeric(8,1),
  cumulative_decisions int         NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_agent_equity_agent_date
  ON agent_equity_snapshots(agent_id, snapshot_date DESC);

-- Per-agent aggregated stats view
CREATE OR REPLACE VIEW v_agent_stats AS
SELECT
  cmd                                                                AS agent_id,
  COUNT(*)                                                           AS total_decisions,
  COUNT(*) FILTER (WHERE created_at > now() - interval '30 days')   AS decisions_30d,
  COUNT(*) FILTER (WHERE llm_verdict IS NOT NULL)                    AS verdicts_with_signal,
  ROUND(AVG(latency_ms)::numeric, 0)                                 AS avg_latency_ms,
  ROUND(
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY latency_ms)::numeric,
    0
  )                                                                  AS p95_latency_ms,
  MAX(created_at)                                                    AS last_decision_at,
  MIN(created_at)                                                    AS first_decision_at,
  COUNT(DISTINCT user_id)                                            AS unique_users
FROM agent_interactions
WHERE cmd IS NOT NULL
GROUP BY cmd;
