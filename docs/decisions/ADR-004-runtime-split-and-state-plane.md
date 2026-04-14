# ADR-004: Runtime Split and State Plane

## Status

Accepted

## Context

The repository now has working public surfaces, root CI, contract drift checks, and early hot-path hardening, but the deploy/runtime model is still under-specified.

Without a runtime split, the same origin can end up serving:

- user-facing web traffic
- high-cost orchestrated reads such as `GET /api/cogochi/analyze`
- background scheduler work
- training/report generation triggers
- queue-like control-plane actions

That is acceptable for local development, but it is not an operationally correct target for 1000+ real users.

## Decision

Adopt a three-plane runtime model plus explicit state-plane separation:

1. `app-web`
   - public SvelteKit origin
   - owns HTML/UI delivery, auth/session, public API orchestration, SSE, and short-lived cached reads
   - may call `engine-api`, Postgres, and Redis-backed shared cache/rate-limit services
   - must not host long-running schedulers, training loops, or background batch/control jobs

2. `engine-api`
   - canonical FastAPI engine compute surface
   - owns deterministic scoring, deep analysis, evaluation, pattern/challenge APIs, and engine-owned schemas
   - does not own browser session/auth concerns
   - remains the only backend truth for engine semantics

3. `worker-control`
   - internal-only runtime for schedulers, queue consumers, report generation, training triggers, and background fan-out jobs
   - may call both `engine-api` and durable app/engine persistence
   - must not be exposed as a public browser origin by default

State-plane responsibilities are fixed as follows:

- Redis: shared hot cache, distributed rate limit, short-lived coordination, in-flight dedupe, ephemeral queue semantics
- Postgres: durable application state, outboxes, reports, job records, audit-relevant persistence, user/domain records
- Local memory / file fallback: development-only resilience layer, never the intended production truth path

Route placement rules:

- Proxy routes may live on `app-web` but stay transport-only.
- Orchestrated public routes may live on `app-web` when they remain thin and explicit about degraded/error modes.
- Engine compute routes live on `engine-api`.
- Scheduler, training, report generation, and worker triggers belong on `worker-control`.

## Consequences

- The public web origin can be scaled for interactive traffic without coupling it to background control-plane spikes.
- Background jobs can be retried, throttled, and isolated without degrading user-facing latency.
- Shared cache and distributed limiter configuration becomes a production requirement, not an optional optimization.
- Routes such as `analyze` must expose explicit degraded/error contracts because they orchestrate multiple upstreams on the public origin.
- Any future work item that moves jobs, schedulers, or training endpoints must reference this ADR.
