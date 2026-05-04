-- Migration 066b: RPC for top slow queries (W-0402 PR4)
CREATE OR REPLACE FUNCTION get_top_slow_queries(limit_n int DEFAULT 20)
RETURNS TABLE(
  query text,
  calls bigint,
  mean_exec_time_ms float,
  total_exec_time_ms float
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    query,
    calls,
    round((mean_exec_time)::numeric, 2)::float  AS mean_exec_time_ms,
    round((total_exec_time)::numeric, 2)::float AS total_exec_time_ms
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT limit_n;
$$;

GRANT EXECUTE ON FUNCTION get_top_slow_queries(int) TO service_role;
