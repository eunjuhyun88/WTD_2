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

-- Pattern backtest stats cache
CREATE TABLE IF NOT EXISTS public.pattern_backtest_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_slug TEXT NOT NULL UNIQUE,
  equity_curve JSONB,
  apr FLOAT,
  sharpe FLOAT,
  win_rate FLOAT,
  n_trades INTEGER,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pattern_backtest_slug 
  ON public.pattern_backtest_stats (pattern_slug);
