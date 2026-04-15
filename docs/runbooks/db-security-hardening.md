# DB Security Hardening

Canonical hardening path for `app-web` Postgres access and RLS coverage.

## Goals

- stop using a superuser or elevated owner account for `DATABASE_URL`
- make RLS gaps visible before browser-facing reads expand
- keep privileged Supabase/service-role usage in `worker-control` only

## 1. Create a Least-Privilege App Role

Use [least_privilege_app_role.sql](/Users/ej/Projects/wtd-v2/app/db/security/least_privilege_app_role.sql:1) as the starting template.

Apply it with a DB owner/admin account, then rotate `app-web` to the new role:

```bash
psql "$OWNER_DATABASE_URL" -f app/db/security/least_privilege_app_role.sql
```

Then set:

```env
DATABASE_URL=postgresql://app_runtime:...@HOST:5432/postgres
```

## 2. Audit RLS and Runtime Privileges

From the `app/` workspace:

```bash
npm run security:db:audit
```

Strict mode fails on high/critical findings:

```bash
npm run security:db:audit -- --strict
```

Optional exemptions for internal-only tables:

```env
DB_SECURITY_RLS_EXEMPT_TABLES=sessions,auth_nonces,request_rate_limits
```

Use exemptions sparingly. Prefer enabling RLS with explicit policies where browser or Supabase-authenticated access is possible.

## 3. Current Review Standard

- `DATABASE_URL` must not use `postgres*`, superuser, or role-admin capabilities
- browser-facing or Supabase-exposed tables should have RLS enabled
- RLS-enabled tables should define explicit policies
- `PUBLIC` should not retain broad grants on `public.*`

## 4. Recommended Next Pass

1. classify `public` tables into `browser-facing`, `server-only`, `worker-only`
2. enable RLS on browser-facing tables first
3. add explicit per-user policies
4. rerun `security:db:audit -- --strict`
