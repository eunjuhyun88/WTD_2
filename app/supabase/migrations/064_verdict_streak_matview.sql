-- Migration 064: verdict_streak_history VIEW → MATERIALIZED VIEW (W-0402 PR2)
-- digest latency improvement: MATERIALIZED VIEW refreshed nightly vs. live query
DROP VIEW IF EXISTS verdict_streak_history;

CREATE MATERIALIZED VIEW IF NOT EXISTS verdict_streak_history AS
SELECT
  user_id,
  DATE(verdicted_at AT TIME ZONE 'UTC') AS day_utc,
  COUNT(*) AS verdict_count
FROM capture_records
WHERE user_id IS NOT NULL
  AND verdicted_at IS NOT NULL
GROUP BY user_id, DATE(verdicted_at AT TIME ZONE 'UTC');

-- Required for REFRESH CONCURRENTLY (no table lock)
CREATE UNIQUE INDEX IF NOT EXISTS mv_streak_user_day
  ON verdict_streak_history (user_id, day_utc);

GRANT SELECT ON verdict_streak_history TO service_role;
-- Initial population
REFRESH MATERIALIZED VIEW verdict_streak_history;
