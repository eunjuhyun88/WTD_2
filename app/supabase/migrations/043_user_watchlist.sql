-- 043: user_watchlist — per-user symbol list with ordering
CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);
CREATE INDEX user_watchlist_user_pos_idx ON user_watchlist(user_id, position);
ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_watchlist_select_own" ON user_watchlist
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_watchlist_modify_own" ON user_watchlist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
