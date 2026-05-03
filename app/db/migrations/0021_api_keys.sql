-- Migration 0021: Exchange API Keys
-- Stores encrypted exchange API keys (READ-ONLY keys only).
-- Architecture: D-0005 — server-side AES-256-GCM via SECRETS_ENCRYPTION_KEY.
-- secret_encrypted stores app-layer AES-256-GCM ciphertext (enc:v1:... prefix).
-- Plain-text secret is NEVER returned to the client.

CREATE TABLE IF NOT EXISTS api_keys (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange         text        NOT NULL CHECK (exchange IN ('binance', 'bybit')),
  api_key          text        NOT NULL,
  secret_encrypted text        NOT NULL,
  permissions      jsonb       NOT NULL DEFAULT '[]',
  is_read_only     boolean     GENERATED ALWAYS AS (
    NOT (permissions @> '["trade"]'::jsonb OR permissions @> '["withdraw"]'::jsonb)
  ) STORED,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Unique key per exchange per user (one key per exchange)
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_user_exchange ON api_keys(user_id, exchange);

-- RLS: service role full access; authenticated users manage only their own keys
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON api_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users_manage_own" ON api_keys
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
