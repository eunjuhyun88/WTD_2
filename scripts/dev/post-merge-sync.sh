#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "[post-merge] branch: $CURRENT_BRANCH"

if git rev-parse --verify ORIG_HEAD >/dev/null 2>&1; then
	if git diff --name-only ORIG_HEAD HEAD | grep -Eq "^(package\.json|package-lock\.json|npm-shrinkwrap\.json)$"; then
		echo "[post-merge] dependency manifest changed. Run npm install if needed."
	fi
fi

echo "[post-merge] running npm run check"
npm run check

if [ -x scripts/dev/context-auto.sh ]; then
	echo "[post-merge] context auto snapshot"
	bash scripts/dev/context-auto.sh post-merge || true
fi

echo "[post-merge] sync check passed"
