-- W-0160: Add definition scope columns to capture_records.
-- These were added to the engine SQLite schema in W-0160 but the Supabase replica
-- was missing them, causing non-fatal upsert failures on every capture save.
--
-- definition_id:       canonical pattern definition key (e.g. "bull_flag:v3")
-- definition_ref_json: full definition ref payload as JSONB
-- research_context_json: optional research context attached at capture time

ALTER TABLE capture_records
    ADD COLUMN IF NOT EXISTS definition_id         TEXT,
    ADD COLUMN IF NOT EXISTS definition_ref_json   JSONB NOT NULL DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS research_context_json JSONB;

-- Mirror the engine-side index for definition-scoped queries.
CREATE INDEX IF NOT EXISTS idx_capture_records_definition
    ON capture_records (definition_id, captured_at_ms DESC);
