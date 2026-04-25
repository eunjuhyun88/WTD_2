-- Migration 0001: agent_sessions — episodic memory store
--
-- 30-day rolling window for LLM agent conversation context.
-- Per DESIGN_V3.2 §8: separate from wiki/ledger, simple chronological,
-- hard-deleted after 30 days.
--
-- Used by: engine/agents/context.py (session context injection)

CREATE TABLE IF NOT EXISTS agent_sessions (
    id          BIGSERIAL PRIMARY KEY,
    session_id  TEXT        NOT NULL,
    role        TEXT        NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content     TEXT        NOT NULL,
    agent_type  TEXT,                        -- 'parser' | 'judge' | 'refinement'
    pattern_slug TEXT,                       -- scoped session (optional)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_lookup
    ON agent_sessions (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_sessions_pattern
    ON agent_sessions (pattern_slug, created_at DESC)
    WHERE pattern_slug IS NOT NULL;

-- Auto-cleanup policy: rows older than 30 days are expired.
-- Applied by a daily cron job calling:
--   DELETE FROM agent_sessions WHERE created_at < NOW() - INTERVAL '30 days';
COMMENT ON TABLE agent_sessions IS
    'Episodic LLM context store. 30-day hard delete. Never backfilled into wiki or ledger.';
