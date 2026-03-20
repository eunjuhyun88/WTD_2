-- ═══════════════════════════════════════════════════════════════
-- STOCKCLAW — Unified RAG Memory Table
-- ═══════════════════════════════════════════════════════════════
--
-- Arena War 게임 + Terminal 스캔 등 모든 활동의 RAG 메모리.
-- pgvector 256d 임베딩으로 유사 활동 검색.
-- ragEmbedding.ts의 computeEmbedding()이 생성한 벡터를 저장.
--
-- 기존 match_memories (004_agent_engine_v3) 와 별개.
-- match_memories = 에이전트 단위, arena_war_rag = 활동 단위.
--
-- 의존: pgvector extension (004_agent_engine_v3에서 이미 활성화)

-- pgvector 존재 보장 (멱등)
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS arena_war_rag (
  id                TEXT PRIMARY KEY,          -- gameRecordId or scanId
  user_id           UUID NOT NULL,
  source            TEXT NOT NULL DEFAULT 'arena_war',  -- arena_war | terminal_scan | opportunity_scan
  pair              TEXT NOT NULL,
  timeframe         TEXT NOT NULL,
  regime            TEXT NOT NULL,             -- trending_up, trending_down, ranging, volatile
  pattern_signature TEXT NOT NULL DEFAULT '',   -- 패턴 시그니처

  -- 256d deterministic embedding (ragEmbedding.ts)
  embedding         vector(256),

  -- Human decision (Arena War: 인간 판단, Terminal: 유저 해석)
  human_direction   TEXT NOT NULL,              -- LONG | SHORT | NEUTRAL
  human_confidence  INT NOT NULL,
  human_reason_tags JSONB NOT NULL DEFAULT '[]',

  -- AI decision (Arena War: C02 결과, Terminal: 8-agent consensus)
  ai_direction      TEXT NOT NULL,              -- LONG | SHORT | NEUTRAL
  ai_confidence     INT NOT NULL,
  ai_top_factors    JSONB NOT NULL DEFAULT '[]',

  -- Outcome (Arena War: FBS winner, Terminal: pending → 가격 변동 후 업데이트)
  winner            TEXT NOT NULL DEFAULT 'pending', -- human | ai | draw | pending
  human_fbs         REAL NOT NULL DEFAULT 0,
  ai_fbs            REAL NOT NULL DEFAULT 0,
  price_change      REAL NOT NULL DEFAULT 0,

  -- Quality & Lesson
  quality           TEXT NOT NULL DEFAULT 'noise',  -- strong | medium | boundary | weak | noise
  lesson            TEXT NOT NULL DEFAULT '',

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indexes ──────────────────────────────────────────────────

-- 유저별 시간순 조회
CREATE INDEX IF NOT EXISTS idx_awr_rag_user_created
  ON arena_war_rag(user_id, created_at DESC);

-- 유저 + 소스 필터 (arena_war / terminal_scan 구분 조회)
CREATE INDEX IF NOT EXISTS idx_awr_rag_user_source
  ON arena_war_rag(user_id, source);

-- 유저 + 페어 필터 (유사 게임 검색 시 동일 페어 우선)
CREATE INDEX IF NOT EXISTS idx_awr_rag_user_pair
  ON arena_war_rag(user_id, pair);

-- 유저 + 레짐 필터
CREATE INDEX IF NOT EXISTS idx_awr_rag_user_regime
  ON arena_war_rag(user_id, regime);

-- 품질 필터 (noise 제외 검색)
CREATE INDEX IF NOT EXISTS idx_awr_rag_quality
  ON arena_war_rag(quality)
  WHERE quality IN ('strong', 'medium', 'boundary');

-- pgvector 코사인 거리 인덱스
-- 초기에는 exact search (데이터 < 1000건).
-- 데이터 1000건 이상 시 아래 주석 해제 후 REINDEX:
-- CREATE INDEX idx_awr_rag_vector ON arena_war_rag
--   USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

-- ─── RAG 검색 함수 ────────────────────────────────────────────
--
-- 코사인 거리(<=>)로 유사 게임 검색.
-- 필터: user_id (필수), pair/regime (선택), quality (noise 제외).
-- embedding이 NULL인 레코드 제외.

CREATE OR REPLACE FUNCTION search_arena_war_rag(
  query_embedding   vector(256),
  match_user_id     UUID,
  match_pair        TEXT DEFAULT NULL,
  match_regime      TEXT DEFAULT NULL,
  min_quality       TEXT DEFAULT 'weak',      -- weak 이상만 반환
  match_count       INT DEFAULT 5
) RETURNS TABLE (
  id                TEXT,
  pair              TEXT,
  timeframe         TEXT,
  regime            TEXT,
  pattern_signature TEXT,
  human_direction   TEXT,
  human_confidence  INT,
  ai_direction      TEXT,
  ai_confidence     INT,
  winner            TEXT,
  human_fbs         REAL,
  ai_fbs            REAL,
  price_change      REAL,
  quality           TEXT,
  lesson            TEXT,
  created_at        TIMESTAMPTZ,
  similarity        DOUBLE PRECISION
) AS $$
DECLARE
  quality_ranks TEXT[] := ARRAY['strong', 'medium', 'boundary', 'weak'];
  min_rank INT;
BEGIN
  -- quality 순위 결정 (strong=1, medium=2, boundary=3, weak=4)
  min_rank := array_position(quality_ranks, min_quality);
  IF min_rank IS NULL THEN
    min_rank := 4; -- default: weak 이상
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.pair,
    r.timeframe,
    r.regime,
    r.pattern_signature,
    r.human_direction,
    r.human_confidence,
    r.ai_direction,
    r.ai_confidence,
    r.winner,
    r.human_fbs,
    r.ai_fbs,
    r.price_change,
    r.quality,
    r.lesson,
    r.created_at,
    1.0 - (r.embedding <=> query_embedding)::DOUBLE PRECISION AS similarity
  FROM arena_war_rag r
  WHERE r.user_id = match_user_id
    AND r.embedding IS NOT NULL
    AND array_position(quality_ranks, r.quality) IS NOT NULL
    AND array_position(quality_ranks, r.quality) <= min_rank
    AND (match_pair IS NULL OR r.pair = match_pair)
    AND (match_regime IS NULL OR r.regime = match_regime)
  ORDER BY r.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;
