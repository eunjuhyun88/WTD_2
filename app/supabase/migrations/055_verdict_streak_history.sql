-- Migration 055: verdict_streak_history view (W-0401-P1)
-- Aggregates daily verdict counts per user for streak computation.
-- Used by passport endpoint to display streak progress + badge tiers.

CREATE OR REPLACE VIEW verdict_streak_history AS
SELECT
    user_id,
    DATE(created_at AT TIME ZONE 'UTC') AS day_utc,
    COUNT(*)                             AS verdict_count
FROM pattern_ledger_records
WHERE user_id IS NOT NULL
GROUP BY user_id, DATE(created_at AT TIME ZONE 'UTC');

-- Read access for service role
GRANT SELECT ON verdict_streak_history TO service_role;
