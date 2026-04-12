#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

printf "Repo: %s\n" "$ROOT_DIR"
printf "Branch: %s\n" "$CURRENT_BRANCH"
printf "\n[git status]\n"
git status --short --branch

printf "\n[worktrees]\n"
git worktree list

printf "\n[changed files vs origin/main]\n"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
	if git diff --quiet origin/main...HEAD; then
		echo "none"
	else
		git diff --name-only origin/main...HEAD
	fi
else
	echo "origin/main not found (run: git fetch origin main)"
fi

printf "\n[uncommitted files]\n"
if git diff --quiet && git diff --cached --quiet; then
	echo "clean"
else
	git status --short
fi

if [ -x scripts/dev/context-auto.sh ]; then
	echo ""
	echo "[ctx:auto] safe-status trigger"
	bash scripts/dev/context-auto.sh safe-status || true
fi
