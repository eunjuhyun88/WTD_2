-- Migration 0020: Search Quality Judgements
-- Stores user good/bad verdicts on pattern similarity search candidates.
-- Used by quality_ledger.py to recalibrate Layer A/B/C blend weights.

CREATE TABLE IF NOT EXISTS search_judgements (
  judgement_id   TEXT PRIMARY KEY,
  run_id         TEXT NOT NULL,
  candidate_id   TEXT NOT NULL,
  symbol         TEXT,
  verdict        TEXT NOT NULL,         -- 'good' | 'bad' | 'neutral'
  dominant_layer TEXT,                  -- 'layer_a' | 'layer_b' | 'layer_c'
  layer_a_score  DOUBLE PRECISION,
  layer_b_score  DOUBLE PRECISION,
  layer_c_score  DOUBLE PRECISION,
  final_score    DOUBLE PRECISION,
  user_id        TEXT,
  judged_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sj_run_id    ON search_judgements(run_id);
CREATE INDEX IF NOT EXISTS idx_sj_judged_at ON search_judgements(judged_at DESC);
CREATE INDEX IF NOT EXISTS idx_sj_verdict   ON search_judgements(verdict, dominant_layer);

-- RLS: service role can do anything; authenticated users read their own rows
ALTER TABLE search_judgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access" ON search_judgements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "users_read_own" ON search_judgements
  FOR SELECT TO authenticated USING (user_id = auth.uid()::text);
