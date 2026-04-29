-- W-0238: F-12 Korea persona features — kimchi_premium / session_return / oi_normalized_cvd
-- Non-destructive: ADD COLUMN IF NOT EXISTS, existing rows get NULL → filled on next recompute.

ALTER TABLE feature_windows
  ADD COLUMN IF NOT EXISTS kimchi_premium_pct      FLOAT,
  ADD COLUMN IF NOT EXISTS kimchi_premium_7d_mean  FLOAT,
  ADD COLUMN IF NOT EXISTS kimchi_premium_zscore   FLOAT,
  ADD COLUMN IF NOT EXISTS session_return_apac     FLOAT,
  ADD COLUMN IF NOT EXISTS session_return_us       FLOAT,
  ADD COLUMN IF NOT EXISTS session_return_eu       FLOAT,
  ADD COLUMN IF NOT EXISTS session_dominance       TEXT,
  ADD COLUMN IF NOT EXISTS oi_normalized_cvd       FLOAT,
  ADD COLUMN IF NOT EXISTS oi_normalized_cvd_1h    FLOAT;
