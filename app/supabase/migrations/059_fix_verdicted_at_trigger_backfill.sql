-- Migration 059: verdicted_at 트리거 수정 + 기존 131행 백필 (W-0402)
-- 문제: 057 트리거는 verdict_json NULL→non-NULL 감지 → 엔진이 Supabase에 verdict_json을 쓰지 않으므로 영구 미작동
-- 수정: status 기반 감지 (verdict_ready/closed 전환) — 엔진은 status를 Supabase에 씀
-- 백필: updated_at 사용 (정확한 verdict 제출 시각 불명 — 최선값)

CREATE OR REPLACE FUNCTION set_verdicted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('verdict_ready', 'closed')
     AND (OLD.status IS NULL OR OLD.status NOT IN ('verdict_ready', 'closed'))
     AND NEW.verdicted_at IS NULL THEN
    NEW.verdicted_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 기존 131행 백필 (updated_at 기준)
UPDATE capture_records
  SET verdicted_at = updated_at
  WHERE status IN ('verdict_ready', 'closed')
    AND verdicted_at IS NULL
    AND updated_at IS NOT NULL;
