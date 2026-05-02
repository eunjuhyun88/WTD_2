# ADR-009: Core Runtime Ownership

## Status

Accepted (2026-04-23)

## Context

The repository already separates `app` and `engine`, but the deployed runtime is still mixed:

- `app-web` still proxies and orchestrates some engine-owned flows.
- `engine-api` can serve public requests and control-plane jobs from the same FastAPI process.
- `worker-control` exists, but role placement is not enforced by runtime configuration.
- shared state is moving to Supabase/Redis, while local files remain development fallback.

The next architecture step is not a rewrite. It is a deployable role split that lets each runtime reject work it should not own.

## Decision

The core runtime roles are:

1. `app-web`
   - owns UI, session/auth, request orchestration, and rendering
   - does not own canonical scoring, verdict, training, or pattern admission truth

2. `engine-api`
   - owns deterministic compute/read contracts such as score, deep analysis, patterns, captures, backtests, and evidence reads
   - must not start scheduler/control-plane work by default

3. `worker-control`
   - owns scheduler, background jobs, research/refinement execution, training handoff, report generation, and queue consumers
   - is internal-only and not browser-facing

4. shared state
   - canonical persistence lives in Supabase/Postgres/Redis or another shared store
   - file and process-local state are development fallback only

## Rules

- Public API traffic and background control-plane work are separate scaling and failure domains.
- `ENGINE_RUNTIME_ROLE=api` serves public engine contracts and excludes job trigger routes.
- `ENGINE_RUNTIME_ROLE=worker` serves worker-control job routes and excludes public engine contracts.
- `ENGINE_RUNTIME_ROLE=hybrid` is transitional compatibility only.
- AI research, refinement, training, calibration, and promotion must move toward `worker-control`.
- Engine read/score/evidence contracts may remain on `engine-api`.

## Consequences

- Existing local development can keep `hybrid` until service configs are explicit.
- Production should set explicit runtime roles.
- Some transitional routes such as training and refinement reads may remain on `engine-api` until their worker-control migration has a dedicated slice.

## Follow-Up

- Move training/refinement mutation endpoints behind worker-control.
- Remove process-local pattern state from multi-instance production paths.
- Slim app routes so `app-web` proxies canonical engine contracts without reshaping engine truth.

## See Also

- [ADR-012](ADR-012-core-loop-spine.md): Core Loop Spine & research/ 4-subpackage boundary (W-0386)
