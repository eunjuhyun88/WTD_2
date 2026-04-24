BEGIN;

ALTER TABLE capture_records
    ADD COLUMN IF NOT EXISTS definition_id TEXT;

ALTER TABLE capture_records
    ADD COLUMN IF NOT EXISTS definition_ref_json JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_capture_records_definition
    ON capture_records (definition_id, captured_at_ms DESC);

COMMENT ON COLUMN capture_records.definition_id IS
    'Canonical pattern definition key (example: tradoor-oi-reversal-v1:v1).';

COMMENT ON COLUMN capture_records.definition_ref_json IS
    'Canonical definition metadata persisted at capture write time.';


ALTER TABLE pattern_outcomes
    ADD COLUMN IF NOT EXISTS pattern_version INTEGER;

ALTER TABLE pattern_outcomes
    ADD COLUMN IF NOT EXISTS definition_id TEXT;

ALTER TABLE pattern_outcomes
    ADD COLUMN IF NOT EXISTS definition_ref JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_pattern_outcomes_definition
    ON pattern_outcomes (pattern_slug, definition_id, created_at DESC);

COMMENT ON COLUMN pattern_outcomes.pattern_version IS
    'Pattern library version active when the outcome was created.';

COMMENT ON COLUMN pattern_outcomes.definition_id IS
    'Canonical pattern definition key for definition-scoped stats/training.';

COMMENT ON COLUMN pattern_outcomes.definition_ref IS
    'Canonical definition metadata persisted at outcome write time.';

COMMIT;
