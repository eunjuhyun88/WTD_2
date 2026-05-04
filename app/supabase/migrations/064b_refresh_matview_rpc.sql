-- Migration 064b: RPC for REFRESH MATERIALIZED VIEW CONCURRENTLY (W-0402 PR2)
-- Called by engine nightly job. service_role only.
CREATE OR REPLACE FUNCTION refresh_verdict_streak_matview()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY verdict_streak_history;
END;
$$;

GRANT EXECUTE ON FUNCTION refresh_verdict_streak_matview() TO service_role;
