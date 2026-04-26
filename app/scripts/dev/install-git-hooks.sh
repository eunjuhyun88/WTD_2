#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

git config core.hooksPath .githooks
chmod +x .githooks/pre-push
chmod +x .githooks/post-merge
chmod +x .githooks/pre-commit

echo "Installed local hooks path: .githooks"
echo "Active hooks: pre-commit (W-0221: unknown-agent gate), pre-push (branch naming + design invariants), post-merge (state refresh)."
echo "context auto snapshots are enabled through hook pipeline (ctx:auto)."
