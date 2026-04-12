-- ═══════════════════════════════════════════════════════════════
-- 016: engine_trade_records + engine_alerts
--
-- trade_records: labeled trade outcomes for LightGBM retraining (L5)
-- engine_alerts: background scanner signals for push notifications (L4)
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ── trade_records ────────────────────────────────────────────────────────────
-- Each row = one closed trade with its SignalSnapshot + outcome label.
-- Accumulates until N≥20 → /train is triggered automatically.

CREATE TABLE IF NOT EXISTS engine_trade_records (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     text        NOT NULL,
  symbol      text        NOT NULL,
  timeframe   text        NOT NULL DEFAULT '4h',
  snapshot    jsonb       NOT NULL,     -- full SignalSnapshot from Python engine
  outcome     smallint    NOT NULL      -- 1=win, 0=loss, -1=timeout/skip
                          CHECK (outcome IN (-1, 0, 1)),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engine_trade_records_user_created
  ON engine_trade_records (user_id, created_at DESC);

ALTER TABLE engine_trade_records ENABLE ROW LEVEL SECURITY;

-- Authenticated users: full CRUD on their own rows
CREATE POLICY etr_user_all ON engine_trade_records
  FOR ALL TO authenticated
  USING (user_id = auth.uid()::text)
  WITH CHECK (user_id = auth.uid()::text);


-- ── engine_alerts ────────────────────────────────────────────────────────────
-- Each row = one scanner hit (symbol triggered N blocks at scan time).
-- Frontend subscribes via Supabase realtime or polls /api/cogochi/alerts.

CREATE TABLE IF NOT EXISTS engine_alerts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol           text        NOT NULL,
  timeframe        text        NOT NULL DEFAULT '4h',
  blocks_triggered text[]      NOT NULL,
  n_blocks         int         NOT NULL GENERATED ALWAYS AS (array_length(blocks_triggered, 1)) STORED,
  snapshot         jsonb,                -- optional SignalSnapshot for context
  p_win            real,                 -- LightGBM score at scan time (null if untrained)
  scanned_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engine_alerts_scanned_at
  ON engine_alerts (scanned_at DESC);

CREATE INDEX IF NOT EXISTS engine_alerts_symbol_scanned
  ON engine_alerts (symbol, scanned_at DESC);

-- Alerts are system-scoped (no user_id). Service role writes; authenticated reads.
ALTER TABLE engine_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY ea_authenticated_read ON engine_alerts
  FOR SELECT TO authenticated USING (true);

COMMIT;
