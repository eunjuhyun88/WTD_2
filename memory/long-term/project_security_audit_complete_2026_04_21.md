---
name: Security Audit Complete — Full API Surface Hardening
description: Full adversarial security audit across all 121 API routes. 3 commits merged into main via PR #133 (c512b39). 2026-04-21.
type: project
---

Full adversarial security audit merged to main (PR #133, commit c512b39). 2026-04-21.

**Why:** User requested full security sweep + adversarial "if you were going to hack, where would you hack" analysis across the entire API surface.

**How to apply:** Security hardening is complete. Future work touching API routes should follow the established patterns below.

## What was done (3 commits)

### Commit 1 — `security: rate limiting, symbol validation, engine path blocklist`
- `engine/[...path]/+server.ts`: Added `BLOCKED_ENGINE_PATHS` Set (`docs`, `redoc`, `openapi.json`, `metrics`) + `isBlockedPath()` applied to all 4 handlers
- `rateLimit.ts`: Added `douniMessageLimiter` (15/min)
- `market/ohlcv`, `market/funding`, `market/oi`: Added `terminalReadLimiter` + `VALID_SYMBOL = /^[A-Z0-9]{2,20}$/` regex guard
- `market/sparklines`: Added `VALID_SYMBOL` filter on comma-separated list
- `market/news`, `market/trending`, `market/events`, `market/flow`: Added `terminalReadLimiter`
- `cogochi/terminal/message`: Added `douniMessageLimiter` before `request.json()`

### Commit 2 — `security: IDOR fixes, auth guards, rate limits on sensitive endpoints`
- `api/doctrine`: Added `getAuthUserFromCookies` + ownership check (`authUser.id !== userId`) for GET and POST
- `api/memory/[agentId]`: Same auth pattern for GET and POST
- `api/exchange/analysis`: Same auth pattern for GET
- `api/cogochi/outcome`: Added `terminalReadLimiter` on POST (prevents DB flood via `'anon'` bucket)
- `api/lab/forward-walk`: Added `autorunLimiter` (2/min) on POST (expensive backtest computation)
- `api/coinalyze`: Added `terminalReadLimiter` (prevents API key exhaustion)

### Commit 3 — `fix(security): remaining adversarial audit fixes`
- `engine/[...path]/+server.ts`: `isBlockedPath` now uses `.toLowerCase()` — blocks `DOCS`, `REDOC`, `OpenApi.json` case variants
- `patterns/+server.ts` (GET): Added `scanLimiter` (6/min)
- `patterns/scan/+server.ts` (POST): Added `scanLimiter` (6/min) — expensive engine fan-out
- `patterns/states/+server.ts` (GET): Added `terminalReadLimiter` (20/min)
- `patterns/stats/+server.ts` (GET): Added `scanLimiter` (6/min) — parallel fetch for all slugs
- `cogochi/alerts/+server.ts`: `terminalReadLimiter` + `VALID_SYMBOL` on `symbol` param + `Date.parse()` ISO validation on `since`

## False positives confirmed safe
- `cogochi/alerts` SQL: Uses `$N` parameterized queries throughout — no injection risk
- `terminal/message` SSRF: `runtimeConfig.ollamaEndpoint` is received in body but never used for HTTP calls — `ollamaUrl()` only reads `OLLAMA_BASE_URL` from env

## Auth pattern used
```ts
import { getAuthUserFromCookies } from '$lib/server/authGuard.js';
const authUser = await getAuthUserFromCookies(cookies);
if (!authUser) return json({ error: 'Unauthorized' }, { status: 401 });
if (authUser.id !== userId) return json({ error: 'Forbidden' }, { status: 403 });
```
