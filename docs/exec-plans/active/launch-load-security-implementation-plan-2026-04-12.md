# Launch Load + Security Implementation Plan

Date: 2026-04-12
Status: active
Scope: `/Users/ej/Projects/maxidoge-clones/CHATBATTLE-load-security-architecture`

## Goal

Turn the approved launch hardening design into a concrete implementation sequence so the app can:

1. survive burst traffic without collapsing the origin
2. isolate expensive work away from the web tier
3. prevent privileged-account theft from becoming full-system compromise

Primary design source:
- `docs/references/active/LAUNCH_LOAD_SECURITY_DESIGN_2026-04-12.md`

## Why This Plan Exists

The design doc established the target topology and the repo-specific blockers. What is still missing is execution order.

Without that order, the likely failure mode is predictable:
- public heavy routes stay online without shared abuse controls
- in-process background jobs remain coupled to the SvelteKit origin
- infrastructure choices get deferred behind feature work
- admin hardening lands too late, after public exposure

This plan prevents that by forcing launch work into explicit gates.

## Non-Negotiable Invariants

1. Do not ship a public launch on `adapter-auto` without an explicit runtime and ingress contract.
2. Do not leave long-running or burst-sensitive jobs in the request-serving web process.
3. Do not expose privileged actions on the same trust path as standard user sessions.
4. Do not treat raw horizontal scaling as a substitute for edge filtering.
5. Do not add new public compute routes until they are assigned a route tier and abuse policy.

## Scope Boundaries

In scope:
- execution plan for infra, API hardening, queue split, and admin-control separation
- repo-facing implementation slices
- launch gates and exit criteria

Out of scope:
- provider-specific Terraform or IaC details
- vendor procurement choices beyond boundary requirements
- feature work unrelated to launch resilience or privileged access

## Workstreams

### W1. Runtime + ingress boundary

Purpose:
- make the production runtime explicit and put edge controls in front of the app

Includes:
- choose production adapter/runtime
- define CDN/WAF/L7 load balancer contract
- add health-check endpoint and deploy expectations
- standardize trusted proxy and real-client-IP handling

Exit criteria:
- production adapter is explicit
- edge path is documented and selected
- app no longer depends on undeclared hosting behavior

### W2. Public API route-tiering + abuse controls

Purpose:
- ensure every public route has a declared cache/limit/compute policy

Includes:
- inventory `/api/*` routes into Tier A/B/C/D
- add distributed rate limit to missing heavy public routes
- normalize cache headers and cache keys for Tier A reads
- define per-user quotas for authenticated heavy paths

Immediate repo targets:
- `src/routes/api/wallet/intel/+server.ts`
- `src/routes/api/terminal/intel-agent-shadow/+server.ts`
- `src/routes/api/wizard/+server.ts`
- any public LLM / scan path exposed from Terminal or Cogochi

Exit criteria:
- no unaudited public compute route remains
- every Tier A/B/C route has explicit abuse control

### W3. Queue / worker split

Purpose:
- remove in-process heavy jobs from the SvelteKit origin

Includes:
- replace in-memory job registries with durable job state
- front heavy routes with enqueue + poll/stream status model
- enforce worker concurrency caps
- keep user-facing web nodes stateless

Immediate repo target:
- `src/routes/api/lab/autorun/+server.ts`

Exit criteria:
- no launch-critical background job depends on one web instance staying alive

### W4. Shared cache + shared limiter promotion

Purpose:
- move hot-read performance and rate limiting out of per-instance memory

Includes:
- Redis primary path for shared rate limiting
- Redis or edge cache for repeatable heavy reads
- incident metrics for cache hit/miss, fallback rate, and 429 ratio

Exit criteria:
- Redis is primary in production, DB/local are fallback only
- public hot reads do not rely on per-instance cache for correctness

### W5. Privileged control-plane split

Purpose:
- ensure admin compromise is containable

Includes:
- separate admin domain or access proxy
- admin SSO + MFA + RBAC
- short-lived privileged sessions
- step-up auth for destructive actions
- session anomaly / revocation rules
- audit logs for privileged actions

Exit criteria:
- normal user session cannot gain admin capability
- privileged access is strongly authenticated and auditable

## Phase Sequence

## Phase 0. Launch blockers

This phase must complete before any real public launch campaign.

### P0-1. Pick explicit production runtime

Why:
- `svelte.config.js` still uses `adapter-auto`

Tasks:
- choose adapter and hosting model intentionally
- document ingress, health checks, deploy shape, and horizontal scaling assumptions
- add a cheap health endpoint if missing

Done when:
- build/deploy target is explicit
- load balancer can reason about app health

### P0-2. Route-tier inventory

Why:
- current protection is inconsistent across public APIs

