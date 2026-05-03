-- Migration 061: pattern_ledger_records 누락 인덱스 복구 (W-0402)
-- 실측: migration 018 정의 인덱스가 Supabase에 미적용 상태 (pkey만 존재)
-- plr_slug_type_created_idx + plr_slug_created_idx 재생성 + user/type 복합 추가

CREATE INDEX CONCURRENTLY IF NOT EXISTS plr_slug_type_created_idx
  ON pattern_ledger_records (pattern_slug, record_type, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS plr_slug_created_idx
  ON pattern_ledger_records (pattern_slug, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pattern_ledger_user_type_created
  ON pattern_ledger_records (user_id, record_type, created_at DESC)
  WHERE user_id IS NOT NULL;
