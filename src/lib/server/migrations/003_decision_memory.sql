-- ═══════════════════════════════════════════════════════════════
-- STOCKCLAW — Decision Memory Evolution
-- ═══════════════════════════════════════════════════════════════
--
-- arena_war_rag 테이블을 Decision Memory로 진화.
-- 논문 기반 설계:
--   Paper 1 (RAG for Stock Selection): KB 품질, semantic dedup
--   Paper 2 (Fine-Grained Multi-Agent): 에이전트별 세분화, 계층 구조
--
-- 핵심 추가:
--   1. Decision Chain (scan→trade open→trade close 연결)
--   2. Fine-Grained Agent Signals (에이전트별 vote/confidence)
--   3. Outcome Maturation (pending→confirmed, PnL 기반 품질 업데이트)
--   4. Semantic Deduplication (동일 시간창 내 중복 방지)
--
-- 의존: 002_arena_war_rag.sql

-- ─── Decision Chain 컬럼 ─────────────────────────────────────
-- chain_id: scan→trade→close를 하나의 체인으로 연결
-- chain_step: 체인 내 순서 (0=scan/signal, 1=trade open, 2=trade close)
ALTER TABLE arena_war_rag
  ADD COLUMN IF NOT EXISTS chain_id TEXT,
  ADD COLUMN IF NOT EXISTS chain_step INT DEFAULT 0;

-- ─── Fine-Grained Agent Signals (Paper 2) ────────────────────
-- 에이전트별 세분화된 분석 결과 저장
-- 형식: {"STRUCTURE": {"vote":"long","confidence":85}, "VPA": {...}, ...}
ALTER TABLE arena_war_rag
  ADD COLUMN IF NOT EXISTS agent_signals JSONB DEFAULT '{}';

-- ─── Outcome Maturation (Paper 1: KB 품질 관리) ──────────────
-- outcome_type: 결과 유형 (pending→pnl/winner/expired)
-- outcome_value: PnL% 또는 1(승)/0(패)
-- outcome_at: 결과 확정 시각
ALTER TABLE arena_war_rag
  ADD COLUMN IF NOT EXISTS outcome_type TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS outcome_value REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;

-- ─── Semantic Deduplication (Paper 1) ────────────────────────
-- pair+tf+direction+regime+time_bucket 해시
ALTER TABLE arena_war_rag
  ADD COLUMN IF NOT EXISTS dedupe_hash TEXT;

-- ─── Backfill 기존 Arena War 데이터 ──────────────────────────
-- winner가 확정된 기존 데이터: outcome_type='winner'로 설정
UPDATE arena_war_rag
SET
  outcome_type = CASE
    WHEN winner = 'human' THEN 'winner'
    WHEN winner = 'ai' THEN 'winner'
    WHEN winner = 'draw' THEN 'winner'
    ELSE 'pending'
  END,
  outcome_value = CASE
    WHEN winner = 'human' THEN 1.0
    WHEN winner = 'ai' THEN 0.0
    WHEN winner = 'draw' THEN 0.5
    ELSE 0.0
  END,
  outcome_at = CASE
    WHEN winner != 'pending' THEN created_at
    ELSE NULL
  END
WHERE outcome_type = 'pending' AND winner != 'pending';

-- ─── 새 인덱스 ──────────────────────────────────────────────

-- Decision Chain 검색 (체인 전체 업데이트 시)
CREATE INDEX IF NOT EXISTS idx_awr_rag_chain_id
  ON arena_war_rag(chain_id) WHERE chain_id IS NOT NULL;

-- Semantic dedup 체크
CREATE INDEX IF NOT EXISTS idx_awr_rag_dedupe_hash
  ON arena_war_rag(dedupe_hash) WHERE dedupe_hash IS NOT NULL;

-- Outcome 필터 (confirmed만 검색)
CREATE INDEX IF NOT EXISTS idx_awr_rag_outcome_type
  ON arena_war_rag(outcome_type);

