-- Migration 062: phase_transitions 인덱스 추가 (W-0402)
-- 실측: 44,902행 165MB, pkey만 존재 → 모든 조회가 seq scan
-- symbol/pattern_slug 기준 시계열 조회 패턴 최적화

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phase_transitions_symbol_slug_time
  ON phase_transitions (symbol, pattern_slug, transitioned_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phase_transitions_slug_time
  ON phase_transitions (pattern_slug, transitioned_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phase_transitions_symbol_time
  ON phase_transitions (symbol, transitioned_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_phase_transitions_scan_id
  ON phase_transitions (scan_id);
