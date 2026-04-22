# W-0126 — App-Engine Boundary Closure

## Goal

Close the remaining unsafe app-engine compatibility paths by routing browser capture traffic through first-party app endpoints, validating slug/path safety in engine capture storage, and shrinking the engine proxy to the smallest necessary compatibility surface.

## Owner

contract

## Scope

- finish Phase 1C slug/path validation for capture and ledger writes
- migrate browser capture reads/writes from `/api/engine/captures/*` to `/api/captures/*`
- add any missing first-party capture route needed to eliminate browser dependence on the engine proxy
- reduce the compatibility proxy to the minimum set still required by current callers

## Non-Goals

- broad scan-pipeline refactors or ledger perf rearchitecture
- deleting every legacy pattern route in one pass
- redesigning product surfaces beyond contract-safe endpoint rewiring

## Canonical Files

- `work/active/W-0126-app-engine-boundary-closure.md`
- `work/active/W-0122-multi-agent-full-repo-audit.md`
- `docs/domains/contracts.md`
- `docs/domains/pattern-engine-runtime.md`
- `app/src/routes/api/engine/[...path]/+server.ts`
- `app/src/routes/api/captures/*`
- `engine/api/routes/captures.py`
- `engine/ledger/store.py`

## Facts

- `app/src/routes/api/captures/+server.ts`, `app/src/routes/api/captures/chart-annotations/+server.ts`, `app/src/routes/api/captures/outcomes/+server.ts`, and `app/src/routes/api/captures/[id]/verdict/+server.ts` now cover the browser-facing capture create/read/write plane.
- Browser callers in the dashboard, patterns verdict inbox, chart review drawer, and capture annotation store no longer call `/api/engine/captures/*`.
- `app/src/routes/patterns/+page.svelte` now uses engine `candidate_records` and writes canonical pattern captures through `/api/captures` instead of the legacy slug+symbol verdict route.
- `engine/api/routes/captures.py` validates `pattern_slug` on capture ingress and now accepts `user_id` on `/captures/chart-annotations` so app routes can scope capture overlays to the authenticated user.
- Verification succeeded with `npm --prefix app run test -- 'src/routes/api/engine/[...path]/engine-proxy.test.ts' 'src/routes/api/market/snapshot/snapshot.test.ts' 'src/lib/server/runtimeSecurity.test.ts'`, `npm --prefix app run test -- 'src/routes/api/captures/captures.test.ts' 'src/routes/api/captures/chart-annotations/chart-annotations.test.ts'`, `npm --prefix app run test -- 'src/routes/api/captures/[id]/verdict/verdict-route.test.ts' 'src/routes/api/patterns/[slug]/verdict/verdict-shim.test.ts'`, `UV_CACHE_DIR=/tmp/wtd-v2-uv-cache uv run --directory engine python -m pytest tests/test_capture_routes.py tests/test_ledger_store.py -q`, and `npm --prefix app run check` (0 errors, repo-wide pre-existing warnings remain).

## Assumptions

- The remaining `app/src/routes/api/patterns/[slug]/verdict/+server.ts` compatibility shim is acceptable to keep until a separate cleanup slice deletes unused legacy endpoints.

## Open Questions

- none

## Decisions

- Treat `/api/captures/*` as the only browser-facing capture read/write plane.
- Keep the engine proxy only for explicitly allowlisted compatibility paths that still have real callers after this slice.
- Validate `pattern_slug` at both API ingress and ledger path construction so path traversal fails closed even if one layer regresses.
- Keep `app/src/routes/api/patterns/[slug]/capture/+server.ts` and `app/src/routes/api/patterns/[slug]/verdict/+server.ts` only as compatibility shims, with no browser callers depending on them.

## Next Steps

1. Remove unused legacy app shims such as `app/src/routes/api/patterns/[slug]/verdict/+server.ts` once no external/stale clients depend on them.
2. Continue with `Phase 3` load-shedding work from `work/active/W-0122-multi-agent-full-repo-audit.md`.

## Exit Criteria

- invalid `pattern_slug` values are rejected before any ledger path write occurs
- browser capture flows use `/api/captures/*` instead of `/api/engine/captures/*`
- the engine compatibility proxy only exposes capture paths that are still demonstrably needed
- targeted app and engine tests pass for the changed routes and guards

## Handoff Checklist

- current scope and remaining compatibility shims are reflected here
- next agent can identify the remaining legacy capture shims from this file and `rg`
- verification commands and the `/tmp` uv cache workaround are recorded here
