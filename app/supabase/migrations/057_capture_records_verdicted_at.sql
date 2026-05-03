-- Migration 057: capture_records에 verdicted_at 컬럼 추가 (W-0402)
-- verdict 제출 시각 기록용. captured_at_ms는 캡처 시각이므로 다름.
-- 트리거: verdict_json NULL→non-NULL 전환 시 자동 기록 (초기 설계)
-- ※ 059에서 status 기반 트리거로 교체됨 (엔진이 verdict_json을 Supabase에 쓰지 않으므로)

ALTER TABLE capture_records
  ADD COLUMN IF NOT EXISTS verdicted_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION set_verdicted_at()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.verdict_json IS NULL AND NEW.verdict_json IS NOT NULL THEN
    NEW.verdicted_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_capture_records_verdicted_at ON capture_records;
CREATE TRIGGER trg_capture_records_verdicted_at
  BEFORE UPDATE ON capture_records
  FOR EACH ROW EXECUTE FUNCTION set_verdicted_at();
