-- ═══════════════════════════════════════════════════════════════
-- Migration 0007: Cogochi Agent Memory System
-- L0/L1/L2 hierarchical memory for battle agents
-- Design: Cogochi_MemorySystemDesign_20260322.md
-- ═══════════════════════════════════════════════════════════════

-- Agent memories: battle lessons, doctrine cards, playbooks
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID REFERENCES app_users(id),

  -- Memory classification
  kind TEXT NOT NULL CHECK (kind IN (
    'SUCCESS_CASE', 'FAILURE_CASE', 'PLAYBOOK',
    'MATCH_SUMMARY', 'USER_NOTE', 'DOCTRINE'
  )),

  -- Context tags (for L2 filtered search)
  scenario_id TEXT,
  symbol TEXT DEFAULT 'BTCUSDT',
  regime TEXT,                      -- bull | bear | sideways | extreme_vol
  primary_zone TEXT,                -- ACCUMULATION | DISTRIBUTION | etc.
  action TEXT,                      -- LONG | SHORT | FLAT
  outcome TEXT,                     -- WIN | LOSS | NEUTRAL

  -- Content
  title TEXT NOT NULL,              -- max ~30 chars
  lesson TEXT NOT NULL,             -- max ~50 chars
  detail TEXT,                      -- max ~500 chars

  -- Scoring & retrieval metadata
  importance NUMERIC DEFAULT 0.5,   -- 0.0 ~ 1.0
  success_score NUMERIC DEFAULT 0,  -- -1.0 (LOSS) to +1.0 (WIN)
  retrieval_count INTEGER DEFAULT 0,
  compaction_level INTEGER DEFAULT 0,  -- 0=raw, 1=compacted, 2=highly_compacted
  is_doctrine_card BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for L1 (recent by agent) and L2 (filtered search)
CREATE INDEX IF NOT EXISTS idx_memories_agent ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_user_agent ON agent_memories(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON agent_memories(kind);
CREATE INDEX IF NOT EXISTS idx_memories_regime ON agent_memories(regime);
CREATE INDEX IF NOT EXISTS idx_memories_zone ON agent_memories(primary_zone);
CREATE INDEX IF NOT EXISTS idx_memories_created ON agent_memories(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memories_doctrine ON agent_memories(agent_id) WHERE is_doctrine_card = true;
CREATE INDEX IF NOT EXISTS idx_memories_importance ON agent_memories(agent_id, importance DESC);

-- ORPO v2 training pairs (from battle REFLECT state)
CREATE TABLE IF NOT EXISTS orpo_v2_pairs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID REFERENCES app_users(id),
  scenario_id TEXT,
  tick INTEGER,
  context_prompt TEXT NOT NULL,
  chosen_response JSONB NOT NULL,
  rejected_response JSONB NOT NULL,
  quality_weight NUMERIC NOT NULL,  -- 0.5 ~ 0.95
  trainer_label TEXT,               -- APPROVED | OVERRIDDEN | null
  battle_outcome TEXT,              -- WIN | LOSS
  used_in_training BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orpo_v2_agent ON orpo_v2_pairs(agent_id);
CREATE INDEX IF NOT EXISTS idx_orpo_v2_user ON orpo_v2_pairs(user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_orpo_v2_unused ON orpo_v2_pairs(agent_id) WHERE used_in_training = false;

-- Agent model versions (v0 → v1 → v2 progression)
CREATE TABLE IF NOT EXISTS agent_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID REFERENCES app_users(id),
  version INTEGER NOT NULL DEFAULT 0,
  base_model TEXT DEFAULT 'qwen3:1.7b',
  prompt_fingerprint TEXT,
  training_pair_count INTEGER DEFAULT 0,
  benchmark_score NUMERIC,
  benchmark_detail JSONB,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'rejected')),
  promoted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_versions_agent ON agent_versions(agent_id, version);
CREATE INDEX IF NOT EXISTS idx_versions_active ON agent_versions(agent_id) WHERE status = 'active';
