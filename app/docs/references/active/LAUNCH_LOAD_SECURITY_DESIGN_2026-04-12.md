# Launch Load + Security Design (2026-04-12)

Purpose:
- Define how Cogochi/ChatBattle should survive launch-day burst traffic and prevent privileged-account takeover from becoming full-system compromise.
- Convert the current repo's partial protections into a deployable operating model.

## 1. Why This Exists

Two launch failures matter more than most feature defects:

1. Burst traffic collapses the origin.
2. A stolen privileged account becomes total system control.

For this repo, both risks are real because the current code already has public compute routes, partial rate limiting, and some single-instance in-memory behavior.

Important framing:
- "Thousands to tens of millions of requests in 10 seconds" is not a normal scaling problem.
- It is an edge filtering problem first, an origin scaling problem second.
- If that traffic reaches the SvelteKit origin unchecked, load balancing alone will not save the app.

## 2. Current-State Readout From This Repo

Relevant code already in place:
- `src/lib/server/distributedRateLimit.ts`
  - Redis REST -> DB table -> local memory fallback exists.
- `src/lib/server/authSecurity.ts`
  - IP reputation, distributed rate limit, and Turnstile verification exist.
- `src/lib/server/ipReputation.ts`
  - Cloudflare threat score and static blocklist support exist.
- `src/hooks.server.ts`
  - Basic CSP / security headers / origin guard path exists.
- `src/lib/server/authRepository.ts`, `src/lib/server/session.ts`
  - Session is server-validated and DB-backed.

High-risk gaps visible in current code:
- Protection is concentrated on auth and a few heavy routes, not the whole public API surface.
- `src/routes/api/lab/autorun/+server.ts`
  - Uses in-memory job state.
  - Starts background work from the web process.
  - Has no auth, quota, or queue isolation.
- `src/routes/api/wallet/intel/+server.ts`
  - Public compute path with cache headers but no abuse guard.
- `src/routes/api/terminal/intel-agent-shadow/+server.ts`
  - Public compute path with per-instance in-memory cache only.
- `src/routes/api/wizard/+server.ts`
  - Doc already states auth/quota is deferred.
- `svelte.config.js`
  - Still uses `adapter-auto`, so production runtime and load-balancer contract are not yet explicit.

Security-control gap:
- There is no explicit privileged control plane model in this repo yet.
- Session binding hardening was already called out as open in `docs/references/active/BACKEND_SECURITY_REVIEW_2026-02-25.md`.

## 3. Non-Negotiable Launch Principles

1. The origin must be stateless and disposable.
2. Edge must absorb anonymous bursts before they reach Node.
3. Expensive work must be queued or cached, never done inline on a public route without guardrails.
4. End-user auth and operator/admin auth are different trust zones.
5. A stolen admin session must not directly imply database, secret, or deployment control.

## 4. Target Runtime Topology

```text
Internet
  -> DNS + CDN + WAF + Bot challenge + global rate limits
  -> L7 load balancer
  -> Stateless SvelteKit web instances (2+ per region minimum)
     -> Redis (global rate limit + hot cache + short-lived coordination)
     -> Postgres/Supabase (system of record)
     -> Queue / worker plane (async jobs, WTD orchestration, reports, retraining)
     -> External providers (market data, wallet intel, WTD backend)

Privileged operators
  -> separate admin domain / VPN / access proxy
  -> IdP SSO + phishing-resistant MFA + device trust
  -> admin app / ops endpoints
  -> audited just-in-time privileged actions
```

## 5. Traffic Handling Design

### 5.1 Edge First, Not Origin First

Required before launch:
- Put the app behind CDN + WAF + bot management.
- Enforce L3/L4 DDoS protection and L7 rate limiting at the provider edge.
- Use challenge pages or Turnstile escalation for anonymous spikes.
- Block or challenge high-threat-score traffic before it reaches SvelteKit.

Launch rule:
- Anonymous burst traffic must die at the edge.
- Authenticated user traffic should be admitted on stricter but user-aware quotas.

### 5.2 Route Tiers

Define every API route into one of four tiers.

| Tier | Examples | Policy |
|---|---|---|
| A: cacheable public read | `/api/wallet/intel`, `/api/terminal/intel-agent-shadow` | CDN cache, stale-while-revalidate, per-IP edge quota, short origin timeout |
| B: expensive public compute | `/api/cogochi/chat`, `/api/cogochi/scan`, future public search APIs | edge rate limit, app rate limit, concurrency cap, circuit breaker, degraded fallback |
| C: authenticated write / user state | `/api/terminal/scan`, `/api/market/snapshot` persist path, trading routes | session auth, per-user + per-IP quota, idempotency where applicable, audit trail |
| D: privileged control | deploy hooks, retraining controls, admin moderation, secret rotation | separate admin plane only, no exposure on main public domain |

Immediate route promotions for this repo:
- Promote `/api/wallet/intel` to Tier A with distributed rate limit and cache-key normalization.
- Promote `/api/terminal/intel-agent-shadow` to Tier A with edge cache plus distributed rate limit.
- Promote `/api/wizard` to Tier C with auth + per-user quota.
- Remove `/api/lab/autorun` from public web-plane execution. Rebuild as Tier C front door + async worker queue.

### 5.3 Stateless Web Tier

Required properties:
- Minimum 2 web instances in production.
- No request-critical state in process memory.
- No background jobs that only exist inside one web instance.
- No reliance on sticky sessions for correctness.

Repo implication:
- `intel-agent-shadow` in-memory cache can remain as a best-effort micro-cache, but correctness must come from Redis/CDN, not process memory.
- `lab/autorun` job state must leave `_jobs` in memory and move to durable storage or queue status rows.

