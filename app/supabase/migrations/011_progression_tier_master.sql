-- ═══════════════════════════════════════════════════════════════
-- 011: S-02 Progression Tier Unification
-- profile_tier_enum에 'master' 추가 + LP/tier 컬럼 보강
-- ═══════════════════════════════════════════════════════════════

-- 1. profile_tier_enum에 'master' 추가 (001_init.sql에서 bronze/silver/gold/diamond만 있음)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'master'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'profile_tier_enum')
  ) THEN
    ALTER TYPE profile_tier_enum ADD VALUE 'master';
  END IF;
END $$;

-- 2. user_profiles에 total_lp 컬럼이 없으면 추가
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS total_lp integer NOT NULL DEFAULT 0;

-- 3. user_profiles에 agent_match_counts JSONB 컬럼 추가 (spec 해금 판정용)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS agent_match_counts jsonb NOT NULL DEFAULT '{}';

-- 4. LP 트랜잭션 로그 테이블 (progression audit trail)
CREATE TABLE IF NOT EXISTS lp_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id uuid REFERENCES arena_matches(id) ON DELETE SET NULL,
  reason text NOT NULL,          -- 'normal_win', 'clutch_win', 'loss', 'draw', etc.
  delta integer NOT NULL,        -- LP 변동량 (+/-)
  lp_before integer NOT NULL,
  lp_after integer NOT NULL,
  tier_before text NOT NULL,
  tier_after text NOT NULL,
  metadata jsonb DEFAULT '{}',   -- 추가 정보 (FBS, streak 등)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_transactions_user ON lp_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_transactions_match ON lp_transactions(match_id);