Tasks:
- classify all `/api/*` endpoints into Tier A/B/C/D
- mark owner and abuse policy per route
- add missing rate limits for public compute routes

Done when:
- route inventory exists in canonical docs
- missing high-risk public routes are patched or blocked

### P0-3. Fix known exposed heavy routes

Tasks:
- protect `/api/wallet/intel` with distributed limiter + cache policy
- protect `/api/terminal/intel-agent-shadow` with distributed limiter + shared cache policy
- move `/api/wizard` behind auth + user quota
- review any equivalent public heavy route exposed by Terminal/Cogochi

Done when:
- anonymous users cannot hammer expensive compute endpoints without shared controls

### P0-4. Disable or rebuild in-process background execution

Tasks:
- remove public launch dependency on `/api/lab/autorun`
- if needed, temporarily gate it behind internal-only access
- design replacement worker queue interface

Done when:
- the public origin is not responsible for long-running experiment execution

## Phase 1. Launch hardening

This phase makes the stack survive the first meaningful burst.

### P1-1. Redis promotion

Tasks:
- provision shared Redis
- set production env for `distributedRateLimit`
- instrument fallback rate

Done when:
- production uses Redis primary path
- fallback to DB/local is observable

### P1-2. Shared cache rollout

Tasks:
- add shared cache for Tier A heavy reads
- standardize TTL, stale-while-revalidate, and cache-key normalization
- add purge strategy for correctness-sensitive paths

Done when:
- repeatable public reads are cheap at scale

### P1-3. Queue / worker implementation

Tasks:
- create durable job schema or queue transport
- change heavy routes to enqueue model
- add job status reads and failure handling
- set worker concurrency and timeout budgets

Done when:
- web tier remains responsive under worker backlog

### P1-4. Incident mode support

Tasks:
- define `EDGE_SHIELD`, `READ_MOSTLY`, `ADMIN_LOCKDOWN`
- document switch procedure and operator owner
- verify low-value public compute can be disabled without taking down the product

Done when:
- the system has degraded modes other than full outage

## Phase 2. Privileged-access isolation

This phase should complete before exposing meaningful money, trading permissions, or production admin actions.

### P2-1. Admin identity boundary

Tasks:
- define admin IdP
- require phishing-resistant MFA
- shorten privileged session TTL
- separate admin auth from consumer auth

Done when:
- admin access no longer rides on normal user session mechanics

### P2-2. RBAC + approval boundaries

Tasks:
- define `viewer`, `support`, `ops`, `security-admin`, `deployment-admin`
- split deploy, secret, and data-access powers
- add dual approval for the highest-risk actions

Done when:
- no single broad admin role can do everything

### P2-3. Session anomaly + revocation

Tasks:
- add IP/UA drift scoring for privileged sessions
- add forced re-auth on suspicious changes
- add global revocation workflow

Done when:
- suspicious privileged sessions are containable in minutes, not hours

### P2-4. Secret management

Tasks:
- move secrets to secret manager/KMS-backed handling
- document rotation workflow and break-glass path
- ensure compromised admin UI access does not disclose raw secrets

Done when:
- privileged UI compromise does not equal total secret compromise

## Recommended Slice Order

If this work is split into implementation PRs, use this order:

1. explicit runtime + health-check + ingress assumptions
2. route-tier inventory doc
3. public heavy-route protection (`wallet/intel`, `intel-agent-shadow`, `wizard`)
4. `lab/autorun` isolation or shutdown
5. Redis promotion + observability
6. queue/worker implementation
7. admin plane and privileged auth hardening

## Validation Gates

Before public launch:
- burst test with edge controls enabled
- verify origin stays healthy under rejected/challenged anonymous load
- verify protected heavy routes return 429/degraded responses instead of timing out
- verify worker backlog does not break normal reads

Before privileged launch:
- verify normal user session cannot call admin actions
- verify privileged session requires MFA and short TTL
- verify revocation works immediately
- verify audit trail exists for privileged actions

## Exit Criteria

This plan is complete when:

1. launch blockers in Phase 0 are closed
2. public heavy routes are tiered and protected
3. no critical long-running job lives in the web origin
4. Redis-backed shared rate limit/cache are live in production
5. privileged control plane is separate from normal user auth

## First Implementation Ticket Set

If execution starts now, the first four tickets should be:

1. `infra/runtime-freeze`
   - replace `adapter-auto` with explicit production adapter and document ingress contract
2. `api/route-tier-inventory`
   - classify `/api/*` routes and mark missing abuse controls
3. `api/public-heavy-route-hardening`
   - add distributed limiter + shared cache policy for `wallet/intel` and `intel-agent-shadow`, auth/quota for `wizard`
4. `workers/remove-lab-autorun-from-origin`
   - stop public in-process background execution and front it with a queue-oriented contract
