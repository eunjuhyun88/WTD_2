#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting engine and app dev servers..."
echo "Engine: http://localhost:8000"
echo "App:    http://localhost:5173"

(
  cd "${ROOT_DIR}/engine"
  uv run uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
) &

(
  cd "${ROOT_DIR}/app"
  npm run dev
) &

wait
