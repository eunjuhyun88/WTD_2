-- W-0369: Fix pattern_backtest_stats schema to match backtest_cache.py
-- Migration 040 created this table with wrong column names (pattern_slug, n_trades, cached_at).
-- This migration drops and recreates with the correct schema used by backtest_cache.upsert_stats().

-- Drop wrong schema if created by migration 040
DROP TABLE IF EXISTS public.pattern_backtest_stats;

-- Recreate with correct schema (matches engine/research/backtest_cache.py)
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
