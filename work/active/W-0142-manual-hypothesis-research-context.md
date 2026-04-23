# W-0142 — Runtime State Plane

## Goal

Create the canonical engine-owned runtime state plane for workflow truth: captures, workspace pins, saved setups, research contexts, and ledger projections.

## Owner

engine

## Primary Change Type

Engine logic change

## Scope

- add `engine/runtime` repository boundary for runtime workflow state
- add canonical `engine/api/routes/runtime.py`
- expose `/runtime/captures`, `/runtime/workspace/*`, `/runtime/setups/*`, `/runtime/research-contexts/*`, and `/runtime/ledger/*`
- keep local SQLite/file stores as fallback adapters behind engine APIs
- add targeted engine route/store tests

## Non-Goals

- move terminal UI to runtime APIs in this slice
- replace Supabase/shared storage in this slice
- redesign capture outcome resolution or verdict scoring
- delete legacy `/captures` or app persistence routes

## Canonical Files

- `AGENTS.md`
- `work/active/CURRENT.md`
- `work/active/W-0142-manual-hypothesis-research-context.md`
- `docs/domains/terminal-ai-scan-architecture.md`
- `engine/runtime/*.py`
- `engine/api/routes/runtime.py`
- `engine/api/schemas_runtime.py`
- `engine/capture/store.py`
- `engine/api/main.py`
- `engine/tests/test_runtime_routes.py`

## Facts

1. `capture`, `patterns.state_store`, and `research.state_store` already persist workflow state in engine-local stores.
2. app plane proxy already allows `/api/runtime/captures`, `/api/runtime/workspace/*`, `/api/runtime/setups/*`, `/api/runtime/research-contexts/*`, and `/api/runtime/ledger/*`.
3. runtime state is authoritative workflow truth and must not be folded into fact or search payload ownership.
4. legacy `/captures` remains live and must be treated as a compatibility surface until app consumers migrate.

## Assumptions

1. first runtime slice can use local SQLite repositories as fallback-local canonical adapters.
2. shared storage cutover remains a later explicit migration.

## Open Questions

- which shared store becomes the runtime authoritative backend after local fallback: Supabase Postgres or a dedicated engine database.

## Decisions

- Runtime route responses must include `ok`, `owner`, `plane`, `status`, and `generated_at`.
- `/runtime/captures` reuses `CaptureStore` and mirrors the current capture schema instead of creating a second capture truth.
- Workspace pins, saved setups, research contexts, and runtime ledger projections start in a small SQLite-backed `RuntimeStateStore`.
- Legacy `/captures` stays in place; new app/runtime traffic should prefer `/runtime/*`.

## Next Steps

1. land canonical runtime route skeleton and repository tests.
2. move legacy persistence bridges behind runtime APIs.
3. connect app save/restore flows to runtime plane after route shape is stable.

## Exit Criteria

- canonical `/runtime/*` routes exist and return runtime plane metadata.
- captures and workspace/research/setup records survive process restart through engine repositories.
- targeted runtime tests pass.

## Handoff Checklist

- active work item: `work/active/W-0142-manual-hypothesis-research-context.md`
- branch: `codex/w-0142-runtime-routes`
- worktree: `/private/tmp/wtd-v2-w0145-corpus-plane`
- verification: `uv run --directory engine python -m pytest tests/test_runtime_routes.py -q` = `5 passed`; `uv run --directory engine python -m pytest tests/test_runtime_routes.py tests/test_capture_routes.py tests/test_engine_runtime_roles.py -q` = `23 passed`; `npm --prefix app run contract:check:engine-types` = passed; `npm --prefix app run check` = `0 errors`, pre-existing `111 warnings`
- remaining blockers: shared storage cutover and app surface migration are future slices
