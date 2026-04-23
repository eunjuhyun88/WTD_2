#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION_FILE="${ROOT_DIR}/app/supabase/migrations/018_pattern_ledger_records.sql"

SUPABASE_URL="${SUPABASE_URL:-}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
ENGINE_INTERNAL_SECRET="${ENGINE_INTERNAL_SECRET:-}"
APP_ORIGIN="${APP_ORIGIN:-}"
ENGINE_ALLOWED_HOSTS="${ENGINE_ALLOWED_HOSTS:-}"
SUPABASE_POOLER_DSN="${SUPABASE_POOLER_DSN:-}"
ENGINE_URL="${ENGINE_URL:-}"
APP_URL="${APP_URL:-}"
RUN_DB_VERIFY="${RUN_DB_VERIFY:-0}"
RUN_HTTP_VERIFY="${RUN_HTTP_VERIFY:-0}"
PG_NODE_MODULE_DIR="${PG_NODE_MODULE_DIR:-${ROOT_DIR}/app/node_modules}"

failures=0
warnings=0

ok() {
  printf '[ok] %s\n' "$1"
}

warn() {
  printf '[warn] %s\n' "$1"
  warnings=$((warnings + 1))
}

fail() {
  printf '[fail] %s\n' "$1"
  failures=$((failures + 1))
}

require_env() {
  local name="$1"
  local value="$2"
  local hint="$3"
  if [[ -n "$value" ]]; then
    ok "${name} is set"
  else
    fail "${name} is missing (${hint})"
  fi
}

check_http() {
  local url="$1"
  shift
  if curl -fsS "$@" "$url" >/dev/null; then
    ok "HTTP probe passed: ${url}"
  else
    fail "HTTP probe failed: ${url}"
  fi
}

verify_db_with_node_pg() {
  (
    cd "${ROOT_DIR}/app"
    SUPABASE_POOLER_DSN="${SUPABASE_POOLER_DSN}" PG_NODE_MODULE_DIR="${PG_NODE_MODULE_DIR}" node --input-type=module <<'NODE'
import { createRequire } from 'node:module';

const require = createRequire(`${process.env.PG_NODE_MODULE_DIR}/package.json`);
const pg = require('pg');

const dsn = process.env.SUPABASE_POOLER_DSN;
if (!dsn) throw new Error('SUPABASE_POOLER_DSN is missing');

const client = new pg.Client({
  connectionString: dsn,
  ssl: { rejectUnauthorized: false },
});

await client.connect();
try {
  const table = await client.query("select to_regclass('public.pattern_ledger_records') as table_name");
  const tableName = table.rows[0]?.table_name ?? null;
  if (tableName !== 'pattern_ledger_records') {
    throw new Error('database table missing: public.pattern_ledger_records');
  }

  const indexes = await client.query(`
    select count(*)::int as index_count
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'pattern_ledger_records'
      and indexname in (
        'pattern_ledger_records_pkey',
        'plr_slug_created_idx',
        'plr_slug_type_created_idx'
      )
  `);
  const indexCount = Number(indexes.rows[0]?.index_count ?? 0);
  if (indexCount !== 3) {
    throw new Error(`expected 3 required indexes for pattern_ledger_records, found ${indexCount}`);
  }
} finally {
  await client.end();
}
NODE
  )
}

echo "W-0126 cutover preflight"
echo "root: ${ROOT_DIR}"

if [[ -f "${MIGRATION_FILE}" ]]; then
  ok "migration file exists: ${MIGRATION_FILE}"
else
  fail "missing migration file: ${MIGRATION_FILE}"
fi

require_env "SUPABASE_URL" "${SUPABASE_URL}" "trusted engine runtimes need shared ledger access"
require_env "SUPABASE_SERVICE_ROLE_KEY" "${SUPABASE_SERVICE_ROLE_KEY}" "trusted engine runtimes need service-role writes/reads"
require_env "ENGINE_INTERNAL_SECRET" "${ENGINE_INTERNAL_SECRET}" "engine-api privileged ingress must stay gated"
require_env "APP_ORIGIN" "${APP_ORIGIN}" "production engine runtime should know the app origin"

if [[ -n "${ENGINE_ALLOWED_HOSTS}" ]]; then
  ok "ENGINE_ALLOWED_HOSTS is set"
else
  warn "ENGINE_ALLOWED_HOSTS is empty; production engine runtime should set a host allowlist"
fi

if [[ "${RUN_DB_VERIFY}" == "1" ]]; then
  if [[ -z "${SUPABASE_POOLER_DSN}" ]]; then
    fail "RUN_DB_VERIFY=1 but SUPABASE_POOLER_DSN is missing"
  elif command -v psql >/dev/null 2>&1; then
    table_name="$(
      psql "${SUPABASE_POOLER_DSN}" -At -v ON_ERROR_STOP=1 \
        -c "select to_regclass('public.pattern_ledger_records');"
    )"
    if [[ "${table_name}" == "pattern_ledger_records" ]]; then
      ok "database table exists: public.pattern_ledger_records"
    else
      fail "database table missing: public.pattern_ledger_records"
    fi

    index_count="$(
      psql "${SUPABASE_POOLER_DSN}" -At -v ON_ERROR_STOP=1 <<'SQL'
select count(*)
from pg_indexes
where schemaname = 'public'
  and tablename = 'pattern_ledger_records'
  and indexname in (
    'pattern_ledger_records_pkey',
    'plr_slug_created_idx',
    'plr_slug_type_created_idx'
  );
SQL
    )"
    if [[ "${index_count}" == "3" ]]; then
      ok "required pattern_ledger_records indexes exist"
    else
      fail "expected 3 required indexes for pattern_ledger_records, found ${index_count}"
    fi
  elif command -v node >/dev/null 2>&1 && [[ -d "${PG_NODE_MODULE_DIR}/pg" ]]; then
    if verify_db_with_node_pg; then
      ok "database table exists: public.pattern_ledger_records"
      ok "required pattern_ledger_records indexes exist"
    else
      fail "database verification failed via node pg fallback"
    fi
  else
    fail "RUN_DB_VERIFY=1 but neither psql nor app/node_modules/pg is available"
  fi
else
  warn "database verification skipped (set RUN_DB_VERIFY=1 and SUPABASE_POOLER_DSN to enable)"
fi

if [[ "${RUN_HTTP_VERIFY}" == "1" ]]; then
  if [[ -z "${ENGINE_URL}" ]]; then
    fail "RUN_HTTP_VERIFY=1 but ENGINE_URL is missing"
  else
    check_http "${ENGINE_URL%/}/healthz"
    check_http "${ENGINE_URL%/}/readyz"
    check_http "${ENGINE_URL%/}/patterns/stats/all" -H "x-engine-internal-secret: ${ENGINE_INTERNAL_SECRET}"
  fi

  if [[ -z "${APP_URL}" ]]; then
    warn "RUN_HTTP_VERIFY=1 but APP_URL is missing; app-facing stats probe skipped"
  else
    check_http "${APP_URL%/}/api/patterns/stats"
  fi
else
  warn "HTTP verification skipped (set RUN_HTTP_VERIFY=1 with ENGINE_URL and APP_URL to enable)"
fi

echo
if (( failures > 0 )); then
  echo "Preflight failed: ${failures} failure(s), ${warnings} warning(s)"
  exit 1
fi

echo "Preflight passed: 0 failure(s), ${warnings} warning(s)"
