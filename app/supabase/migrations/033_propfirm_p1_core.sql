-- W-PF-101: PropFirm P1 Core Schema
-- trading_accounts / pattern_fires / orders / positions / fills / daily_performance

-- ────────────────────────────────────────────────────────────────
-- trading_accounts
-- INTERNAL_RUN (P1 internal, user_id NULL)
-- PAPER        (P2 user eval, user_id NOT NULL)
-- FUNDED       (P3 real HL,  hl_subaccount_addr NOT NULL)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trading_accounts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID REFERENCES app_users(id) ON DELETE SET NULL,  -- NULL for INTERNAL_RUN
  account_type          TEXT NOT NULL CHECK (account_type IN ('INTERNAL_RUN','PAPER','FUNDED')),
  label                 TEXT,                          -- human label (INTERNAL_RUN 식별용)
  mode                  TEXT NOT NULL DEFAULT 'MANUAL'
                          CHECK (mode IN ('INTERNAL_RUN','MANUAL','AUTO','ASSISTED')),
  strategy_id           TEXT,                          -- 'wtd.{pattern_slug}'
  symbols               TEXT[],                        -- whitelist e.g. ARRAY['BTC','ETH','SOL']
  exit_policy           JSONB,                         -- {tp_bps, sl_bps, ttl_min}
  sizing_pct            NUMERIC NOT NULL DEFAULT 0.05, -- equity % per entry
  funded_mode           TEXT CHECK (funded_mode IN ('DISCRETIONARY','STRATEGY_LOCKED')),
  hl_subaccount_addr    TEXT,                          -- FUNDED only
  status                TEXT NOT NULL DEFAULT 'ACTIVE'
                          CHECK (status IN ('ACTIVE','PAUSED','FAILED','TERMINATED')),
  initial_balance       NUMERIC NOT NULL DEFAULT 10000,
  current_equity        NUMERIC NOT NULL DEFAULT 10000,
  realized_pnl          NUMERIC NOT NULL DEFAULT 0,
  unrealized_pnl        NUMERIC NOT NULL DEFAULT 0,
  mll_level             NUMERIC,                       -- initial_balance - max_loss_limit
  max_loss_limit        NUMERIC NOT NULL DEFAULT 1000,
  profit_goal           NUMERIC NOT NULL DEFAULT 3000,
  best_day_realized_pnl NUMERIC NOT NULL DEFAULT 0,
  total_realized_pnl    NUMERIC NOT NULL DEFAULT 0,
  trading_days_count    INT NOT NULL DEFAULT 0,
  winning_days_count    INT NOT NULL DEFAULT 0,
  failure_code          TEXT,
  failed_at             TIMESTAMPTZ,
  passed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_accounts_user
  ON trading_accounts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trading_accounts_strategy
  ON trading_accounts(strategy_id, status);
CREATE INDEX IF NOT EXISTS idx_trading_accounts_type_status
  ON trading_accounts(account_type, status);

ALTER TABLE trading_accounts ENABLE ROW LEVEL SECURITY;

