-- Migration 065: evaluations active unique constraint (W-PF-202)
-- 한 user가 동시에 ACTIVE evaluation을 2개 이상 가질 수 없음
-- hook CAS 패턴의 동시성 가정을 DB 레벨에서 보장

CREATE UNIQUE INDEX IF NOT EXISTS idx_evaluations_user_active_unique
  ON evaluations (user_id)
  WHERE status = 'ACTIVE';
