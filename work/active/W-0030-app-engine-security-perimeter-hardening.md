# W-0030 App/Engine Security Perimeter Hardening

## Goal

Tighten the public-facing security perimeter across `app-web` and `engine-api` by enforcing host allowlists, shrinking public engine exposure, and clarifying Supabase secret boundaries.

## Owner

contract

## Scope

- add optional host allowlist enforcement to `app-web`
- add trusted-host enforcement to `engine-api`
- disable public FastAPI docs by default
- narrow engine CORS configuration to the known app origins
- document runtime env controls for host allowlists and docs exposure

## Non-Goals

- redesigning app authentication/session architecture
- moving all app DB access behind engine routes
- implementing full RLS coverage audits for every Supabase/Postgres table
- introducing WAF/CDN-specific controls

## Canonical Files

- `work/active/W-0030-app-engine-security-perimeter-hardening.md`
- `app/src/hooks.server.ts`
- `app/src/lib/server/hostSecurity.ts`
- `app/src/lib/server/hostSecurity.test.ts`
- `engine/api/main.py`
- `engine/tests/test_main_security.py`
- `app/.env.example`
- `docs/runbooks/env-vars.md`

## Decisions

- host-header validation should be explicit and env-configurable on both runtimes
- `engine-api` docs/openapi should be off by default unless intentionally exposed
- Supabase service-role credentials remain worker-only and must not be shipped to `app-web`

## Next Steps

- set `SECURITY_ALLOWED_HOSTS` for the app production origin
- set `ENGINE_ALLOWED_HOSTS` and `APP_ORIGIN` for engine deployments
- keep `ENGINE_EXPOSE_DOCS=false` on public deployments unless the engine is private
- audit production `DATABASE_URL` privileges and reduce them below `postgres*`

## Exit Criteria

- app rejects requests for unexpected hosts when allowlist is configured
- engine rejects unexpected hosts and serves docs only when explicitly enabled
- env docs make the new security switches operationally clear
