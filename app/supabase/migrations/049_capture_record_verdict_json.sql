-- W-0392: capture_records에 verdict_json JSONB 컬럼 추가
-- NULL 허용, 기존 레코드에 영향 없음
ALTER TABLE capture_records
  ADD COLUMN IF NOT EXISTS verdict_json JSONB NULL;

-- SQLite 호환 down migration:
-- ALTER TABLE capture_records DROP COLUMN verdict_json;
