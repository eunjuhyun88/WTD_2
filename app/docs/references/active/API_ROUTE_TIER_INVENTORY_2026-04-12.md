# API Route Tier Inventory (2026-04-12)

Purpose:
- classify every current `src/routes/api/**` endpoint into launch tiers A/B/C/D
- make ownership and abuse policy explicit before public launch
- mark which routes were hardened in Phase 0 and which still need follow-up

Primary context:
- `docs/references/active/LAUNCH_LOAD_SECURITY_DESIGN_2026-04-12.md`
- `docs/exec-plans/active/launch-load-security-implementation-plan-2026-04-12.md`
- `docs/generated/api-group-map.md`

## Tier Definitions

- Tier A: cacheable public read. Must prefer edge/CDN cache, normalized cache keys, short origin timeout, and per-IP shared rate limit.
- Tier B: expensive public compute or paid upstream fan-out. Must have edge rate limit, app distributed rate limit, concurrency caps, and degraded fallback.
- Tier C: authenticated user state or money-adjacent action. Must require server-authenticated user context, per-user and per-IP quotas, `no-store` responses for sensitive payloads, and auditability where durable state changes.
- Tier D: privileged control or internal worker execution. Must not ride the general public trust path. Prefer separate control plane or internal-only execution.

## Ownership Domains

- `platform-auth`: auth, session, and secret-bearing account flows
- `market-data`: public market and proxy reads
- `terminal`: terminal intel, scan, and wizard workflows
- `trading`: exchange, GMX, Polymarket, quick-trade, and prediction execution flows
- `profile`: user profile, progression, activity, notifications, and preferences
- `passport-learning`: training, reports, and worker-oriented learning routes
- `cogochi`: Cogochi analysis and assistant endpoints

## Phase 0 Notes

- Hardened in this branch:
  - `/api/wallet/intel`
  - `/api/terminal/intel-agent-shadow`
  - `/api/terminal/intel-policy`
  - `/api/terminal/compare`
  - `/api/terminal/opportunity-scan`
  - `/api/market/snapshot`
  - `/api/wizard`
  - `/api/lab/autorun`
  - `/api/exchange/connect`
  - `/api/exchange/import`
  - `/api/profile/passport/learning/workers/run`
  - `/api/profile/passport/learning/reports/generate`
  - `/api/profile/passport/learning/train-jobs`
- Still requires later phase work:
  - Tier A shared cache promotion to production Redis/edge consistency
  - Tier B queue/worker split for heavy scans and learning jobs
  - Tier D separation onto a privileged/internal control plane

## Inventory

