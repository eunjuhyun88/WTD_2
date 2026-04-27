#!/usr/bin/env bash
# Verify design/current specs against implementation.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$REPO_ROOT/design/current/invariants.yml"
SUMMARY=0

if [ "${1:-}" = "--summary" ]; then
  SUMMARY=1
fi

if [ ! -f "$CONFIG" ]; then
  echo "Design status: not configured"
  exit 0
fi

run_python() {
  if [ -x "$REPO_ROOT/engine/.venv/bin/python" ]; then
    "$REPO_ROOT/engine/.venv/bin/python" "$@"
  else
    (cd "$REPO_ROOT/engine" && uv run python "$@")
  fi
}

if [ "$SUMMARY" -eq 1 ]; then
  if run_python "$REPO_ROOT/tools/verify/invariants.py" --root "$REPO_ROOT" "$CONFIG" --summary; then
    exit 0
  fi
  echo "Design status: DRIFT"
  exit 1
fi

run_python "$REPO_ROOT/tools/verify/contracts.py" --root "$REPO_ROOT" "$CONFIG"
run_python "$REPO_ROOT/tools/verify/architecture.py" --root "$REPO_ROOT" "$CONFIG"
run_python "$REPO_ROOT/tools/verify/invariants.py" --root "$REPO_ROOT" "$CONFIG"
echo "✓ Design verified — code matches current specs"
