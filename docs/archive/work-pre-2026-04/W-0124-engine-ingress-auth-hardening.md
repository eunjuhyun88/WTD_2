# W-0124 Engine Ingress Auth Hardening

## Goal

Require authenticated server-to-engine traffic for non-meta engine routes so the engine runtime does not rely only on deployment privacy assumptions.

## Owner

contract

## Scope

- add an engine-side internal auth gate for non-meta routes
- keep health/readiness probes accessible without the internal secret
- add one shared app-side helper that injects the internal secret for server-to-engine calls
- update direct app engine callers and the `/api/engine/[...path]` proxy to use the shared helper
- add targeted tests for the engine gate and app runtime validation

## Non-Goals

- deleting the legacy `/api/engine/[...path]` proxy in this pass
- redesigning every app route into named first-party endpoints
- infra-only ingress policy changes outside repository code

## Canonical Files

- `work/active/W-0124-engine-ingress-auth-hardening.md`
- `docs/domains/contracts.md`
- `docs/domains/pattern-engine-runtime.md`
- `engine/api/main.py`
- `engine/security_runtime.py`
- `app/src/lib/server/engineClient.ts`
- `app/src/routes/api/engine/[...path]/+server.ts`

## Facts

- `engine/api/main.py` mounts many business routes without a shared auth dependency, while only `/jobs/*` currently uses explicit auth.
- `docs/domains/contracts.md` defines the engine as app-owned compute behind app-facing routes, not a browser-facing public API.
- `docs/domains/pattern-engine-runtime.md` calls out lossy or ad hoc app reshaping of engine truth as an architectural risk.
- App server code calls the engine through both `engineClient.ts` and many direct `fetch(${ENGINE_URL}/...)` route handlers.
- App runtime security already validates some production env boundaries in `app/src/lib/server/runtimeSecurity.ts`.
- App server callers now route engine traffic through shared authenticated transport helpers, including `engineClient.ts`, the engine proxy, and `app/src/lib/server/douni/toolExecutor.ts`.
- Targeted app and engine tests now pass for runtime validation, proxy header propagation, scheduler auth, and middleware rejection/allowlist behavior.
- Engine `/metrics` is not on the auth-exempt allowlist and should be accessed through an authenticated app-side proxy rather than a public engine endpoint.

## Assumptions

- `ENGINE_INTERNAL_SECRET` can be added to both app server and engine runtimes as a shared private env var.
- Public unauthenticated engine access should remain limited to readiness/health style endpoints only.

## Open Questions

- Whether any external scheduler or third-party caller besides the app should reach non-meta engine routes.

## Decisions

- Gate all non-meta engine traffic with one header-based internal secret check instead of scattering route-level dependencies.
- Treat missing `ENGINE_INTERNAL_SECRET` as a production misconfiguration.
- Prefer a small shared app-side helper over duplicating auth header injection in each route.
- Land the ingress-auth hardening on a fresh `origin/main`-based branch instead of the current long-lived refactor branch so the PR scope stays limited to the app-engine boundary change.
- Keep engine `/metrics` behind the internal secret and expose it, when needed, through an authenticated app-side proxy.

## Next Steps

- set `ENGINE_INTERNAL_SECRET` in both app and engine deployment environments before relying on the new ingress boundary
- wire any dashboards or operator tooling that need raw metrics to the authenticated app-side metrics route

## Exit Criteria

- non-meta engine routes reject unauthenticated traffic
- app server routes continue to reach engine successfully through the shared helper
- targeted tests cover both engine-side rejection and app runtime env validation

## Handoff Checklist

- active work item: `work/active/W-0124-engine-ingress-auth-hardening.md`
- branch: `codex/w-0123-w-0124-public-hardening`
- verification: `npm run test -- src/lib/server/runtimeSecurity.test.ts 'src/routes/api/engine/[...path]/engine-proxy.test.ts' src/routes/api/observability/metrics/metrics.test.ts` and `uv run pytest tests/test_security_runtime.py tests/test_jobs_routes.py tests/test_internal_auth_middleware.py -q`
- remaining blockers: deployment envs must actually set `ENGINE_INTERNAL_SECRET`