| Routes | Tier | Owner | Access boundary | Abuse policy / notes |
| --- | --- | --- | --- | --- |
| `/api/auth/login`<br>`/api/auth/register`<br>`/api/auth/verify-wallet`<br>`/api/auth/wallet` | C | platform-auth | public entry, server-issued session authority | Turnstile/IP reputation/distributed limiter required; `no-store`; audit auth failures |
| `/api/auth/nonce` | C | platform-auth | public pre-auth bootstrap | very low per-IP quota; short TTL; no cache reuse across users |
| `/api/auth/logout`<br>`/api/auth/session` | C | platform-auth | authenticated session boundary | session-auth only; `no-store`; per-user + per-IP quota |
| `/api/activity`<br>`/api/activity/reaction` | C | profile | authenticated community state | session-auth; per-user quota; audit write paths |
| `/api/chat/messages` | B | cogochi | public or semi-public assistant path | LLM/upstream fan-out; distributed limiter; concurrency cap; degraded fallback |
| `/api/cogochi/analyze`<br>`/api/cogochi/thermometer` | B | cogochi | public heavy analysis | `analyze` hardened in this branch with distributed/IP limiter plus shared-cache-backed normalized `symbol+tf` reads; keep short TTL and protect paid upstreams |
| `/api/cogochi/terminal/message` | B | cogochi | assistant/chat compute | distributed limiter; per-user quota if authenticated; circuit breaker on upstream saturation |
| `/api/coinalyze`<br>`/api/etherscan/onchain`<br>`/api/onchain/cryptoquant`<br>`/api/senti/social`<br>`/api/pnl`<br>`/api/pnl/summary` | B | market-data | public paid-upstream or compute-heavy reads | distributed limiter; edge shielding; provider timeout budget; treat as expensive |
| `/api/coingecko/global`<br>`/api/cycles/klines`<br>`/api/feargreed`<br>`/api/macro/fred`<br>`/api/yahoo/[symbol]` | A | market-data | public cacheable read | edge cache + stale-while-revalidate + per-IP shared quota |
| `/api/macro/indicators` | B | market-data | computed macro aggregation | shared limiter; cache normalized responses; do not let fan-out bypass edge |
| `/api/doctrine`<br>`/api/preferences`<br>`/api/profile`<br>`/api/profile/passport`<br>`/api/progression`<br>`/api/portfolio/holdings` | C | profile | authenticated user profile state | session-auth; per-user quota; `no-store` for user-scoped reads |
| `/api/exchange/analysis` | B | trading | potentially expensive portfolio/exchange compute | session-auth preferred; distributed limiter; do not expose secret-bearing fan-out anonymously |
| `/api/exchange/connect` | C | trading | authenticated secret-bearing exchange credential management | fixed in this branch: session authority only, userId spoofing blocked, `no-store`, distributed/IP limiter |
| `/api/exchange/import` | C | trading | authenticated trade import against stored credentials | fixed in this branch: session authority only, userId spoofing blocked, `no-store`, distributed/IP limiter |
| `/api/gmx/balance`<br>`/api/gmx/markets`<br>`/api/gmx/positions` | C | trading | authenticated money-adjacent reads | session-auth; moderate read quota; `no-store` |
| `/api/gmx/prepare`<br>`/api/gmx/confirm`<br>`/api/gmx/close` | C | trading | authenticated trade execution | session-auth; strict per-user + per-IP quota; idempotency and audit log |
| `/api/lab/autorun` | C | passport-learning | authenticated launch front door only | fixed in this branch: disabled on public origin unless explicitly enabled; still must move to queue/worker plane |
| `/api/lab/forward-walk` | D | passport-learning | heavy experiment execution | treat as internal/privileged until queue/worker plane exists |
| `/api/market/alerts/onchain` | A | market-data | public cacheable alert feed | edge cache; short TTL; per-IP shared quota |
| `/api/market/derivatives/[pair]`<br>`/api/market/events`<br>`/api/market/news`<br>`/api/market/trending` | A | market-data | public market reads | edge cache; stale-while-revalidate; shared rate limit |
| `/api/market/flow` | B | market-data | heavier multi-source aggregation | distributed limiter; normalized cache key; shared cache promotion still needed |
| `/api/market/snapshot` | B | market-data | heavier multi-source aggregation with optional persistence | fixed in this branch: distributed limiter, anonymous shared public route cache/coalescing, and `no-store` for authenticated or persist-capable responses |
| `/api/market/dex/ads`<br>`/api/market/dex/community-takeovers`<br>`/api/market/dex/orders/[chainId]/[tokenAddress]`<br>`/api/market/dex/pairs/[chainId]/[pairId]`<br>`/api/market/dex/search`<br>`/api/market/dex/token-boosts`<br>`/api/market/dex/token-pairs/[chainId]/[tokenAddress]`<br>`/api/market/dex/token-profiles`<br>`/api/market/dex/tokens/[chainId]/[tokenAddresses]` | A | market-data | public dex market reads | cache aggressively at edge; normalize query params; shared per-IP quota |
| `/api/memory/[agentId]` | C | profile | user-scoped or agent-scoped durable state | session-auth; per-user quota; no anonymous access |
| `/api/notifications`<br>`/api/notifications/[id]`<br>`/api/notifications/read` | C | profile | authenticated user notification state | session-auth; per-user quota; `no-store` |
| `/api/polymarket/markets`<br>`/api/polymarket/orderbook` | A | trading | public market reads | edge cache; shared quota; short upstream timeout |
| `/api/positions/polymarket`<br>`/api/positions/polymarket/status/[id]`<br>`/api/positions/unified` | C | trading | authenticated user position state | session-auth; per-user quota; `no-store` |
| `/api/positions/polymarket/auth` | C | trading | authenticated credential bootstrap | session-auth; strict rate limit; `no-store`; encrypt stored secrets |
| `/api/positions/polymarket/prepare`<br>`/api/positions/polymarket/submit`<br>`/api/positions/polymarket/[id]/close` | C | trading | authenticated order execution | session-auth; strict per-user quota; idempotency and audit log |
| `/api/predictions` | A | trading | public or semi-public prediction feed | cache if response is shared; otherwise upgrade to Tier C when user-scoped |
| `/api/predictions/positions/open`<br>`/api/predictions/positions/[id]/close`<br>`/api/predictions/vote` | C | trading | authenticated prediction actions | session-auth; per-user quota; audit money-adjacent actions |
| `/api/profile/passport/learning/datasets`<br>`/api/profile/passport/learning/evals`<br>`/api/profile/passport/learning/reports`<br>`/api/profile/passport/learning/status` | C | passport-learning | authenticated user-scoped learning state | session-auth; per-user quota; `no-store` |
| `/api/profile/passport/learning/reports/generate`<br>`/api/profile/passport/learning/train-jobs` | D | passport-learning | long-running generation/training control | hardened in this branch: creation/generation is disabled on the public web origin by default unless `PASSPORT_LEARNING_CONTROL_WEB_ENABLED=true`; keep off general public trust path |
| `/api/profile/passport/learning/workers/run` | D | passport-learning | worker execution trigger | hardened in this branch: disabled on public web origin by default unless `PASSPORT_WORKER_WEB_ENABLED=true`; still belongs on internal worker/control plane |
| `/api/quick-trades`<br>`/api/quick-trades/prices` | C | trading | authenticated trade and price context | session-auth; per-user quota; `no-store` |
| `/api/quick-trades/open`<br>`/api/quick-trades/[id]/close` | C | trading | authenticated trade execution | strict quota; idempotency; audit |
| `/api/signal-actions`<br>`/api/signals/track` | C | terminal | authenticated signal mutation | session-auth; per-user quota; audit state changes |
| `/api/signals`<br>`/api/signals/[id]` | A | terminal | public or broadly shared signal reads | edge cache if anonymous/shared; if user-scoped, upgrade to Tier C |
| `/api/signals/[id]/convert` | C | terminal | authenticated state conversion | session-auth; per-user quota; audit |
| `/api/terminal/compare`<br>`/api/terminal/opportunity-scan` | B | terminal | public heavy compute | hardened in this branch with distributed/IP abuse guards; `opportunity-scan` now uses the shared public route cache/coalescing path and cache-observable headers, but compare still needs shared cache or queue/caching follow-up |
| `/api/terminal/intel-agent-shadow` | A | terminal | public cacheable heavy read | fixed in this branch: distributed limiter, shared public route cache/coalescing path, and cache-observable headers; Phase 1 still needs full shared cache promotion in production |
| `/api/terminal/intel-agent-shadow/execute` | C | terminal | authenticated execution path | session-auth required; strict quota; audit trade creation |
| `/api/terminal/intel-policy` | B | terminal | compute-heavy terminal policy output | fixed in this branch: shared public route cache/coalescing, cache-observable headers, and degraded fallback; add dedicated distributed limiter only if standalone public traffic grows beyond shadow-driven use |
| `/api/terminal/scan`<br>`/api/terminal/scan/[id]`<br>`/api/terminal/scan/[id]/signals`<br>`/api/terminal/scan/history` | C | terminal | authenticated scan history and user state | session-auth; per-user quota; no anonymous durable writes |
| `/api/ui-state` | C | profile | authenticated UI preference state | session-auth; per-user quota; `no-store` |
| `/api/wallet/intel` | A | terminal | public cacheable heavy read | fixed in this branch: distributed limiter, shared public route cache/coalescing path, and stronger cache policy; Phase 1 still needs full production shared cache promotion |
| `/api/wizard` | C | terminal | authenticated challenge composition | fixed in this branch: auth required, per-user quota, request size guard |

## Launch Blockers Discovered While Classifying

- `/api/profile/passport/learning/workers/run` is still a worker trigger on the general app plane even though it is disabled by default on the public origin. Move it behind the future privileged/internal control plane.
- `/api/profile/passport/learning/reports/generate` and `/api/profile/passport/learning/train-jobs` are now disabled by default on the public origin for write/create triggers, but they still need full queue/control-plane migration once the worker split lands.
- `/api/terminal/compare` still relies on per-instance execution/coalescing behind the new shared abuse guard. It needs shared cache or queue-backed isolation before burst launch.
- `/api/cogochi/analyze`, `/api/market/snapshot` (anonymous `persist=false` GETs), `/api/terminal/intel-policy`, `/api/terminal/opportunity-scan`, `/api/terminal/intel-agent-shadow`, and `/api/wallet/intel` now have shared-cache-capable server paths, but production still needs real Redis/edge cache enablement for the cross-instance benefit to exist.

## Rule

Any new `/api/*` route must declare:
- tier
- owner
- auth boundary
- cache policy
- rate-limit policy

If a route cannot be classified cleanly, default it to the stricter tier and block public exposure until the policy is explicit.