-- INTERNAL_RUN rows: no user_id, no RLS needed (admin only via service role)
-- PAPER/FUNDED: user can only see own rows
CREATE POLICY "ta_self_read" ON trading_accounts
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "ta_service_all" ON trading_accounts
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────
-- pattern_fires
-- Persisted PhaseTransition entry events from patterns/scanner.py
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pattern_fires (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id      UUID,                               -- patterns/scanner run_pattern_scan scan_id
  fired_at         TIMESTAMPTZ NOT NULL DEFAULT now(), -- transition.timestamp
  symbol           TEXT NOT NULL,                      -- 'BTC' | 'ETH' | 'SOL'
  price            NUMERIC,                            -- entry price at fire
  p_win            NUMERIC,                            -- ML p_win
  blocks_triggered TEXT[],                             -- transition.block_scores keys
  confidence       TEXT,                               -- transition.confidence
  strategy_id      TEXT NOT NULL,                      -- 'wtd.{pattern_slug}'
  status           TEXT NOT NULL DEFAULT 'NEW'
                     CHECK (status IN ('NEW','CONSUMED','SKIPPED','EXPIRED')),
  ttl_sec          INT NOT NULL DEFAULT 120,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pattern_fires_status
  ON pattern_fires(status, fired_at);
CREATE INDEX IF NOT EXISTS idx_pattern_fires_strategy
  ON pattern_fires(strategy_id, fired_at);

-- No RLS needed — internal system table, accessed via service role only

-- ────────────────────────────────────────────────────────────────
-- orders
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pf_orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id         UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  user_id            UUID REFERENCES app_users(id) ON DELETE SET NULL,
  source             TEXT NOT NULL
                       CHECK (source IN ('INTERNAL_RUN','USER','AUTO_STRATEGY','ASSISTED_USER')),
  pattern_fire_id    UUID REFERENCES pattern_fires(id),
  intent             TEXT NOT NULL
                       CHECK (intent IN ('ENTRY','EXIT_TP','EXIT_SL','EXIT_TTL','EXIT_MLL','EXIT_USER')),
  parent_position_id UUID,                             -- FK added after positions table
  coin               TEXT NOT NULL,
  side               TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  order_type         TEXT NOT NULL CHECK (order_type IN ('MARKET','LIMIT','CLOSE')),
  qty                NUMERIC NOT NULL,
  price              NUMERIC,                          -- NULL for MARKET
  status             TEXT NOT NULL DEFAULT 'OPEN'
                       CHECK (status IN ('OPEN','FILLED','PARTIAL','CANCELED','REJECTED')),
  hl_oid             BIGINT,                           -- FUNDED only
  filled_qty         NUMERIC NOT NULL DEFAULT 0,
  avg_fill_px        NUMERIC,
  fee                NUMERIC NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  filled_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pf_orders_account
  ON pf_orders(account_id, status);
CREATE INDEX IF NOT EXISTS idx_pf_orders_fire
  ON pf_orders(pattern_fire_id) WHERE pattern_fire_id IS NOT NULL;

ALTER TABLE pf_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_orders_self_read" ON pf_orders
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "pf_orders_service_all" ON pf_orders
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────
-- positions
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pf_positions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  coin             TEXT NOT NULL,
  side             TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  qty              NUMERIC NOT NULL,
  entry_px         NUMERIC NOT NULL,
  mark_px          NUMERIC,
  leverage         NUMERIC NOT NULL DEFAULT 1,
  unrealized_pnl   NUMERIC NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  realized_pnl     NUMERIC,                            -- set on close
  exit_px          NUMERIC                             -- set on close
);

-- back-fill parent_position_id FK on orders
ALTER TABLE pf_orders
  ADD CONSTRAINT fk_pf_orders_position
  FOREIGN KEY (parent_position_id) REFERENCES pf_positions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX IF NOT EXISTS idx_pf_positions_account_open
  ON pf_positions(account_id, status) WHERE status = 'OPEN';

ALTER TABLE pf_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pf_positions_service_all" ON pf_positions
  USING (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────────
-- fills  (individual fill events per order)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pf_fills (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES pf_orders(id) ON DELETE CASCADE,
  account_id  UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  coin        TEXT NOT NULL,
  side        TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  qty         NUMERIC NOT NULL,
  fill_px     NUMERIC NOT NULL,
  fee         NUMERIC NOT NULL DEFAULT 0,
  is_simulated BOOL NOT NULL DEFAULT TRUE,            -- FALSE = HL real fill
  filled_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pf_fills_order
  ON pf_fills(order_id);
CREATE INDEX IF NOT EXISTS idx_pf_fills_account
  ON pf_fills(account_id, filled_at);

-- ────────────────────────────────────────────────────────────────
-- daily_performance  (EOD snapshot per account per day)
-- ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pf_daily_performance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     UUID NOT NULL REFERENCES trading_accounts(id) ON DELETE CASCADE,
  date_utc       DATE NOT NULL,
  realized_pnl   NUMERIC NOT NULL DEFAULT 0,
  fees           NUMERIC NOT NULL DEFAULT 0,
  net_pnl        NUMERIC NOT NULL DEFAULT 0,
  trade_count    INT NOT NULL DEFAULT 0,
  is_trading_day BOOL NOT NULL DEFAULT FALSE,
  is_winning_day BOOL NOT NULL DEFAULT FALSE,         -- net_pnl >= 100 USD
  UNIQUE (account_id, date_utc)
);

CREATE INDEX IF NOT EXISTS idx_pf_daily_account
  ON pf_daily_performance(account_id, date_utc);
