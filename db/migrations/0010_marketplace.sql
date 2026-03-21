-- ═══════════════════════════════════════════════════════════════
-- Migration 0010: Marketplace + Track Records
-- Agent rental/subscription + on-chain commit hashes
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  plan TEXT NOT NULL CHECK (plan IN ('SIGNAL','AUTO','PREMIUM')),
  price_usd NUMERIC NOT NULL CHECK (price_usd > 0),
  max_renters INTEGER DEFAULT 10,
  active_renters INTEGER DEFAULT 0,
  archetype TEXT,
  total_battles INTEGER DEFAULT 0,
  win_rate NUMERIC DEFAULT 0,
  sharpe_ratio NUMERIC,
  max_drawdown NUMERIC,
  track_record_hash TEXT,
  description TEXT,
  active BOOLEAN DEFAULT true,
  delisted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listings_active ON agent_listings(active) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_listings_user ON agent_listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_plan ON agent_listings(plan);

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES agent_listings(id),
  renter_id UUID NOT NULL,
  plan TEXT NOT NULL,
  amount_paid NUMERIC,
  currency TEXT DEFAULT 'USDC',
  started_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active','expired','cancelled','refunded')),
  cancelled_at TIMESTAMPTZ,
  refund_amount NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subs_renter ON subscriptions(renter_id);
CREATE INDEX IF NOT EXISTS idx_subs_listing ON subscriptions(listing_id);
CREATE INDEX IF NOT EXISTS idx_subs_active ON subscriptions(status) WHERE status = 'active';

-- On-chain track record commits (ERC-8004 pattern)
CREATE TABLE IF NOT EXISTS track_record_commits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  scenario_id TEXT NOT NULL,
  commit_hash TEXT NOT NULL,
  commit_payload JSONB NOT NULL,
  result_hash TEXT,
  result_payload JSONB,
  outcome TEXT,
  tx_hash TEXT,
  block_number BIGINT,
  chain TEXT DEFAULT 'base',
  committed_at TIMESTAMPTZ DEFAULT now(),
  revealed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_track_agent ON track_record_commits(agent_id);
CREATE INDEX IF NOT EXISTS idx_track_user ON track_record_commits(user_id);
CREATE INDEX IF NOT EXISTS idx_track_commit ON track_record_commits(commit_hash);
