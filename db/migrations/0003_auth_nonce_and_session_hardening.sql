BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF to_regclass('public.sessions') IS NULL THEN
    RAISE EXCEPTION 'sessions table is required before running 0003_auth_nonce_and_session_hardening';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS auth_nonces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  nonce text NOT NULL,
  message text NOT NULL,
  provider text,
  issued_ip inet,
  user_agent text,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (address ~ '^0x[0-9a-fA-F]{40}$'),
  CHECK (char_length(nonce) BETWEEN 16 AND 128),
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_address_created_at
  ON auth_nonces (lower(address), created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_auth_nonces_active_address_nonce
  ON auth_nonces (lower(address), nonce)
  WHERE consumed_at IS NULL;

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address inet;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sessions_active_token
  ON sessions (token)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_active_expires
  ON sessions (user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

DO $$
DECLARE
  relkind "char";
BEGIN
  SELECT c.relkind
  INTO relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'auth_sessions';

  IF relkind IS NULL THEN
    EXECUTE
      'CREATE VIEW auth_sessions AS
         SELECT
           id,
           token AS session_token,
           user_id,
           user_agent,
           ip_address,
           created_at,
           expires_at,
           revoked_at
         FROM sessions';
  ELSIF relkind = 'v' THEN
    EXECUTE
      'CREATE OR REPLACE VIEW auth_sessions AS
         SELECT
           id,
           token AS session_token,
           user_id,
           user_agent,
           ip_address,
           created_at,
           expires_at,
           revoked_at
         FROM sessions';
  END IF;
END
$$;

COMMIT;
