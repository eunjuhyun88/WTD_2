-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — Agent Engine v3 Migration
-- 8 Agent Pool × 3 Draft × LLM Spec × RAG Memory × FBS Scoring
-- ═══════════════════════════════════════════════════════════════
BEGIN;

-- ─── Prerequisites ───────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;  -- pgvector for RAG

-- ─── New Enums ───────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE match_phase_enum AS ENUM ('DRAFT','ANALYSIS','HYPOTHESIS','BATTLE','RESULT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE match_result_enum AS ENUM ('normal_win','clutch_win','draw');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE market_regime_enum AS ENUM ('trending_up','trending_down','ranging','volatile');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tier_enum AS ENUM ('BRONZE','SILVER','GOLD','DIAMOND','MASTER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE live_stage_enum AS ENUM (
    'WAITING','HYPOTHESIS_SUBMITTED','ANALYSIS_RUNNING',
    'POSITION_OPEN','RESULT_SHOWN'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trend_dir_enum AS ENUM ('RISING','FALLING','FLAT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE lp_reason_enum AS ENUM (
    'normal_win','clutch_win','loss','draw',
    'perfect_read','dissent_win',
    'challenge_win','challenge_loss',
    'streak_bonus'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════════
-- 1. indicator_series — 시계열 + 추세 메타
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS indicator_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  timeframe   text NOT NULL,           -- '1h','4h','1d','5m','8h'
  indicator   text NOT NULL,           -- 'RSI_14','EMA_7','OI','FUNDING_RATE' ...

  -- 시계열 데이터 (최근 200봉)
  timestamps  bigint[]  NOT NULL DEFAULT '{}',
  vals        numeric[] NOT NULL DEFAULT '{}',   -- 'values' is reserved

  -- 추세 메타 (마지막 계산 결과)
  trend_dir       trend_dir_enum,
  trend_slope     numeric(10,6),         -- -1.0 ~ +1.0 정규화
  trend_accel     numeric(10,6),         -- 기울기의 변화율
  trend_strength  numeric(5,2),          -- 0-100
  trend_duration  int,                   -- 현재 추세 유지 봉 수

  -- 다이버전스
  divergence_type text,                  -- 'BULLISH_DIV','BEARISH_DIV','HIDDEN_BULL','HIDDEN_BEAR','NONE'
  divergence_conf numeric(5,2),          -- 0-100

  computed_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(pair, timeframe, indicator)
);

CREATE INDEX IF NOT EXISTS idx_indicator_pair_tf
  ON indicator_series (pair, timeframe);


-- ═══════════════════════════════════════════════════════════════
-- 2. market_snapshots — 원시 데이터 캐시
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS market_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  source      text NOT NULL,            -- 'binance','yahoo','coingecko','feargreed' ...
  data_type   text NOT NULL,            -- 'klines','oi','funding_rate','fear_greed' ...
  payload     jsonb NOT NULL DEFAULT '{}',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,

  UNIQUE(pair, source, data_type)
);

CREATE INDEX IF NOT EXISTS idx_snapshot_expires
  ON market_snapshots (expires_at);


-- ═══════════════════════════════════════════════════════════════
-- 3. arena_matches — 매치 전체 상태
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS arena_matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pair        text NOT NULL,
  timeframe   text NOT NULL DEFAULT '4h',

  -- 참가자
  user_a_id   uuid NOT NULL REFERENCES app_users(id),
  user_b_id   uuid,                     -- NULL = AI 대전

  -- 드래프트  [{agentId, specId, weight}]
  user_a_draft  jsonb,
  user_b_draft  jsonb,

  -- 최종 예측 {direction, confidence, isOverride, exitStrategy, slPrice, tpPrice}
  user_a_prediction jsonb,
  user_b_prediction jsonb,

  -- 3축 스코어
  user_a_ds   numeric(5,2),
  user_a_re   numeric(5,2),
  user_a_ci   numeric(5,2),
  user_a_fbs  numeric(5,2),
  user_b_ds   numeric(5,2),
  user_b_re   numeric(5,2),
  user_b_ci   numeric(5,2),
  user_b_fbs  numeric(5,2),

  -- 가격 결과
  entry_price   numeric(16,8),
  exit_price    numeric(16,8),
  price_change  numeric(8,4),

  -- 승패
  winner_id     uuid,
  result_type   match_result_enum,

  -- LP
  user_a_lp_delta int DEFAULT 0,
  user_b_lp_delta int DEFAULT 0,

  -- 상태
  status        match_phase_enum NOT NULL DEFAULT 'DRAFT',
  market_regime market_regime_enum,

  -- Decision Windows [{windowN, action, timestamp}]
  decision_windows jsonb DEFAULT '[]',

  created_at  timestamptz NOT NULL DEFAULT now(),
  started_at  timestamptz,
  ended_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_match_user_a
  ON arena_matches (user_a_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_match_status
  ON arena_matches (status)
  WHERE status != 'RESULT';


-- ═══════════════════════════════════════════════════════════════
-- 4. agent_analysis_results — 매치별 에이전트 분석
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_analysis_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES app_users(id),
  agent_id    text NOT NULL,             -- 'STRUCTURE','VPA','ICT','DERIV','VALUATION','FLOW','SENTI','MACRO'
  spec_id     text NOT NULL,             -- 'base','trend_rider','squeeze_hunter' ...
  draft_weight numeric(5,2) NOT NULL,    -- 0-100

  pair        text NOT NULL,

  direction   text NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  confidence  numeric(5,2) NOT NULL,     -- 0-100
  thesis      text NOT NULL DEFAULT '',

  factors     jsonb NOT NULL DEFAULT '[]',
  bull_score  numeric(5,2) DEFAULT 0,
  bear_score  numeric(5,2) DEFAULT 0,

  -- 추세 + 다이버전스 + RAG 기억 컨텍스트
  trend_context   jsonb,
  divergences     jsonb,
  memory_context  jsonb,

  -- LLM 메타
  llm_prompt_used text,
  llm_model       text,
  latency_ms      int,

  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE(match_id, user_id, agent_id)
);


-- ═══════════════════════════════════════════════════════════════
-- 5. match_memories — RAG 기억 (pgvector)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS match_memories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id),
  agent_id    text NOT NULL,
  spec_id     text NOT NULL,
  pair        text NOT NULL,
  match_id    uuid REFERENCES arena_matches(id) ON DELETE SET NULL,

  -- 시장 상태 스냅샷
  market_state    jsonb NOT NULL DEFAULT '{}',
  market_regime   market_regime_enum,

  -- 에이전트 판단
  direction       text NOT NULL CHECK (direction IN ('LONG','SHORT','NEUTRAL')),
  confidence      numeric(5,2),
  factors         jsonb,
  thesis          text,

  -- 결과
  outcome         boolean,               -- true=맞음, false=틀림
  price_change    numeric(8,4),
  lesson          text,                  -- LLM 자동 생성 교훈

  -- 임베딩 (pgvector 256d)
  embedding       vector(256),

  -- soft delete
  is_active       boolean NOT NULL DEFAULT true,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memory_user_agent
  ON match_memories (user_id, agent_id, pair);

