-- Migration 066: PropFirm P2 평가 챌린지 스키마 완전판 (W-PF-201~202 통합 + 설계 수정)
-- lucid-bohr 브랜치의 064/065 를 대체 — 해당 브랜치는 머지하지 않고 이 파일로 통합
--
-- 추가된 설계 결정:
--   evaluations.account_id     : evaluation ↔ PAPER trading_account 1:1 FK
--   fn_create_paper_account()  : status=ACTIVE 전환 시 PAPER 계정 atomic 생성 트리거
--   challenge_tiers.consistency_cap_pct : Consistency 룰 파라미터화
--   pf_positions user self-read RLS
--   pf_fills RLS enable + user read policy

-- ─── 1. challenge_tiers ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS challenge_tiers (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text        NOT NULL UNIQUE,         -- 'beta' | 'standard' | 'pro'
  fee_usd             numeric     NOT NULL,                -- 99, 149, 199
  mll_pct             numeric     NOT NULL,                -- 일일 손실 한도   e.g. 0.05
  profit_goal_pct     numeric     NOT NULL,                -- 수익 목표        e.g. 0.08
  min_trading_days    int         NOT NULL,                -- 최소 거래일수    e.g. 10
  max_drawdown_pct    numeric     NOT NULL,                -- 전체 손실 한도   e.g. 0.10
  consistency_cap_pct numeric     NOT NULL DEFAULT 0.40,   -- 단일 최고일 비중 상한 (Consistency 룰)
  initial_balance     numeric     NOT NULL DEFAULT 10000,  -- 챌린지 시작 자본
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO challenge_tiers
  (name, fee_usd, mll_pct, profit_goal_pct, min_trading_days, max_drawdown_pct)
VALUES
  ('beta', 99, 0.05, 0.08, 10, 0.10)
ON CONFLICT (name) DO NOTHING;

-- ─── 2. evaluations ──────────────────────────────────────────────────────────
CREATE TYPE eval_status AS ENUM ('PENDING', 'ACTIVE', 'PASSED', 'FAILED');

CREATE TABLE IF NOT EXISTS evaluations (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier_id               uuid        NOT NULL REFERENCES challenge_tiers(id),
  -- ACTIVE 전환 시 트리거가 PAPER trading_account를 생성하고 여기에 연결
  account_id            uuid        REFERENCES trading_accounts(id) ON DELETE SET NULL,
  status                eval_status NOT NULL DEFAULT 'PENDING',
  -- 결제
  stripe_payment_intent text,
  tx_hash               text        UNIQUE,   -- USDC on-chain (중복 결제 방지)
  payment_method        text,                 -- 'stripe' | 'usdc'
  paid_at               timestamptz,
  -- 챌린지 기간
  started_at            timestamptz,          -- ACTIVE 전환 시 트리거가 설정
  ended_at              timestamptz,
  -- 룰 엔진 집계 캐시 (fill마다 갱신, 조회 O(1))
  equity_start          numeric,
  equity_current        numeric,
  trading_days          int         NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_evaluations_user_status    ON evaluations (user_id, status);
CREATE INDEX idx_evaluations_status_created ON evaluations (status, created_at DESC);
CREATE INDEX idx_evaluations_account        ON evaluations (account_id) WHERE account_id IS NOT NULL;

-- 한 유저 동시 ACTIVE 1개 제한 (DB 레벨 동시성 보장)
CREATE UNIQUE INDEX idx_evaluations_user_active_unique
  ON evaluations (user_id)
  WHERE status = 'ACTIVE';

-- ─── 3. updated_at 자동 갱신 ─────────────────────────────────────────────────
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

-- ─── 4. fn_create_paper_account + 트리거 ─────────────────────────────────────
-- evaluation.status 가 ACTIVE 로 전환될 때:
--   1) PAPER trading_accounts 행 생성 (tier 파라미터 반영)
--   2) evaluations.account_id, started_at, equity_start 설정
-- BEFORE UPDATE 로 동일 트랜잭션 내에서 atomic 처리
CREATE OR REPLACE FUNCTION fn_create_paper_account()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tier       challenge_tiers%ROWTYPE;
  v_account_id uuid;
  v_balance    numeric;
