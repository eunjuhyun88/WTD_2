-- W-0305: D2 NSM WVPL — per-user weekly verified pattern loops aggregate
-- Source of truth: engine/observability/wvpl_aggregator.py (Sunday 23:55 KST upsert)

CREATE TABLE IF NOT EXISTS user_wvpl_weekly (
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    week_start  DATE NOT NULL,           -- KST Sunday (date-only; engine emits week.date())
    loop_count  INTEGER NOT NULL DEFAULT 0,
    capture_n   INTEGER NOT NULL DEFAULT 0,
    search_n    INTEGER NOT NULL DEFAULT 0,
    verdict_n   INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, week_start)
);

CREATE INDEX IF NOT EXISTS user_wvpl_weekly_user_week
    ON user_wvpl_weekly (user_id, week_start DESC);

ALTER TABLE user_wvpl_weekly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wvpl_self_read" ON user_wvpl_weekly;
CREATE POLICY "wvpl_self_read"
    ON user_wvpl_weekly FOR SELECT
    USING (auth.uid() = user_id);

-- Service role (engine aggregator) writes via SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS by design — no INSERT/UPDATE policy needed.
