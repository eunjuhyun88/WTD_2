-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — GMX V2 On-Chain Perpetual Positions
-- ═══════════════════════════════════════════════════════════════
-- Tracks real on-chain GMX V2 perpetual positions on Arbitrum.
-- Order lifecycle: pending_tx → tx_sent → order_created → executed → closed/failed

CREATE TABLE IF NOT EXISTS gmx_positions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,

  -- Market info
  market_address      text NOT NULL,          -- GM pool token address
  market_label        text NOT NULL,          -- 'ETH/USD', 'BTC/USD'
  direction           trade_direction_enum NOT NULL, -- LONG / SHORT
  collateral_token    text NOT NULL,          -- USDC address on Arbitrum
  collateral_usd      numeric(18,6) NOT NULL, -- collateral amount in USD
  size_usd            numeric(18,6) NOT NULL, -- notional position size
  leverage            numeric(6,2) NOT NULL,  -- 1x-100x

  -- Price tracking
  entry_price         numeric(18,6),
  mark_price          numeric(18,6),
  liquidation_price   numeric(18,6),
  pnl_usd             numeric(18,6),
  pnl_percent         numeric(10,4),

  -- GMX order lifecycle
  order_key           text,                   -- GMX bytes32 order key
  order_type          text NOT NULL DEFAULT 'MarketIncrease',
  order_status        text NOT NULL DEFAULT 'pending_tx',
  -- pending_tx → tx_sent → order_created → executed → failed / cancelled

  -- On-chain references
  tx_hash             text,
  position_key        text,                   -- GMX bytes32 position key
  wallet_address      text NOT NULL,

  -- SL/TP orders (placed as separate GMX orders)
  sl_order_key        text,
  tp_order_key        text,
  sl_price            numeric(18,6),
  tp_price            numeric(18,6),

  -- Timestamps
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now(),
  executed_at         timestamptz,
  closed_at           timestamptz,

  -- Overall status
  status              text NOT NULL DEFAULT 'open'
  -- open / closed / liquidated / failed
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gmx_user_status
  ON gmx_positions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gmx_order_key
  ON gmx_positions (order_key)
  WHERE order_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gmx_position_key
  ON gmx_positions (position_key)
  WHERE position_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gmx_wallet
  ON gmx_positions (wallet_address, status);

-- RLS
ALTER TABLE gmx_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY gmx_positions_user_policy ON gmx_positions
  FOR ALL
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- Extend pnl_source_enum if not already done
DO $$ BEGIN
  ALTER TYPE pnl_source_enum ADD VALUE IF NOT EXISTS 'gmx';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