BEGIN
  IF NEW.account_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_tier FROM challenge_tiers WHERE id = NEW.tier_id;
  v_balance := v_tier.initial_balance;

  INSERT INTO trading_accounts (
    user_id,
    account_type,
    label,
    mode,
    symbols,
    exit_policy,
    sizing_pct,
    status,
    initial_balance,
    current_equity,
    max_loss_limit,
    mll_level,
    profit_goal
  ) VALUES (
    NEW.user_id,
    'PAPER',
    'eval:' || NEW.id,
    'AUTO',
    ARRAY['BTC', 'ETH', 'SOL'],
    '{"tp_bps": 200, "sl_bps": 100, "ttl_min": 240}'::jsonb,
    0.05,
    'ACTIVE',
    v_balance,
    v_balance,
    v_balance * v_tier.mll_pct,           -- max_loss_limit  (일일)
    v_balance - v_balance * v_tier.mll_pct, -- mll_level
    v_balance * v_tier.profit_goal_pct     -- profit_goal
  )
  RETURNING id INTO v_account_id;

  NEW.account_id    := v_account_id;
  NEW.started_at    := now();
  NEW.equity_start  := v_balance;
  NEW.equity_current := v_balance;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_paper_account
  BEFORE UPDATE OF status ON evaluations
  FOR EACH ROW
  WHEN (NEW.status = 'ACTIVE' AND OLD.status IS DISTINCT FROM 'ACTIVE')
  EXECUTE FUNCTION fn_create_paper_account();

-- ─── 5. verification_runs ────────────────────────────────────────────────────
-- append-only 감사 추적 — 삭제/수정 불가
CREATE TYPE verify_result AS ENUM ('PASS', 'FAIL');

CREATE TABLE IF NOT EXISTS verification_runs (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid          NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  result        verify_result NOT NULL,
  snapshot      jsonb         NOT NULL DEFAULT '{}',   -- 판정 시점 지표 전체
  signed_hash   text,                                  -- HMAC-SHA256(snapshot)
  created_at    timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_runs_eval ON verification_runs (evaluation_id, created_at DESC);

-- ─── 6. rule_violations ──────────────────────────────────────────────────────
CREATE TYPE rule_name AS ENUM (
  'mll',
  'max_drawdown',
  'consistency',
  'profit_goal',
  'min_trading_days'
);

CREATE TABLE IF NOT EXISTS rule_violations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_id uuid        NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
  rule          rule_name   NOT NULL,
  detail        jsonb       NOT NULL DEFAULT '{}',  -- 위반 시점 값 + 임계값
  violated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rule_violations_eval ON rule_violations (evaluation_id, violated_at DESC);
CREATE INDEX idx_rule_violations_rule ON rule_violations (rule, violated_at DESC);

-- ─── 7. subscriptions.beta_invited ───────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS beta_invited boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_subscriptions_beta_invited
  ON subscriptions (beta_invited)
  WHERE beta_invited = true;

-- ─── 8. pf_positions user self-read RLS ──────────────────────────────────────
-- 기존 033 에서 service_role 전용으로 열려있음 → PAPER/FUNDED 유저 read 추가
CREATE POLICY "pf_positions_user_read" ON pf_positions
  FOR SELECT USING (
    account_id IN (
      SELECT id FROM trading_accounts WHERE user_id = auth.uid()
    )
  );

-- ─── 9. pf_fills RLS ─────────────────────────────────────────────────────────
ALTER TABLE pf_fills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pf_fills_service_all" ON pf_fills
  USING (auth.role() = 'service_role');

CREATE POLICY "pf_fills_user_read" ON pf_fills
  FOR SELECT USING (
    account_id IN (
      SELECT id FROM trading_accounts WHERE user_id = auth.uid()
    )
  );
