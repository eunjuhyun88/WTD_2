-- ═══════════════════════════════════════════════════════════════
-- 0013: capture_records — pattern capture lifecycle table
--
-- Mirrors the engine SQLite schema (engine/state/pattern_capture.sqlite)
-- for Supabase-side querying, Verdict Inbox UI, and chart annotation.
--
-- Design:
--   - Engine SQLite = source of truth for outcome resolution lifecycle.
--   - Supabase = read/query layer for UI (Verdict Inbox, chart overlays).
--   - Engine writes via service-role key; users read their own rows.
--   - chart_context_json and block_scores_json stored as JSONB for queries.
--   - RLS: service_role bypasses; authenticated users see own rows only;
--     auto-captured rows (user_id = 'auto') visible to all authenticated.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS capture_records (
    capture_id              TEXT        PRIMARY KEY,
    capture_kind            TEXT        NOT NULL,  -- pattern_candidate | manual_hypothesis | chart_bookmark | post_trade_review
    user_id                 TEXT,                  -- 'auto' for engine-originated
    symbol                  TEXT        NOT NULL,
    pattern_slug            TEXT        NOT NULL,
    pattern_version         INTEGER     NOT NULL DEFAULT 1,
    phase                   TEXT        NOT NULL,
    timeframe               TEXT        NOT NULL,
    captured_at_ms          BIGINT      NOT NULL,
    candidate_transition_id TEXT,
    candidate_id            TEXT,
    scan_id                 TEXT,
    user_note               TEXT,
    chart_context_json      JSONB       NOT NULL DEFAULT '{}',
    feature_snapshot_json   JSONB,
    block_scores_json       JSONB       NOT NULL DEFAULT '{}',
    verdict_id              TEXT,
    outcome_id              TEXT,
    status                  TEXT        NOT NULL,  -- pending_outcome | outcome_ready | verdict_ready | terminal
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_capture_records_transition
    ON capture_records (candidate_transition_id)
    WHERE candidate_transition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capture_records_user_time
    ON capture_records (user_id, captured_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_capture_records_pattern_symbol
    ON capture_records (pattern_slug, symbol, timeframe);

CREATE INDEX IF NOT EXISTS idx_capture_records_status
    ON capture_records (status);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_capture_records_updated_at ON capture_records;
CREATE TRIGGER trg_capture_records_updated_at
    BEFORE UPDATE ON capture_records
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE capture_records ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS implicitly in Supabase.
-- Authenticated: see own rows + auto-captured rows (user_id = 'auto').
CREATE POLICY capture_records_select ON capture_records
    FOR SELECT TO authenticated
    USING (user_id = auth.uid()::text OR user_id = 'auto');

-- Anon: no access.
-- (no policy = deny for anon)

-- ── Comments ─────────────────────────────────────────────────────────────────

COMMENT ON TABLE capture_records IS
    'Pattern capture lifecycle records. Engine SQLite is write-primary; '
    'this table is the Supabase read/query replica for UI and analytics.';

COMMENT ON COLUMN capture_records.capture_kind IS
    'pattern_candidate | manual_hypothesis | chart_bookmark | post_trade_review';

COMMENT ON COLUMN capture_records.status IS
    'pending_outcome → outcome_ready → verdict_ready | terminal';

COMMENT ON COLUMN capture_records.user_id IS
    '''auto'' for engine-originated captures; auth.uid() for user captures';

COMMENT ON COLUMN capture_records.chart_context_json IS
    'Serialized ChartContextSnapshot: price, levels, entry_price, stop, tp1, tp2, eval_window_ms';

COMMENT ON COLUMN capture_records.block_scores_json IS
    'Map of building_block_id → score float (0.0–1.0)';

COMMIT;
