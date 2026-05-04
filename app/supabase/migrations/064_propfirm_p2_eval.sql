-- Migration 064: PropFirm P2 평가 챌린지 테이블 (W-PF-201)
-- challenge_tiers (가변 룰 파라미터) + evaluations + verification_runs + rule_violations
-- subscriptions.beta_invited 컬럼 추가

-- ─── 1. challenge_tiers ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_tiers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL UNIQUE,        -- 'beta', 'standard', 'pro'
  fee_usd             numeric     NOT NULL,               -- 99, 149, 199
  mll_pct             numeric     NOT NULL,               -- 0.05 = 5% 일일 손실 한도
  profit_goal_pct     numeric     NOT NULL,               -- 0.08 = 8% 수익 목표
  min_trading_days    int         NOT NULL,               -- 10
  max_drawdown_pct    numeric     NOT NULL,               -- 0.10 = 10% 전체 손실 한도
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- 베타 기본 tier
INSERT INTO challenge_tiers (name, fee_usd, mll_pct, profit_goal_pct, min_trading_days, max_drawdown_pct)
VALUES ('beta', 99, 0.05, 0.08, 10, 0.10)
ON CONFLICT (name) DO NOTHING;

-- ─── 2. evaluations ───────────────────────────────────────────────────────────
CREATE TYPE eval_status AS ENUM ('PENDING', 'ACTIVE', 'PASSED', 'FAILED');

CREATE TABLE IF NOT EXISTS evaluations (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id                uuid        NOT NULL REFERENCES challenge_tiers(id),
  status                 eval_status NOT NULL DEFAULT 'PENDING',
  -- 결제 추적
  stripe_payment_intent  text,
  tx_hash                text        UNIQUE,              -- USDC on-chain (D-3: UNIQUE 강제)
  payment_method         text,                            -- 'stripe' | 'usdc'
  paid_at                timestamptz,
  -- 챌린지 기간
  started_at             timestamptz,
  ended_at               timestamptz,
  -- 스냅샷 (daily 집계 캐시, 룰 엔진이 업데이트)
  equity_start           numeric,
  equity_current         numeric,
  trading_days           int         NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluations_user_status ON evaluations (user_id, status);
CREATE INDEX idx_evaluations_status_created ON evaluations (status, created_at DESC);

-- ─── 3. verification_runs ─────────────────────────────────────────────────────
-- append-only — 감사 추적 (D-3)
CREATE TYPE verify_result AS ENUM ('PASS', 'FAIL');

CREATE TABLE IF NOT EXISTS verification_runs (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  uuid          NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  result         verify_result NOT NULL,
  snapshot       jsonb         NOT NULL DEFAULT '{}',    -- 판정 시점 지표 전체
  signed_hash    text,                                   -- HMAC-SHA256 (D-6: JSON + signed hash)
  created_at     timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_runs_eval ON verification_runs (evaluation_id, created_at DESC);

-- ─── 4. rule_violations ───────────────────────────────────────────────────────
CREATE TYPE rule_name AS ENUM ('mll', 'max_drawdown', 'consistency', 'profit_goal', 'min_trading_days');

CREATE TABLE IF NOT EXISTS rule_violations (
  id             uuid       PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id  uuid       NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  rule           rule_name  NOT NULL,
  detail         jsonb      NOT NULL DEFAULT '{}',       -- 위반 시점 값, 임계값 등
  violated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rule_violations_eval ON rule_violations (evaluation_id, violated_at DESC);
CREATE INDEX idx_rule_violations_rule ON rule_violations (rule, violated_at DESC);

-- ─── 5. subscriptions.beta_invited ────────────────────────────────────────────
-- D-5: 베타 whitelist
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS beta_invited boolean NOT NULL DEFAULT false;

CREATE INDEX idx_subscriptions_beta_invited ON subscriptions (beta_invited) WHERE beta_invited = true;

-- ─── 6. updated_at 자동 갱신 트리거 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_evaluations_updated_at
  BEFORE UPDATE ON evaluations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
