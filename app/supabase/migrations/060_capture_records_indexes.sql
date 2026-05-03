-- Migration 060: capture_records 누락 인덱스 추가 (W-0402)
-- 실측: pkey만 존재, 조회 패턴에 필요한 복합 인덱스 전무
-- inbox count, streak 조회, status 필터링 성능 보장

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_capture_records_user_status_updated
  ON capture_records (user_id, status, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_capture_records_user_verdicted
  ON capture_records (user_id, verdicted_at DESC)
  WHERE verdicted_at IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_capture_records_status_updated
  ON capture_records (status, updated_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_capture_records_definition_captured
  ON capture_records (definition_id, captured_at_ms DESC);
