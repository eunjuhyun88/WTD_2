-- 057_terminal_candidates.sql
-- Stores symbols sent from /lab to WatchlistRail via "cogochi로 보내기" button.
-- Unique per (user_id, symbol, source) — duplicate sends are silently ignored.

CREATE TABLE IF NOT EXISTS terminal_candidates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol      text        NOT NULL,
  source      text        NOT NULL DEFAULT 'lab',
  strategy_id text,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, symbol, source)
);

-- Index for fast per-user lookups (WatchlistRail polls at 30s)
CREATE INDEX IF NOT EXISTS terminal_candidates_user_idx
  ON terminal_candidates(user_id, created_at DESC);
