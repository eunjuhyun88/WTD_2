-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — V3 Bootstrap (idempotent, single-run)
-- ═══════════════════════════════════════════════════════════════
-- Current DB state:
--   • `users` table exists (real table with Supabase auth)
--   • `app_users` is a VIEW → users  (cannot use for FK)
--   • Legacy tables exist: matches, sessions, community_posts, etc.
--   • arena_matches does NOT exist
--   • No V3 enums exist
--
-- This script creates ONLY the V3 engine tables.
-- All FKs point to `users(id)` (the real table).
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- ─── V3 Enums ───────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE match_phase_enum AS ENUM ('DRAFT','ANALYSIS','HYPOTHESIS','BATTLE','RESULT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE match_result_enum AS ENUM ('normal_win','clutch_win','draw'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE market_regime_enum AS ENUM ('trending_up','trending_down','ranging','volatile'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE tier_enum AS ENUM ('BRONZE','SILVER','GOLD','DIAMOND','MASTER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE live_stage_enum AS ENUM ('WAITING','HYPOTHESIS_SUBMITTED','ANALYSIS_RUNNING','POSITION_OPEN','RESULT_SHOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE trend_dir_enum AS ENUM ('RISING','FALLING','FLAT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE lp_reason_enum AS ENUM ('normal_win','clutch_win','loss','draw','perfect_read','dissent_win','challenge_win','challenge_loss','streak_bonus'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═════════════════════════════════════════════════════════════
-- 1. arena_matches — V3 match state
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS arena_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  timeframe   text NOT NULL DEFAULT '4h',

  -- participants (FK → users, NOT app_users view)
  user_a_id   uuid NOT NULL REFERENCES users(id),
  user_b_id   uuid,

  -- drafts [{agentId, specId, weight}]
  user_a_draft  jsonb,
  user_b_draft  jsonb,

  -- predictions {direction, confidence, isOverride, exitStrategy, slPrice, tpPrice}
  user_a_prediction jsonb,
  user_b_prediction jsonb,

  -- 3-axis scores
  user_a_ds   numeric(5,2),
  user_a_re   numeric(5,2),
  user_a_ci   numeric(5,2),
  user_a_fbs  numeric(5,2),
  user_b_ds   numeric(5,2),
  user_b_re   numeric(5,2),
  user_b_ci   numeric(5,2),
  user_b_fbs  numeric(5,2),

  -- price
  entry_price   numeric(16,8),
  exit_price    numeric(16,8),
  price_change  numeric(8,4),

  -- winner
  winner_id     uuid,
  result_type   match_result_enum,

  -- LP
  user_a_lp_delta int DEFAULT 0,
  user_b_lp_delta int DEFAULT 0,

  -- state
  status        match_phase_enum NOT NULL DEFAULT 'DRAFT',
  phase         match_phase_enum,
  market_regime market_regime_enum,

  -- decision windows
  decision_windows jsonb DEFAULT '[]',

  -- analysis + result (from 006)
  analysis_results  jsonb DEFAULT '[]',
  result            jsonb,

  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  ended_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_match_user_a
  ON arena_matches (user_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_status
  ON arena_matches (status) WHERE status != 'RESULT';

-- convenience view
CREATE OR REPLACE VIEW arena_matches_v AS
  SELECT *, COALESCE(phase, status) AS current_phase
  FROM arena_matches;


-- ═════════════════════════════════════════════════════════════
-- 2. indicator_series — time-series + trend meta
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS indicator_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  timeframe   text NOT NULL,
  indicator   text NOT NULL,
  timestamps  bigint[]  NOT NULL DEFAULT '{}',
  vals        numeric[] NOT NULL DEFAULT '{}',
  trend_dir       trend_dir_enum,
  trend_slope     numeric(10,6),
  trend_accel     numeric(10,6),
  trend_strength  numeric(5,2),
  trend_duration  int,
  divergence_type text,
  divergence_conf numeric(5,2),
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pair, timeframe, indicator)
);
CREATE INDEX IF NOT EXISTS idx_indicator_pair_tf
  ON indicator_series (pair, timeframe);


-- ═════════════════════════════════════════════════════════════
-- 3. market_snapshots — raw data cache
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS market_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  source      text NOT NULL,
  data_type   text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  UNIQUE(pair, source, data_type)
);
CREATE INDEX IF NOT EXISTS idx_snapshot_expires
  ON market_snapshots (expires_at);


-- ═════════════════════════════════════════════════════════════
-- 4. agent_analysis_results — per-match agent outputs
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_analysis_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id),
  agent_id    text NOT NULL,
  spec_id     text NOT NULL,
  draft_weight numeric(5,2) NOT NULL,
  pair        text NOT NULL,
  direction   text NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  confidence  numeric(5,2) NOT NULL,
  thesis      text NOT NULL DEFAULT '',
  factors     jsonb NOT NULL DEFAULT '[]',
  bull_score  numeric(5,2) DEFAULT 0,
  bear_score  numeric(5,2) DEFAULT 0,
  trend_context   jsonb,
  divergences     jsonb,
  memory_context  jsonb,
  llm_prompt_used text,
  llm_model       text,
  latency_ms      int,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(match_id, user_id, agent_id)
);


