-- Migration 024: F-30 Ledger 4-table split
-- Phase 1: Create ledger_verdicts, ledger_outcomes, ledger_entries, ledger_scores
-- Dual-write period: pattern_ledger_records is kept as authoritative until Phase 5.

-- ── ledger_verdicts ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_verdicts (
    id           TEXT PRIMARY KEY,
    capture_id   TEXT NOT NULL,
    pattern_slug TEXT NOT NULL,
    user_id      TEXT NOT NULL,
    verdict      TEXT NOT NULL,  -- valid|invalid|missed|too_late|unclear
    outcome_id   TEXT,
    note         TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lv_user_id_idx    ON ledger_verdicts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lv_capture_id_idx ON ledger_verdicts (capture_id);
CREATE INDEX IF NOT EXISTS lv_outcome_id_idx ON ledger_verdicts (outcome_id);

-- ── ledger_outcomes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_outcomes (
    id              TEXT PRIMARY KEY,
    capture_id      TEXT NOT NULL,
    pattern_slug    TEXT NOT NULL,
    outcome         TEXT NOT NULL,  -- success|failure|timeout|pending
    max_gain_pct    NUMERIC,
    exit_return_pct NUMERIC,
    duration_hours  NUMERIC,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lo_capture_id_idx   ON ledger_outcomes (capture_id);
CREATE INDEX IF NOT EXISTS lo_slug_outcome_idx ON ledger_outcomes (pattern_slug, outcome);

-- ── ledger_entries ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
    id            TEXT PRIMARY KEY,
    capture_id    TEXT NOT NULL,
    pattern_slug  TEXT NOT NULL,
    entry_price   NUMERIC,
    btc_trend     TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS le_capture_id_idx ON ledger_entries (capture_id);

-- ── ledger_scores ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_scores (
    id               TEXT PRIMARY KEY,
    capture_id       TEXT NOT NULL,
    pattern_slug     TEXT NOT NULL,
    p_win            NUMERIC,
    model_key        TEXT,
    threshold        NUMERIC,
    threshold_passed BOOLEAN,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ls_capture_id_idx ON ledger_scores (capture_id);
