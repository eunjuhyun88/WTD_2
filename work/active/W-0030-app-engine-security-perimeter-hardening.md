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
- add DB hardening artifacts for least-privilege runtime roles and RLS audits

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
- `app/src/lib/server/runtimeSecurity.ts`
- `app/src/lib/server/runtimeSecurity.test.ts`
- `app/scripts/security/db-security-audit.mjs`
- `app/db/security/least_privilege_app_role.sql`
- `engine/api/main.py`
- `engine/security_runtime.py`
- `engine/tests/test_security_runtime.py`
- `app/.env.example`
- `docs/runbooks/env-vars.md`
- `docs/runbooks/db-security-hardening.md`

## Decisions

- host-header validation should be explicit and env-configurable on both runtimes
- `engine-api` docs/openapi should be off by default unless intentionally exposed
- Supabase service-role credentials remain worker-only and must not be shipped to `app-web`
- production runtimes must fail fast when host allowlists or low-privilege DB assumptions are missing
- DB privilege and RLS review should be runnable as a repeatable audit, not only a manual checklist

## Next Steps

- set `SECURITY_ALLOWED_HOSTS` for the app production origin
- set `ENGINE_ALLOWED_HOSTS` and `APP_ORIGIN` for engine deployments
- keep `ENGINE_EXPOSE_DOCS=false` on public deployments unless the engine is private
- apply `app/db/security/least_privilege_app_role.sql` with owner credentials
- run `npm run security:db:audit -- --strict` against production/staging before deploy

## Exit Criteria

- app rejects requests for unexpected hosts when allowlist is configured
- engine rejects unexpected hosts and serves docs only when explicitly enabled
- env docs make the new security switches operationally clear
- DB hardening artifacts exist for low-privilege runtime role rollout and RLS audits
