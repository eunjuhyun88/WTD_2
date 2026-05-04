-- Migration 066: Enable pg_stat_statements for DB observability (W-0402 PR4)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
-- Reset stats on enable (fresh baseline)
SELECT pg_stat_statements_reset();
