# Security + Scale Plan (1000+ Concurrent)

## 1) Redis-based Rate Limit Rollout

### Current
- Distributed limiter: DB table (`request_rate_limits`)
- Fallback: in-memory per instance

### Added
- Redis REST backend path (`RATE_LIMIT_REDIS_REST_URL`, `RATE_LIMIT_REDIS_REST_TOKEN`)
- Backend order:
  1. Redis
  2. DB
  3. Local memory fallback

### Production rollout
1. Provision managed Redis (Upstash or equivalent)
2. Set env:
   - `RATE_LIMIT_REDIS_REST_URL`
   - `RATE_LIMIT_REDIS_REST_TOKEN`
   - `RATE_LIMIT_REDIS_PREFIX=stockclaw:rl:prod`
3. Observe 429 rate, latency, fallback hit count
4. Disable DB cleanup cron if Redis-only 운영으로 전환 시 별도 정책 수립

## 2) WAF / Bot Blocking

### Turnstile
- Auth endpoints now can enforce Turnstile when `TURNSTILE_SECRET_KEY` is set.
- Recommended:
  - `TURNSTILE_FAIL_OPEN=false`
  - rotate secret quarterly

### Cloudflare signal usage
- `CF_THREAT_SCORE_ENFORCE=true`
- Start threshold: `CF_THREAT_SCORE_BLOCK_THRESHOLD=35`, then tune to 25~30
- Emergency blocklist: `SECURITY_BLOCKED_IPS` (comma-separated exact IP)

## 3) 1000+ Load Test (k6)

### Script
- `scripts/perf/k6-auth-snapshot.js`
- Run:
```bash
npm run build
npm run preview
BASE_URL=http://127.0.0.1:4173 npm run perf:k6:auth-snapshot
```

### SLO targets
- Error rate: `< 3%`
- p95 latency: `< 800ms`
- p99 latency: `< 1500ms`

### Observe during test
- Node CPU/memory
- PG pool saturation (`PGPOOL_MAX`, wait time)
- Slow query logs and lock wait
- 429 ratio by endpoint

## 4) DB Tuning Runbook

1. Pool sizing
- Start: `PGPOOL_MAX=24`
- For 1000+ concurrent, tune with DB max connections and p95 wait.

2. Index checks
- Ensure hot paths indexed:
  - `sessions (token) WHERE revoked_at IS NULL`
  - `sessions (user_id, expires_at DESC) WHERE revoked_at IS NULL`
  - `auth_nonces (lower(address), created_at DESC)`
  - `request_rate_limits (updated_at)`

3. Query plans
- Weekly `EXPLAIN (ANALYZE, BUFFERS)` for top endpoints:
  - auth login/register/session
  - market snapshot persist path
  - polymarket submit/status

4. Table maintenance
- `request_rate_limits` retention cleanup already in code path (DB fallback mode)
- add scheduled VACUUM/ANALYZE for high churn tables

## 5) External Security Assessment

1. External pentest scope
- Auth/session takeover, replay, CSRF, SSRF, SQLi
- Rate-limit bypass (IP/header/proxy chain)
- API abuse and business-logic flaws

2. Frequency
- Pre-mainnet launch: mandatory
- Post-launch: every quarter + major release

3. Output requirement
- CVSS severity, PoC, reproducible steps, fix validation retest

## 6) Key Rotation Operations

### Keys in scope
- `SECRETS_ENCRYPTION_KEY`
- `TURNSTILE_SECRET_KEY`
- third-party API keys (CMC/FRED/ETHERSCAN/etc)

### Policy
- Rotate every 90 days (or incident-triggered immediate rotation)
- Dual-key window for zero-downtime where possible
- Store in secret manager, never in repo

### Encryption key rotation pattern
1. Introduce `SECRETS_ENCRYPTION_KEY_NEXT`
2. Read old+new, write new
3. Backfill re-encrypt job
4. Switch read to new only
5. Revoke old
