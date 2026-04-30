-- W-0365: add realized P&L fields to ledger_outcomes
-- Existing columns preserved (W-0233 PR #767 compat)
ALTER TABLE ledger_outcomes
  ADD COLUMN IF NOT EXISTS entry_px             NUMERIC,
  ADD COLUMN IF NOT EXISTS entry_side           SMALLINT,        -- +1 long / -1 short
  ADD COLUMN IF NOT EXISTS exit_px              NUMERIC,
  ADD COLUMN IF NOT EXISTS exit_reason          TEXT,            -- 'target'|'stop'|'timeout'|'indeterminate_gap'|'manual'
  ADD COLUMN IF NOT EXISTS fee_bps_total        NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS slippage_bps_total   NUMERIC DEFAULT 5,
  ADD COLUMN IF NOT EXISTS pnl_bps_gross        NUMERIC,
  ADD COLUMN IF NOT EXISTS pnl_bps_net          NUMERIC,
  ADD COLUMN IF NOT EXISTS pnl_pct_net          NUMERIC,
  ADD COLUMN IF NOT EXISTS holding_bars         INTEGER,
  ADD COLUMN IF NOT EXISTS holding_seconds      INTEGER,
  ADD COLUMN IF NOT EXISTS mfe_bps              NUMERIC,
  ADD COLUMN IF NOT EXISTS mae_bps              NUMERIC,
  ADD COLUMN IF NOT EXISTS pnl_verdict          TEXT CHECK (pnl_verdict IN ('WIN','LOSS','INDETERMINATE'));

CREATE INDEX IF NOT EXISTS idx_lo_pattern_verdict
  ON ledger_outcomes(pattern_slug, pnl_verdict);