CREATE INDEX IF NOT EXISTS idx_memory_active
  ON match_memories (user_id, agent_id)
  WHERE is_active = true;

-- IVFFlat 인덱스 (데이터 100건 이상 후 REINDEX 권장)
-- 초기에는 exact search, 데이터 쌓이면 CREATE INDEX 실행
-- CREATE INDEX idx_memory_vector ON match_memories
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RAG 검색 함수
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(256),
  match_user_id uuid,
  match_agent_id text,
  match_count int DEFAULT 5
) RETURNS SETOF match_memories AS $$
  SELECT * FROM match_memories
  WHERE user_id = match_user_id
    AND agent_id = match_agent_id
    AND is_active = true
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$ LANGUAGE sql STABLE;


-- ═══════════════════════════════════════════════════════════════
-- 6. user_passports — 6대 메트릭 + 배지 + 티어
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_passports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
  display_name    text NOT NULL DEFAULT '',
  passport_number serial,

  -- 원시 카운트
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

  -- 파생 지표 (00:05 UTC 재계산)
  win_rate            numeric(5,2) NOT NULL DEFAULT 0,
  direction_accuracy  numeric(5,2) NOT NULL DEFAULT 0,
  ids_score           numeric(5,2) NOT NULL DEFAULT 0,
  calibration         numeric(6,2) NOT NULL DEFAULT 0,
  guardian_compliance  numeric(5,2) NOT NULL DEFAULT 0,
  challenge_win_rate  numeric(5,2) NOT NULL DEFAULT 0,

  -- 연속 기록
  current_streak    int NOT NULL DEFAULT 0,
  best_win_streak   int NOT NULL DEFAULT 0,
  worst_loss_streak int NOT NULL DEFAULT 0,

  -- LP + 티어
  lp_total          int NOT NULL DEFAULT 0,
  tier              tier_enum NOT NULL DEFAULT 'BRONZE',
  tier_level        smallint NOT NULL DEFAULT 1,  -- I, II, III

  -- 드래프트 통계
  draft_history     jsonb NOT NULL DEFAULT '[]',    -- 최근 50판
  favorite_agents   jsonb NOT NULL DEFAULT '{}',    -- {"DERIV": 48, ...}

  -- 배지
  badges            jsonb NOT NULL DEFAULT '[]',    -- [{id, name, earned_at}]

  -- 공개 설정
  is_creator        boolean NOT NULL DEFAULT false,
  live_enabled      boolean NOT NULL DEFAULT false,

  issued_at         timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_user_passports_updated_at
