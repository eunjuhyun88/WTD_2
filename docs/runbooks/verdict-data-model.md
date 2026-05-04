# Runbook: Verdict Data Model (W-0402)

## Components

| Component | Location | Schedule |
|---|---|---|
| verdict_streak_history | MATERIALIZED VIEW (Supabase) | REFRESH nightly 03:30 UTC |
| DB health check | engine/jobs/db_health_check.py | daily 04:00 UTC |

## REFRESH failure

**Symptom**: streak badge shows stale data (>24h old)  
**Check**: `SELECT last_refresh FROM pg_stat_user_tables WHERE relname = 'verdict_streak_history'`  
**Fix**: run manually via Supabase SQL editor:
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY verdict_streak_history;
```
**If CONCURRENTLY fails** (unique index missing):
```sql
REFRESH MATERIALIZED VIEW verdict_streak_history;  -- blocks reads briefly
```

## Index rebuild (if Seq Scans appear)

```sql
-- Rebuild index without lock
REINDEX INDEX CONCURRENTLY mv_streak_user_day;
```

## pg_stat_statements reset

```sql
SELECT pg_stat_statements_reset();
```
