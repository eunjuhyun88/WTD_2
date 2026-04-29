-- W-0239: F-13 Telegram Bot connect codes + per-user chat_id storage

CREATE TABLE IF NOT EXISTS telegram_connect_codes (
    code        TEXT PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '10 minutes',
    used        BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tcc_expires ON telegram_connect_codes (expires_at);

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;
