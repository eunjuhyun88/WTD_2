-- W-0404 PR5: daily quota tracking + extend tier constraint for 'team'

-- Extend tier constraint to include 'team'
ALTER TABLE user_preferences DROP CONSTRAINT IF EXISTS user_preferences_tier_check;
ALTER TABLE user_preferences ADD CONSTRAINT user_preferences_tier_check
  CHECK (tier IN ('free', 'pro', 'team'));

-- Daily message quota per user
CREATE TABLE IF NOT EXISTS agent_quota_daily (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT CURRENT_DATE,
  msg_count   integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_agent_quota_user_date
  ON agent_quota_daily (user_id, date);

ALTER TABLE agent_quota_daily ENABLE ROW LEVEL SECURITY;

-- Users can read their own quota
CREATE POLICY "quota_select_own" ON agent_quota_daily
  FOR SELECT USING (auth.uid() = user_id);

-- Service role (backend) can insert/update
CREATE POLICY "quota_service_write" ON agent_quota_daily
  FOR ALL USING (true) WITH CHECK (true);
