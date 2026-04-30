-- W-0368: DLQ + retry columns for scan_signal_events
-- Depends on: 037_scan_signal_tables.sql

-- Dead-letter queue for failed signal event inserts
CREATE TABLE IF NOT EXISTS scan_signal_events_dlq (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_data  JSONB NOT NULL,
  error_msg      TEXT,
  attempt_count  INTEGER NOT NULL DEFAULT 3,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  replayed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dlq_unresolved ON scan_signal_events_dlq (created_at DESC)
  WHERE replayed_at IS NULL;

-- Add retry tracking to scan_signal_events
ALTER TABLE scan_signal_events
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error  TEXT;

COMMENT ON TABLE scan_signal_events_dlq IS
  'W-0368: dead-letter queue for scan_signal_events inserts that failed 3 attempts';
