-- W-0248: Stripe + x402 billing tier columns
-- Applies to existing user_preferences rows: DEFAULT 'free', no UPDATE.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- x402 pay-per-bundle credits
CREATE TABLE IF NOT EXISTS user_credits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  credit_type     TEXT NOT NULL CHECK (credit_type IN ('x402')),
  bundle_size     INT NOT NULL CHECK (bundle_size > 0),
  remaining       INT NOT NULL DEFAULT 0 CHECK (remaining >= 0),
  expires_at      TIMESTAMPTZ,
  tx_hash         TEXT,
  chain           TEXT NOT NULL DEFAULT 'base',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_user_active
  ON user_credits(user_id)
  WHERE remaining > 0;

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "credits_self_read" ON user_credits;
CREATE POLICY "credits_self_read" ON user_credits
  FOR ALL USING (
    user_id = (SELECT id FROM app_users WHERE id = user_id LIMIT 1)
  );
