-- Migration 067: verdict_velocity_snapshots table (W-0401-P4)
-- Stores daily per-user rolling 7d verdict count for flywheel measurement.
CREATE TABLE IF NOT EXISTS verdict_velocity_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL,
  snapshot_date date NOT NULL,
  count_7d      int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_vvs_user_date
  ON verdict_velocity_snapshots (user_id, snapshot_date DESC);

GRANT SELECT, INSERT, UPDATE ON verdict_velocity_snapshots TO service_role;
