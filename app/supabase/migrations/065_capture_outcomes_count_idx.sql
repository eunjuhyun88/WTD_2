-- Migration 065: Index for multi-instance inbox count (W-0402 PR3)
-- Supports: SELECT count FROM capture_records WHERE user_id=? AND status='outcome_ready'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cr_user_status
  ON capture_records (user_id, status)
  WHERE status = 'outcome_ready';
