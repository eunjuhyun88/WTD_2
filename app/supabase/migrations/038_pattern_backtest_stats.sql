-- W-0369: pattern_backtest_stats — daily-refreshed backtest cache
-- migration 번호: 038 (037=scan_signal_tables)

CREATE TABLE IF NOT EXISTS pattern_backtest_stats (
  slug             TEXT PRIMARY KEY,
  timeframe        TEXT NOT NULL DEFAULT '1h',
  universe         TEXT NOT NULL DEFAULT 'default',
  n_signals        INTEGER NOT NULL DEFAULT 0,
  win_rate         DOUBLE PRECISION,
  avg_return_72h   DOUBLE PRECISION,
  hit_rate         DOUBLE PRECISION,
  avg_peak_pct     DOUBLE PRECISION,
  sharpe           DOUBLE PRECISION,
  apr              DOUBLE PRECISION,
  equity_curve     JSONB NOT NULL DEFAULT '[]',
  insufficient_data BOOLEAN NOT NULL DEFAULT TRUE,
  since            TIMESTAMPTZ,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pattern_backtest_stats_computed_at
  ON pattern_backtest_stats (computed_at DESC);