### 5.4 Async Isolation

Move long or burst-sensitive work out of the request path:
- AutoResearch runs
- WTD challenge creation / evaluation
- training jobs
- report generation
- any wallet graph expansion that fans out across providers

Pattern:
1. Web route validates auth, quota, and payload.
2. Web route enqueues a job.
3. Worker consumes with bounded concurrency.
4. Client polls or subscribes to job status.

This is the single most important reliability change in the repo because it prevents one hot route from pinning the origin CPU.

### 5.5 Caching Strategy

Use three cache layers:

1. Edge CDN cache
  - public GETs
  - short TTL, `stale-while-revalidate`
2. Redis hot cache
  - normalized heavy responses
  - shared across instances
3. In-process micro-cache
  - optional only for tail-latency reduction
  - never authoritative

Minimum cache candidates from current routes:
- `/api/wallet/intel`
- `/api/terminal/intel-agent-shadow`
- `/api/market/snapshot` for non-persisted reads

### 5.6 Load Balancer Contract

Required configuration:
- health checks against a cheap endpoint
- fast fail on unhealthy instances
- connection timeout lower than provider retry storm threshold
- keepalive tuned for burst traffic
- zero-downtime rolling deploy

If SSE/stream routes become core traffic:
- place them on separate worker pools or separate route class
- tune idle timeout independently from normal JSON endpoints

### 5.7 Database Protection

Load balancing fails if Postgres saturates first.

Required controls:
- connection pooling with explicit max
- hot-path indexes reviewed regularly
- read-heavy cache in front of repeatable responses
- queue workers bounded so background jobs cannot starve user traffic
- write shedding under incident mode

## 6. Admin / Privileged Access Design

### 6.1 Separate Control Plane

Do not run admin actions from the same trust path as normal user sessions.

Required:
- separate admin hostname or access proxy
- separate auth policy from consumer auth
- no admin capability inferred from a normal `wtd_session`

### 6.2 Identity Requirements

Privileged access must require:
- SSO through centralized IdP
- phishing-resistant MFA passkeys or hardware keys
- device trust or managed-device policy
- short session lifetime
- step-up re-auth for destructive actions

### 6.3 Role Model

Minimum roles:
- `viewer`
- `support`
- `ops`
- `security-admin`
- `deployment-admin`

Rules:
- least privilege by default
- split deployment power from data-access power
- split secret-rotation power from content-moderation power
- dual approval for the highest-risk actions

### 6.4 Session Hardening

Add the missing session-binding controls already identified in the security review:
- IP / user-agent drift scoring
- forced re-auth on suspicious session movement
- impossible-travel / ASN anomaly alerting where available
- immediate global session revocation for privileged users

### 6.5 Secret and Infra Isolation

Privileged-account theft must not yield raw production secrets.

Required:
- move secrets to secret manager / KMS-backed storage
- rotate app and provider keys on 90-day or incident schedule
- no shared human access to production DB passwords
- break-glass procedure stored separately and audited

### 6.6 Auditability

Every privileged action must emit:
- actor identity
- role used
- action target
- before/after summary
- source IP / device context
- ticket or reason

## 7. Incident Degradation Modes

The app must not have only two modes: "normal" and "down."

Define three emergency modes:

1. `EDGE_SHIELD`
  - tighten WAF
  - challenge anonymous traffic
  - disable low-value public compute
2. `READ_MOSTLY`
  - disable expensive writes and background launch paths
  - keep landing, dashboard reads, and cached public intel alive
3. `ADMIN_LOCKDOWN`
  - revoke privileged sessions
  - block admin plane except break-glass accounts
  - rotate secrets and deployment tokens

## 8. Concrete Repo Changes Required

### Phase 0: before any public launch

1. Pick an explicit production adapter/runtime.
  - `adapter-auto` is not enough for launch operations.
2. Put CDN/WAF/bot management in front of the app.
3. Configure Redis as the primary shared rate-limit backend.
4. Add route inventory and classify all `/api/*` endpoints into the four tiers.
5. Lock down or remove `src/routes/api/lab/autorun/+server.ts` from the public plane.
6. Add auth + quota to `src/routes/api/wizard/+server.ts`.
7. Add distributed rate limit to public compute routes such as wallet intel and intel shadow.

### Phase 1: before high-traffic launch

1. Move long-running work to queue + worker.
2. Add Redis-backed shared cache for Tier A reads.
3. Add per-user quotas for authenticated heavy routes.
4. Add global concurrency caps for WTD-facing operations.
5. Add admin SSO, MFA, RBAC, and short-lived privileged sessions.

### Phase 2: before money or real user assets are at risk

1. Separate admin plane domain and network policy.
2. Add session anomaly detection and privileged re-auth.
3. Add secret manager / KMS rotation workflow.
4. Run external pentest and launch game-day exercises.

## 9. Validation Gates

Traffic:
- k6 or equivalent tests for Tier A/B/C routes
- burst test with edge enabled and edge disabled
- verify origin survives by shedding, not by heroic scaling

Security:
- privileged login requires MFA and short TTL
- normal user session cannot call privileged routes
- session revocation is immediate for privileged accounts
- secret rotation drill passes without downtime

Reliability:
- worker failure does not kill web traffic
- one web instance can die without user-visible outage
- one provider dependency can fail without cascading 500 storm

## 10. Decision Summary

For this repo, launch readiness is not "add a load balancer."

It is:
- edge filtering first
- stateless web tier second
- async worker isolation third
- separate privileged control plane throughout

If those four are in place, burst traffic becomes survivable and admin compromise becomes containable.
If they are not, the app remains one incident away from public failure.
