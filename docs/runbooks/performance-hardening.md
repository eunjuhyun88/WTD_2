# Performance Hardening

Canonical audit path for validating a 500-concurrent-user operating target before production rollout.

## Goals

- fail fast when runtime posture is unsafe for multi-instance traffic
- audit k6 evidence against explicit p95/p99/error-rate budgets
- keep scheduler and heavy background work off public request runtimes

## 1. Runtime Posture Checks

From the `app/` workspace:

```bash
npm run performance:audit
```

In production, the audit flags:

- missing distributed rate limiting
- missing shared cache backing
- `ENGINE_ENABLE_SCHEDULER=true` on the public runtime

These are high-severity findings for a 500-user target.

## 2. Audit k6 Evidence

Export a k6 summary JSON, then run the matching profile:

```bash
npm run performance:audit -- --profile auth-snapshot-500 --summary ./tmp/auth-snapshot-summary.json
npm run performance:audit -- --profile analyze-500 --summary ./tmp/analyze-summary.json
```

Strict mode fails on `high` or `critical` findings:

```bash
npm run performance:audit -- --strict --profile auth-snapshot-500 --summary ./tmp/auth-snapshot-summary.json
```

## 3. Current 500-User Review Standard

- auth/snapshot profile:
  - `http_req_failed.rate < 0.03`
  - `http_req_duration.p(95) < 800ms`
  - `http_req_duration.p(99) < 1500ms`
  - observed VUs must reach at least `500`
- analyze profile:
  - `http_req_failed.rate < 0.05`
  - `http_req_duration.p(95) < 3000ms`
  - `http_req_duration.p(99) < 4500ms`
  - observed VUs must reach at least `500`

Budget source: [app/scripts/perf/perf-budget.json](/Users/ej/Projects/wtd-v2/app/scripts/perf/perf-budget.json:1)

## 4. Recommended Operating Model

1. keep `app-web` thin and cache-heavy
2. keep `engine-api` stateless and request-bound only
3. move scheduler, replay, research, and long-running calculations to worker/control-plane runtimes
4. use shared Redis-backed rate limiting and cache on public runtimes
5. gate deploys with `performance:audit -- --strict` once staging thresholds stabilize
