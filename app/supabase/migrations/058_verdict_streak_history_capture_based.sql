-- Migration 058: verdict_streak_history를 capture_records 기반으로 재정의 (W-0402)
-- 기존 view: pattern_ledger_records record_type='verdict' 기반 → 0행 (미연결)
-- 신규 view: capture_records WHERE verdicted_at IS NOT NULL 기반 → 131행 실측

DROP VIEW IF EXISTS verdict_streak_history;

CREATE VIEW verdict_streak_history AS
SELECT
  user_id,
  DATE(verdicted_at AT TIME ZONE 'UTC') AS day_utc,
  COUNT(*) AS verdict_count
FROM capture_records
WHERE user_id IS NOT NULL
  AND verdicted_at IS NOT NULL
GROUP BY user_id, DATE(verdicted_at AT TIME ZONE 'UTC');

GRANT SELECT ON verdict_streak_history TO service_role;
