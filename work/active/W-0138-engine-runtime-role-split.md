# W-0138 — Engine Runtime Role Split

## Goal

Make `engine` deployable as explicit `engine-api` and `worker-control` roles so the public API runtime does not include scheduler/control-plane work by default.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- `engine/api/main.py`
- `engine/security_runtime.py`
- `engine/observability/health.py`
- runtime role tests
- minimal docs/env rules for role placement

## Non-Goals

- full migration of all training/refinement endpoints
- durable pattern state plane implementation
- app route ownership inventory
- Supabase migration 018 execution

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0138-engine-runtime-role-split.md`
- `work/active/W-0136-runtime-research-sequencing.md`
- `docs/decisions/ADR-009-core-runtime-ownership.md`
- `docs/domains/pattern-engine-runtime.md`
- `docs/domains/autoresearch-ml.md`
- `engine/api/main.py`
- `engine/security_runtime.py`
- `engine/observability/health.py`

## Facts

1. `engine-api` currently imports and includes the jobs router in the same FastAPI app as public compute routes.
2. scheduler bootstrap is controlled only by `ENGINE_ENABLE_SCHEDULER`, so a public API process can still be configured as a control-plane runtime.
3. W-0136 added worker-control research CLI entrypoints, but the HTTP runtime still needs role-level route gating.
4. W-0126 moved ledger hot paths toward shared state, making runtime separation more important before AI research/learning work expands.
5. `hybrid` compatibility is still needed for local/dev and incremental deployment.

## Assumptions

1. Production `engine-api` can set `ENGINE_RUNTIME_ROLE=api`.
2. Internal worker deployments can set `ENGINE_RUNTIME_ROLE=worker` or continue to use the non-HTTP worker entrypoint until Cloud Run config is updated.

## Open Questions

- Which training/refinement mutation routes should be hidden from `engine-api` in the next slice?

## Decisions

- Add `ENGINE_RUNTIME_ROLE` with `hybrid`, `api`, and `worker`.
- `api` role serves public engine routes and blocks jobs/scheduler bootstrap.
- `worker` role serves job trigger routes and blocks public engine routes in the FastAPI surface.
- `hybrid` remains the default compatibility mode but should warn in production.
- W-0122 Phase 2 should not add more AI research control-plane work to `engine-api`.

## Next Steps

1. Implement runtime role parsing, readiness metadata, route inclusion gating, and scheduler gating.
2. Add targeted tests for route exposure and scheduler behavior.
3. Update runtime env docs so operators know which role to set per deployable.

## Exit Criteria

- `ENGINE_RUNTIME_ROLE=api` does not expose `/jobs/*`.
- `ENGINE_RUNTIME_ROLE=api` does not start the scheduler even if `ENGINE_ENABLE_SCHEDULER=true`.
- `ENGINE_RUNTIME_ROLE=worker` exposes `/jobs/*` and does not expose public engine routes.
- `/readyz` reports the active runtime role.
- targeted engine tests pass.

## Handoff Checklist

- execution branch: `codex/w-0138-engine-runtime-role-split`
- verification: targeted engine runtime/security/jobs tests
- follow-up: move training/refinement mutation endpoints and durable pattern state to worker/shared-state slices
