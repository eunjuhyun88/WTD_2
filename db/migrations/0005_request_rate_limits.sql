BEGIN;

CREATE TABLE IF NOT EXISTS request_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_start_ms bigint NOT NULL,
  hit_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, key_hash, window_start_ms)
);

CREATE INDEX IF NOT EXISTS idx_request_rate_limits_updated_at
  ON request_rate_limits (updated_at);

COMMIT;
