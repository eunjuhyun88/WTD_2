#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}/app"
if [ -n "${CI:-}" ]; then
  npm ci
else
  npm install
fi
npm run contract:check:engine-types

cd "${ROOT_DIR}/engine"
uv sync
uv run pytest -q \
  tests/test_contract_score_schema.py \
  tests/test_contract_deep_schema.py \
  tests/test_contract_additional_schemas.py
