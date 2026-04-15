-- App runtime DB role hardening template
--
-- Purpose:
--   - create a dedicated runtime role for app-web
--   - remove superuser usage from DATABASE_URL
--   - scope table/sequence access to what app-web actually needs
--
-- Usage:
--   1. replace app_runtime / CHANGE_ME_APP_PASSWORD with your values
--   2. run as a database owner/admin
--   3. update app-web DATABASE_URL to use the new role
--   4. run `npm run security:db:audit -- --strict`

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_runtime') then
    create role app_runtime
      login
      password 'CHANGE_ME_APP_PASSWORD'
      nosuperuser
      nocreatedb
      nocreaterole
      noinherit
      noreplication;
  end if;
end
$$;

grant usage on schema public to app_runtime;

-- Tighten PUBLIC baseline where possible.
revoke create on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;

-- Default state: no blanket object grants.
-- Add only the exact tables/functions the app runtime needs.
--
-- Example read-only grants:
-- grant select on table public.app_users to app_runtime;
-- grant select on table public.user_preferences to app_runtime;
--
-- Example read-write grants for authenticated app flows:
-- grant select, insert, update on table public.user_preferences to app_runtime;
-- grant select, insert, update, delete on table public.sessions to app_runtime;
-- grant select, insert on table public.auth_nonces to app_runtime;
--
-- Example sequence/function grants when required:
-- grant usage, select on sequence public.some_table_id_seq to app_runtime;
-- grant execute on function public.set_updated_at() to app_runtime;
--
-- Avoid schema-wide future default grants unless the schema is already split
-- into tables with the same sensitivity profile.

commit;
