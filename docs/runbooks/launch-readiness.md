# Runbook: Launch Readiness

## Purpose

This runbook is the CTO/operator view of what must be true before treating the current repository as safe for a 1000+ user public launch.

Current status:

- the repository is still local-only
- there is no production deployment yet
- this runbook is future-facing reference material, not the active top-priority execution plan
- current execution priority remains ML/research pipeline, local correctness, and reproducibility

Use this together with:

- `work/active/W-0006-full-architecture-refactor-design.md`
- `work/active/W-0012-runtime-split-and-state-plane.md`
- `work/active/W-0013-launch-readiness-program.md`
- `app/docs/references/active/API_ROUTE_TIER_INVENTORY_2026-04-12.md`

## What Is Already In Place

- root CI exists for app, engine, and contract checks
- engine OpenAPI drift checks exist against app generated types
- targeted Vitest coverage exists for public cache/header and `analyze` response-envelope logic
- public heavy-read hardening is in place for the first launch-critical routes
- `analyze` now exposes explicit degraded/error semantics instead of silent fallback

## Launch-Critical Gates

All of the following should be true before public launch:

1. Runtime separation
   - public `app-web` traffic is separated from scheduler, training, reporting, and worker/control execution
   - no long-running control-plane workload depends on the public browser origin

2. Shared hot state
   - Redis-backed shared cache and distributed limiter are treated as production defaults for hardened public heavy reads
   - local-memory fallback is not the intended production behavior for cross-instance correctness

3. Route-level safety
   - every public `/api/*` route has an explicit tier, runtime plane, cache policy, and abuse policy
   - Tier D or worker/control routes are not exposed on the general public trust path

4. Contract and test depth
   - app, engine, and contract CI are green
   - high-cost public routes have targeted route-level tests for success, degraded, fallback, and abuse-guard cases
   - engine hot paths have enough coverage to catch runtime split regressions

5. Durable operations
   - background jobs use durable state for status, retries, and idempotency
   - in-memory job stores are not used as the only source of truth for important long-running work

6. Research integrity
   - current thesis, eval protocol, and experiment records live under `research/`
   - model/version lineage is inspectable without reverse-engineering comments or ad hoc scripts

## Current Top Blockers

| Priority | Blocker | Why it blocks launch | Owner | Linked work item |
| --- | --- | --- | --- | --- |
| P0 | Scheduler/control-plane still colocated with request-serving runtimes | replica scale-out can duplicate jobs or couple job spikes to user latency | contract | `W-0012` |
| P0 | Passport learning worker/report/train create paths are only disabled, not fully relocated | disabled web-origin routes still indicate unfinished control-plane separation | contract | `W-0012` |
| P0 | Redis promotion is incomplete for shared cache and limiter behavior | cross-instance cache/dedupe/rate-limit behavior is weaker than the documented target | app | `W-0010` |
| P0 | High-cost public routes still lack enough route-level tests | CI can miss real caller-facing regressions in degraded/fallback paths | app | `W-0011` |
| P1 | Engine scheduler and engine/app god-files remain too large | runtime split and incident response stay harder than necessary | engine/app | `W-0006` |
| P1 | Research artifacts remain under-populated in canonical `research/` paths | launch claims and model quality are harder to defend or reproduce | research | `W-0006` |

## Runtime-Plane Review

- `app-web`
  - allowed: UI delivery, auth/session, thin public orchestration, shared cached reads, SSE
  - not allowed: schedulers, training loops, report generation, queue consumers

- `engine-api`
  - allowed: score/deep/evaluate/pattern compute and engine-owned APIs
  - not allowed: browser session/auth, public control-plane batching

- `worker-control`
  - allowed: scheduler execution, queue consumption, report generation, training/job orchestration
  - not allowed: general public browser exposure

## Review Sequence

1. Confirm route inventory is current.
2. Confirm control-plane routes are disabled or moved.
3. Confirm shared cache and distributed limiter production configuration.
4. Confirm CI and targeted route tests.
5. Confirm release checklist and work-item links are current.
6. Confirm research/eval lineage for any user-facing model claims.

## Recommended Execution Order

When deployment becomes real, recommended order is:

1. Move scheduler/control-plane execution to `worker-control`.
2. Move passport learning triggers and lab autorun off the public runtime path.
3. Promote Redis-backed shared cache and distributed limiter as the expected production path.
4. Add route-level tests for `analyze` and the next heaviest public reads.
5. Canonicalize research/eval artifacts and model lineage.

## Exit Signal

Launch readiness is credible when runtime placement, shared-state behavior, route-level safety, and research lineage all have canonical proof in the repository rather than being implied by tribal knowledge.