-- ═════════════════════════════════════════════════════════════
-- 5. match_memories — RAG memory (no pgvector for now)
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS match_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  agent_id    text NOT NULL,
  spec_id     text NOT NULL,
  pair        text NOT NULL,
  match_id    uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  market_state    jsonb NOT NULL DEFAULT '{}',
  market_regime   market_regime_enum,
  direction       text NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  confidence      numeric(5,2),
  factors         jsonb,
  thesis          text,
  outcome         boolean,
  price_change    numeric(8,4),
  lesson          text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memory_user_agent
  ON match_memories (user_id, agent_id, pair);
CREATE INDEX IF NOT EXISTS idx_memory_active
  ON match_memories (user_id, agent_id) WHERE is_active = true;


-- ═════════════════════════════════════════════════════════════
-- 6. user_passports — 6 metrics + badges + tier
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_passports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name    text NOT NULL DEFAULT '',
  passport_number serial,
  total_hypotheses  int NOT NULL DEFAULT 0,
  total_approved    int NOT NULL DEFAULT 0,
  total_rejected    int NOT NULL DEFAULT 0,
  win_count         int NOT NULL DEFAULT 0,
  loss_count        int NOT NULL DEFAULT 0,
  direction_total   int NOT NULL DEFAULT 0,
  direction_correct int NOT NULL DEFAULT 0,
  dissent_count     int NOT NULL DEFAULT 0,
  dissent_win_count int NOT NULL DEFAULT 0,
  override_offered  int NOT NULL DEFAULT 0,
  override_accepted int NOT NULL DEFAULT 0,
  override_ignored  int NOT NULL DEFAULT 0,
  challenge_total   int NOT NULL DEFAULT 0,
  challenge_win     int NOT NULL DEFAULT 0,
  confidence_sum    numeric(10,2) NOT NULL DEFAULT 0,
  total_pnl_bps     numeric(10,2) NOT NULL DEFAULT 0,
  win_rate            numeric(5,2) NOT NULL DEFAULT 0,
  direction_accuracy  numeric(5,2) NOT NULL DEFAULT 0,
  ids_score           numeric(5,2) NOT NULL DEFAULT 0,
  calibration         numeric(6,2) NOT NULL DEFAULT 0,
  guardian_compliance  numeric(5,2) NOT NULL DEFAULT 0,
  challenge_win_rate  numeric(5,2) NOT NULL DEFAULT 0,
  current_streak    int NOT NULL DEFAULT 0,
  best_win_streak   int NOT NULL DEFAULT 0,
  worst_loss_streak int NOT NULL DEFAULT 0,
  lp_total          int NOT NULL DEFAULT 0,
  tier              tier_enum NOT NULL DEFAULT 'BRONZE',
  tier_level        smallint NOT NULL DEFAULT 1,
  draft_history     jsonb NOT NULL DEFAULT '[]',
  favorite_agents   jsonb NOT NULL DEFAULT '{}',
  badges            jsonb NOT NULL DEFAULT '[]',
  is_creator        boolean NOT NULL DEFAULT false,
  live_enabled      boolean NOT NULL DEFAULT false,
  issued_at         timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);


-- ═════════════════════════════════════════════════════════════
-- 7. user_agent_progress — spec unlock + per-agent record
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_agent_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id    text NOT NULL,
  total_matches   int NOT NULL DEFAULT 0,
  wins            int NOT NULL DEFAULT 0,
  losses          int NOT NULL DEFAULT 0,
  unlocked_specs  text[] NOT NULL DEFAULT '{base}',
  most_used_spec  text NOT NULL DEFAULT 'base',
  avg_draft_weight numeric(5,2) NOT NULL DEFAULT 33.33,
  combo_stats     jsonb NOT NULL DEFAULT '{}',
  last_10_results boolean[] NOT NULL DEFAULT '{}',
  current_streak  int NOT NULL DEFAULT 0,
  best_streak     int NOT NULL DEFAULT 0,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, agent_id)
);


