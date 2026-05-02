-- W-0385: Decision Event Ledger
-- Part 1: filter_reason ENUM 확장 (9 → 14 codes)
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'anti_chase';
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'too_late';
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'not_executable';
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'diagnostic_only';
ALTER TYPE filter_reason ADD VALUE IF NOT EXISTS 'manual_skip';

-- Part 2: blocked_candidates에 source/pattern_slug/outcome_id 컬럼 추가
ALTER TABLE blocked_candidates ADD COLUMN IF NOT EXISTS source text DEFAULT 'engine';
ALTER TABLE blocked_candidates ADD COLUMN IF NOT EXISTS pattern_slug text;
ALTER TABLE blocked_candidates ADD COLUMN IF NOT EXISTS outcome_id uuid;

-- Part 3: formula_evidence 신규 테이블
CREATE TABLE IF NOT EXISTS formula_evidence (
  id                    uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_kind            text          NOT NULL,   -- 'pattern' | 'filter_rule' | 'reason_code'
  scope_value           text          NOT NULL,   -- slug / reason code / bucket name
  period_start          timestamptz   NOT NULL,
  period_end            timestamptz   NOT NULL,
  sample_n              int,
  win_rate              real,
  avg_pnl               real,
  blocked_winner_rate   real,
  good_block_rate       real,
  drag_score            real,          -- blocked_winner_rate × avg_missed_pnl (bps)
  avg_missed_pnl        real,
  computed_at           timestamptz   NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_formula_evidence_unique
  ON formula_evidence (scope_kind, scope_value, period_start);

CREATE INDEX IF NOT EXISTS idx_formula_evidence_scope
  ON formula_evidence (scope_kind, scope_value, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_formula_evidence_drag
  ON formula_evidence (drag_score DESC NULLS LAST, computed_at DESC);

ALTER TABLE formula_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON formula_evidence
  FOR ALL USING (auth.role() = 'service_role');
