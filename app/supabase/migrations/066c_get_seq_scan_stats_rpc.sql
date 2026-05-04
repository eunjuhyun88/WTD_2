-- Migration 066c: RPC for seq scan stats (W-0402 PR4)
CREATE OR REPLACE FUNCTION get_seq_scan_stats()
RETURNS TABLE(relname text, seq_scan bigint, seq_tup_read bigint)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT relname::text, seq_scan, seq_tup_read
  FROM pg_stat_user_tables
  ORDER BY seq_scan DESC;
$$;

GRANT EXECUTE ON FUNCTION get_seq_scan_stats() TO service_role;