-- ═════════════════════════════════════════════════════════════
-- 8. agent_accuracy_stats — global agent+spec stats
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_accuracy_stats (
  agent_id        text NOT NULL,
  spec_id         text NOT NULL,
  total_calls     int NOT NULL DEFAULT 0,
  correct_calls   int NOT NULL DEFAULT 0,
  avg_confidence  numeric(5,2) NOT NULL DEFAULT 0,
  regime_stats    jsonb NOT NULL DEFAULT '{}',
  coin_stats      jsonb NOT NULL DEFAULT '{}',
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, spec_id)
);


-- ═════════════════════════════════════════════════════════════
-- 9. lp_transactions — LP ledger
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lp_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id),
  match_id    uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  amount      int NOT NULL,
  reason      lp_reason_enum NOT NULL,
  balance_after int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lp_user_time
  ON lp_transactions (user_id, created_at DESC);


-- ═════════════════════════════════════════════════════════════
-- 10. live_sessions — LIVE spectate sessions
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS live_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES users(id),
  pair            text NOT NULL,
  direction       text,
  confidence      smallint,
  stage           live_stage_enum NOT NULL DEFAULT 'WAITING',
  spectator_count int NOT NULL DEFAULT 0,
  pnl_current     numeric(8,4),
  is_live         boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_live_active
  ON live_sessions (is_live) WHERE is_live = true;


-- ═════════════════════════════════════════════════════════════
-- 11. agent_challenges
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  agent_id        text NOT NULL,
  spec_id         text NOT NULL,
  pair            text NOT NULL,
  user_direction  text NOT NULL CHECK (user_direction IN ('LONG','SHORT')),
  agent_direction text NOT NULL CHECK (agent_direction IN ('LONG','SHORT')),
  reason_tags     text[] NOT NULL DEFAULT '{}',
  reason_text     text,
  outcome         boolean,
  lp_delta        int,
  match_id        uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_challenge_user
  ON agent_challenges (user_id, created_at DESC);


-- ═════════════════════════════════════════════════════════════
-- 12. terminal_scan_runs + scan_signals (from 005)
-- ═════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS terminal_scan_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair        text NOT NULL,
  timeframe   text NOT NULL,
  token       text NOT NULL,
  consensus   text NOT NULL CHECK (consensus IN ('long','short','neutral')),
  avg_confidence numeric(5,2) NOT NULL,
  summary     text NOT NULL,
  highlights  jsonb NOT NULL DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_runs_user
  ON terminal_scan_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_runs_pair
  ON terminal_scan_runs (user_id, pair, timeframe, created_at DESC);

CREATE TABLE IF NOT EXISTS terminal_scan_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id     uuid NOT NULL REFERENCES terminal_scan_runs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id    text NOT NULL,
  agent_name  text NOT NULL,
  vote        text NOT NULL CHECK (vote IN ('long','short','neutral')),
  confidence  numeric(5,2) NOT NULL,
  analysis_text text NOT NULL,
  data_source text NOT NULL,
  entry_price numeric(16,8) NOT NULL,
  tp_price    numeric(16,8) NOT NULL,
  sl_price    numeric(16,8) NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scan_signals_scan
  ON terminal_scan_signals (scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_signals_user
  ON terminal_scan_signals (user_id, created_at DESC);


-- ═════════════════════════════════════════════════════════════
-- 13. v3_tier column on users table
-- ═════════════════════════════════════════════════════════════
ALTER TABLE users ADD COLUMN IF NOT EXISTS v3_tier tier_enum DEFAULT 'BRONZE';


-- ═════════════════════════════════════════════════════════════
-- 14. RLS Policies
-- ═════════════════════════════════════════════════════════════
ALTER TABLE terminal_scan_runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY scan_runs_own ON terminal_scan_runs FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE terminal_scan_signals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY scan_signals_own ON terminal_scan_signals FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE arena_matches ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY arena_matches_own ON arena_matches FOR ALL USING (user_a_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


COMMIT;