BEFORE UPDATE ON user_passports
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- 7. user_agent_progress — Spec 해금 + 에이전트별 전적
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS user_agent_progress (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  agent_id    text NOT NULL,

  total_matches   int NOT NULL DEFAULT 0,
  wins            int NOT NULL DEFAULT 0,
  losses          int NOT NULL DEFAULT 0,

  unlocked_specs  text[] NOT NULL DEFAULT '{base}',
  most_used_spec  text NOT NULL DEFAULT 'base',
  avg_draft_weight numeric(5,2) NOT NULL DEFAULT 33.33,

  -- 콤보 통계 {"STRUCTURE": {matches:10, wins:7}, ...}
  combo_stats     jsonb NOT NULL DEFAULT '{}',

  -- 최근 10판 결과
  last_10_results boolean[] NOT NULL DEFAULT '{}',
  current_streak  int NOT NULL DEFAULT 0,
  best_streak     int NOT NULL DEFAULT 0,

  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE(user_id, agent_id)
);

CREATE TRIGGER trg_user_agent_progress_updated_at
BEFORE UPDATE ON user_agent_progress
FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- ═══════════════════════════════════════════════════════════════
-- 8. agent_accuracy_stats — 글로벌 에이전트+Spec 통계
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_accuracy_stats (
  agent_id        text NOT NULL,
  spec_id         text NOT NULL,

  total_calls     int NOT NULL DEFAULT 0,
  correct_calls   int NOT NULL DEFAULT 0,
  avg_confidence  numeric(5,2) NOT NULL DEFAULT 0,

  -- 시장 레짐별 {"trending_up": {calls:50, correct:38}, ...}
  regime_stats    jsonb NOT NULL DEFAULT '{}',
  -- 코인별 {"BTC": {calls:100, correct:72}, ...}
  coin_stats      jsonb NOT NULL DEFAULT '{}',

  updated_at      timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (agent_id, spec_id)
);


-- ═══════════════════════════════════════════════════════════════
-- 9. lp_transactions — LP 적립/차감 이력
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lp_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES app_users(id),
  match_id    uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  amount      int NOT NULL,              -- +11, -8, +18, +7 등
  reason      lp_reason_enum NOT NULL,
  balance_after int NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_user_time
  ON lp_transactions (user_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- 10. live_sessions — LIVE 관전 세션
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS live_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        uuid NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  creator_id      uuid NOT NULL REFERENCES app_users(id),
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
  ON live_sessions (is_live)
  WHERE is_live = true;


-- ═══════════════════════════════════════════════════════════════
-- 11. agent_challenges — Challenge 기록
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS agent_challenges (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES app_users(id),
  agent_id        text NOT NULL,
  spec_id         text NOT NULL,
  pair            text NOT NULL,
  user_direction  text NOT NULL CHECK (user_direction IN ('LONG','SHORT')),
  agent_direction text NOT NULL CHECK (agent_direction IN ('LONG','SHORT')),
  reason_tags     text[] NOT NULL DEFAULT '{}',
  reason_text     text,
  outcome         boolean,               -- true=유저 승, false=에이전트 승, null=미판정
  lp_delta        int,
  match_id        uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz
);

CREATE INDEX IF NOT EXISTS idx_challenge_user
  ON agent_challenges (user_id, created_at DESC);


-- ═══════════════════════════════════════════════════════════════
-- Sync: app_users 에 v3 관련 컬럼 추가
-- ═══════════════════════════════════════════════════════════════
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS v3_tier tier_enum DEFAULT 'BRONZE';


COMMIT;
