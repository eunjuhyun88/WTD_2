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

-- Existing objects
grant select, insert, update, delete on all tables in schema public to app_runtime;
grant usage, select on all sequences in schema public to app_runtime;
grant execute on all functions in schema public to app_runtime;

-- Future objects
alter default privileges in schema public
  grant select, insert, update, delete on tables to app_runtime;
alter default privileges in schema public
  grant usage, select on sequences to app_runtime;
alter default privileges in schema public
  grant execute on functions to app_runtime;

-- Tighten PUBLIC baseline where possible.
revoke create on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;
revoke all on all functions in schema public from public;

commit;
