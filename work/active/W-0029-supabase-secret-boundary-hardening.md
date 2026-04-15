# W-0029 Supabase Secret Boundary Hardening

## Goal

Prevent accidental deployment of high-privilege Supabase credentials into `app-web` and require explicit secret validation for `worker-control`.

## Owner

contract

## Scope

- forbid `SUPABASE_SERVICE_ROLE_KEY` in the SvelteKit app runtime
- require valid Supabase worker secrets before the scheduler starts
- update canonical env docs/examples so the service-role key is worker-only

## Non-Goals

- redesigning database ownership or all Postgres roles
- migrating app-web from direct Postgres access
- rotating Supabase credentials in hosted environments

## Canonical Files

- `work/active/W-0029-supabase-secret-boundary-hardening.md`
- `app/src/hooks.server.ts`
- `app/src/lib/server/runtimeSecurity.ts`
- `app/src/lib/server/runtimeSecurity.test.ts`
- `engine/scanner/scheduler.py`
- `engine/tests/test_scheduler.py`
- `app/.env.example`
- `docs/runbooks/env-vars.md`

## Decisions

- `SUPABASE_SERVICE_ROLE_KEY` must never exist in `app-web`
- privileged Supabase writes belong to `worker-control`
- worker scheduler startup must fail fast when Supabase worker secrets are missing or placeholder-like

## Next Steps

- remove `SUPABASE_SERVICE_ROLE_KEY` from Vercel app-web env if present
- create a least-privilege Postgres role for `DATABASE_URL`
- verify Supabase RLS coverage for browser-facing tables

## Exit Criteria

- app-web throws on startup when a service-role key is present
- worker scheduler refuses to start with missing/placeholder Supabase secrets
- env docs clearly separate publishable vs privileged Supabase keys
