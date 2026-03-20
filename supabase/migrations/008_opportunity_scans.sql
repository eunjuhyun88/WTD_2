-- ═══════════════════════════════════════════════════════════════
-- Stockclaw — Opportunity Scans Table
-- ═══════════════════════════════════════════════════════════════
-- Stores multi-asset opportunity scan results for history tracking

CREATE TABLE IF NOT EXISTS opportunity_scans (
  id            BIGSERIAL PRIMARY KEY,
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  coin_count    INT NOT NULL DEFAULT 0,
  macro_regime  TEXT CHECK (macro_regime IN ('risk-on', 'risk-off', 'neutral')),
  macro_score   REAL DEFAULT 0,
  top_picks     JSONB,       -- [{symbol, score, direction, confidence, reasons}]
  alerts        JSONB,       -- [{symbol, type, severity, message}]
  scan_duration_ms INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for recent scans
CREATE INDEX IF NOT EXISTS idx_opportunity_scans_scanned_at
  ON opportunity_scans (scanned_at DESC);

-- Auto-cleanup: keep 7 days of history
-- (Optional: run periodically via pg_cron or app-level)
COMMENT ON TABLE opportunity_scans IS 'Multi-asset opportunity scan results. Auto-cleanup recommended after 7 days.';
