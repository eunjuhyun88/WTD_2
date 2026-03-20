-- ═══════════════════════════════════════════════════════════════
-- 009: Polymarket on-chain positions
-- ═══════════════════════════════════════════════════════════════
-- Tracks real USDC bets placed via Polymarket CLOB API.
-- Separate from prediction_positions (simulation) to keep
-- on-chain positions with full CLOB lifecycle tracking.

-- Extend pnl_source_enum
ALTER TYPE pnl_source_enum ADD VALUE IF NOT EXISTS 'polymarket';

CREATE TABLE IF NOT EXISTS polymarket_positions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Market info
  market_id       text NOT NULL,
  market_title    text NOT NULL,
  market_slug     text NOT NULL DEFAULT '',
  token_id        text NOT NULL,
  direction       predict_direction_enum NOT NULL,  -- YES / NO

  -- Order details
  side            text NOT NULL CHECK (side IN ('BUY', 'SELL')),
  price           numeric(10,6) NOT NULL CHECK (price > 0 AND price < 1),
  size            numeric(18,6) NOT NULL CHECK (size > 0),
  amount_usdc     numeric(18,6) NOT NULL CHECK (amount_usdc > 0),

  -- CLOB order tracking
  clob_order_id   text,
  order_status    text NOT NULL DEFAULT 'pending_signature'
    CHECK (order_status IN (
      'pending_signature', 'submitted', 'matched',
      'partially_filled', 'filled', 'cancelled', 'failed'
    )),
  filled_size     numeric(18,6) NOT NULL DEFAULT 0,
  avg_fill_price  numeric(10,6),

  -- P&L
  current_price   numeric(10,6),
  pnl_usdc        numeric(18,6),
  settled         boolean NOT NULL DEFAULT false,

  -- Wallet
  wallet_address  text NOT NULL CHECK (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  chain           text NOT NULL DEFAULT 'POLYGON',
  signature       text,
  nonce           text,

  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  settled_at      timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_polymarket_pos_user
  ON polymarket_positions (user_id, settled, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_polymarket_pos_clob_order
  ON polymarket_positions (clob_order_id)
  WHERE clob_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_polymarket_pos_market
  ON polymarket_positions (market_id, user_id);

-- RLS
ALTER TABLE polymarket_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY polymarket_pos_own ON polymarket_positions
  FOR ALL USING (user_id = auth.uid());
