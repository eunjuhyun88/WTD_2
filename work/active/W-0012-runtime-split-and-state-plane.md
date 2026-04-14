# W-0012 Runtime Split and State Plane

## Goal

Define the future target runtime topology and state-plane boundaries for the point when the project moves beyond local-only development and needs a real deployment/runtime split.

## Owner

contract

## Scope

- define the target deployable units: `app-web`, `engine-api`, `worker-control`
- define state-plane responsibilities for Redis, Postgres, and local fallback storage
- define which route classes may run on the public web origin vs internal worker/control planes
- update umbrella architecture docs so current reality and target design are separated clearly
- provide an implementation order that child work items can follow without reopening the architecture debate

## Non-Goals

- implementing the runtime split in this work item
- changing engine scoring semantics
- redesigning public UI surfaces
- selecting a specific cloud vendor or infrastructure product
- replacing SvelteKit or FastAPI

## Canonical Files

- `work/active/W-0012-runtime-split-and-state-plane.md`
- `work/active/W-0006-full-architecture-refactor-design.md`
- `docs/architecture.md`
- `docs/domains/contracts.md`
- `docs/decisions/ADR-004-runtime-split-and-state-plane.md`
- `work/active/W-0010-high-cost-api-rate-limit-cache.md`
- `work/active/W-0011-analyze-runtime-hardening.md`

## Decisions

- public user traffic, engine compute, and background/control workloads must be treated as separate runtime concerns
- `app-web` remains the only public origin and owns UI, auth/session, public orchestration, and short-lived reads
- `engine-api` remains the canonical compute surface for deterministic scoring, deep analysis, evaluation, and engine-owned APIs
- schedulers, training, report generation, queue consumers, and internal triggers belong on `worker-control`, not on the public web origin
- Redis is the preferred shared hot-state layer for cache, distributed rate limiting, and short-lived coordination; local memory remains fallback only
- Postgres is the durable state layer for user data, outboxes, job records, reports, and audit-friendly persistence
- `analyze` stays an app-orchestrated public route, but only as a thin orchestration surface with explicit degraded/error contracts and short TTL caching
- this work item is a future deployment lane, not the current top-priority execution slice while the repo remains local-only and research-first

## Next Steps

- keep the target topology documented so future deployment work starts from a clean design
- defer `worker-control` extraction until a real deployment target or local correctness issue justifies the work
- decide the first control-plane migration candidate only when deployment becomes an active priority
- add route-level runtime inventory updates without forcing immediate implementation

## Exit Criteria

- target runtime topology is documented in canonical docs and ADR form
- umbrella architecture docs no longer describe stale CI/test/contract assumptions as current fact
- runtime placement policy is explicit for public routes, orchestrated routes, and worker/control tasks
- a concrete implementation sequence exists for future refactor slices
