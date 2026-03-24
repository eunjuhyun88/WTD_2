#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

echo "[ci:context] docs check"
npm run docs:check

echo "[ci:context] strict context quality"
npm run ctx:check -- --strict

CLAIMS_DIR=".agent-context/coordination/claims"
FORCE_COORD="${CTX_CI_REQUIRE_COORD:-0}"

if [ "$FORCE_COORD" = "1" ]; then
	echo "[ci:context] forced coordination check"
	npm run coord:check
elif [ -d "$CLAIMS_DIR" ] && find "$CLAIMS_DIR" -maxdepth 1 -type f -name '*.json' | grep -q .; then
	echo "[ci:context] coordination claims detected in checkout"
	npm run coord:check
else
	echo "[ci:context] no committed coordination claims detected; skipping remote coord:check"
fi

echo "[ci:context] sandbox policy"
npm run sandbox:check
