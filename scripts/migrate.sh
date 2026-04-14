#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="${ROOT_DIR}/app/db/migrations"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required (install PostgreSQL client)"
  exit 1
fi

echo "Applying migrations from ${MIGRATIONS_DIR}"

for file in "${MIGRATIONS_DIR}"/*.sql; do
  [[ -e "$file" ]] || continue
  echo "-> $(basename "$file")"
  psql "${DATABASE_URL}" -v ON_ERROR_STOP=1 -f "$file"
done

echo "Migrations complete."

