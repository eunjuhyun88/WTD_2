-- ═══════════════════════════════════════════════════════════════
-- STOCKCLAW — Arena War Records Table
-- ═══════════════════════════════════════════════════════════════
--
-- GameRecord 저장용 테이블
-- 핵심 컬럼을 인덱싱하고, 전체 GameRecord는 JSONB로 보관

CREATE TABLE IF NOT EXISTS arena_war_records (
  id              TEXT PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version         INT NOT NULL DEFAULT 1,

  -- Context (검색/필터용)
  pair            TEXT NOT NULL,
  timeframe       TEXT NOT NULL,
  regime          TEXT NOT NULL,

  -- Human decision (통계용)
  human_direction TEXT NOT NULL,
  human_confidence INT NOT NULL,
  human_reason_tags JSONB NOT NULL DEFAULT '[]',

  -- AI decision (통계용)
  ai_direction    TEXT NOT NULL,
  ai_confidence   INT NOT NULL,

  -- Outcome (통계/정렬용)
  winner          TEXT NOT NULL,           -- 'human' | 'ai' | 'draw'
  human_fbs       REAL NOT NULL DEFAULT 0,
  ai_fbs          REAL NOT NULL DEFAULT 0,
  fbs_margin      REAL NOT NULL DEFAULT 0,
  consensus_type  TEXT NOT NULL DEFAULT 'partial', -- 'consensus' | 'partial' | 'dissent' | 'override'
  pair_quality    TEXT NOT NULL DEFAULT 'noise',   -- 'strong' | 'medium' | 'weak' | 'boundary' | 'noise'

  -- Full GameRecord (JSONB)
  game_record     JSONB NOT NULL,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_awr_user_id ON arena_war_records(user_id);
CREATE INDEX IF NOT EXISTS idx_awr_user_created ON arena_war_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_awr_pair ON arena_war_records(pair);
CREATE INDEX IF NOT EXISTS idx_awr_regime ON arena_war_records(regime);
CREATE INDEX IF NOT EXISTS idx_awr_winner ON arena_war_records(winner);
CREATE INDEX IF NOT EXISTS idx_awr_quality ON arena_war_records(pair_quality);
CREATE INDEX IF NOT EXISTS idx_awr_consensus ON arena_war_records(consensus_type);

-- ORPO pair 추출용 인덱스 (strong/medium quality만 필터)
CREATE INDEX IF NOT EXISTS idx_awr_orpo_quality
  ON arena_war_records(pair_quality)
  WHERE pair_quality IN ('strong', 'medium', 'boundary');

-- 유저별 통계 빠른 집계용
CREATE INDEX IF NOT EXISTS idx_awr_user_winner
  ON arena_war_records(user_id, winner);
