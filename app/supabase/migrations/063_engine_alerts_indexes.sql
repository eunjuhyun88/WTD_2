-- Migration 063: engine_alerts 인덱스 추가 (W-0402)
-- 실측: 126MB, 최소 인덱스만 존재 → symbol/timeframe 필터 seq scan
-- 알림 조회 + 승률 기준 정렬 패턴 최적화

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engine_alerts_symbol_tf_scanned
  ON engine_alerts (symbol, timeframe, scanned_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_engine_alerts_pwin_scanned
  ON engine_alerts (p_win DESC, scanned_at DESC);
