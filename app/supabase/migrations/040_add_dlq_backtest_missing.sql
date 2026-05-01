-- W-0368/W-0369: Add missing DLQ and backtest_stats tables

CREATE TABLE IF NOT EXISTS public.scan_signal_events_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_data JSONB NOT NULL,
  error_msg TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dlq_unresolved 
  ON public.scan_signal_events_dlq (created_at DESC)
  WHERE replayed_at IS NULL;

-- Add columns to scan_signal_events for retry tracking
ALTER TABLE public.scan_signal_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Pattern backtest stats cache (matches engine/research/backtest_cache.py)
CREATE TABLE IF NOT EXISTS public.pattern_backtest_stats (
  slug             TEXT NOT NULL,
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
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (slug, timeframe, universe)
);

CREATE INDEX IF NOT EXISTS idx_pbs_computed_at
  ON public.pattern_backtest_stats (computed_at DESC);