-- Confirmed outcomes only (Paper 1: 품질 확정된 데이터만 검색)
CREATE INDEX IF NOT EXISTS idx_awr_rag_confirmed
  ON arena_war_rag(user_id, created_at DESC)
  WHERE outcome_type != 'pending';

-- ─── Dedup 체크 함수 ────────────────────────────────────────

CREATE OR REPLACE FUNCTION check_rag_dedupe(
  p_user_id UUID,
  p_dedupe_hash TEXT
) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM arena_war_rag
    WHERE user_id = p_user_id AND dedupe_hash = p_dedupe_hash
  );
$$ LANGUAGE sql STABLE;

-- ─── Outcome-Weighted 검색 함수 v2 ──────────────────────────
--
-- Paper 1: quality_weight × cosine_sim × recency_weight
-- Paper 2: confirmed outcome 우선, pending 감쇄
--
-- 기존 search_arena_war_rag()는 그대로 유지 (backward compatible).

CREATE OR REPLACE FUNCTION search_arena_war_rag_v2(
  query_embedding   vector(256),
  match_user_id     UUID,
  match_pair        TEXT DEFAULT NULL,
  match_regime      TEXT DEFAULT NULL,
  min_quality       TEXT DEFAULT 'weak',
  match_count       INT DEFAULT 5,
  prefer_confirmed  BOOLEAN DEFAULT TRUE
) RETURNS TABLE (
  id                TEXT,
  pair              TEXT,
  timeframe         TEXT,
  regime            TEXT,
  pattern_signature TEXT,
  source            TEXT,
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
  chain_id          TEXT,
  chain_step        INT,
  agent_signals     JSONB,
  outcome_type      TEXT,
  outcome_value     REAL,
  created_at        TIMESTAMPTZ,
  similarity        DOUBLE PRECISION,
  weighted_score    DOUBLE PRECISION
) AS $$
DECLARE
  quality_ranks TEXT[] := ARRAY['strong', 'medium', 'boundary', 'weak'];
  min_rank INT;
BEGIN
  min_rank := array_position(quality_ranks, min_quality);
  IF min_rank IS NULL THEN
    min_rank := 4;
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.pair,
    r.timeframe,
    r.regime,
    r.pattern_signature,
    r.source,
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
    r.chain_id,
    r.chain_step,
    r.agent_signals,
    r.outcome_type,
    r.outcome_value,
    r.created_at,
    -- Cosine similarity
    (1.0 - (r.embedding <=> query_embedding))::DOUBLE PRECISION AS similarity,
    -- Weighted score: cosine_sim × quality_weight × recency × outcome_bonus
    (
      (1.0 - (r.embedding <=> query_embedding))
      -- Quality weight: strong=1.0, medium=0.85, boundary=0.7, weak=0.5
      * CASE r.quality
          WHEN 'strong' THEN 1.0
          WHEN 'medium' THEN 0.85
          WHEN 'boundary' THEN 0.7
          WHEN 'weak' THEN 0.5
          ELSE 0.2
        END
      -- Recency decay: 1 / (1 + ln(1 + age_days))
      * (1.0 / (1.0 + LN(1.0 + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - r.created_at)) / 86400.0))))
      -- Outcome bonus: confirmed outcomes get 2x when prefer_confirmed
      * CASE
          WHEN prefer_confirmed AND r.outcome_type != 'pending' THEN 2.0
          WHEN prefer_confirmed AND r.outcome_type = 'pending' THEN 0.5
          ELSE 1.0
        END
    )::DOUBLE PRECISION AS weighted_score
  FROM arena_war_rag r
  WHERE r.user_id = match_user_id
    AND r.embedding IS NOT NULL
    AND r.quality != 'noise'
    AND (
      array_position(quality_ranks, r.quality) IS NOT NULL
      AND array_position(quality_ranks, r.quality) <= min_rank
    )
    AND (match_pair IS NULL OR r.pair = match_pair)
    AND (match_regime IS NULL OR r.regime = match_regime)
  ORDER BY weighted_score DESC
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql STABLE;
