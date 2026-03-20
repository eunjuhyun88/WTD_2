#!/usr/bin/env bash
set -euo pipefail

RUN_GATE=0
if [ "${1:-}" = "--gate" ]; then
	RUN_GATE=1
elif [ "${1:-}" = "" ]; then
	:
else
	echo "Usage: bash scripts/dev/uiux-promote.sh [--gate]"
	exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

SOURCE_BRANCH="${SOURCE_BRANCH:-codex/uiux-refresh}"
TARGET_BRANCH="${TARGET_BRANCH:-codex/uiux-frontend}"

if ! git diff --quiet || ! git diff --cached --quiet; then
	echo "[uiux-promote] Working tree has uncommitted changes. Commit or stash first."
	git status --short --branch
	exit 1
fi

echo "[uiux-promote] fetch origin"
git fetch origin --prune

ensure_local_branch() {
	local branch="$1"
	if git show-ref --verify --quiet "refs/heads/$branch"; then
		return 0
	fi
	if git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
		echo "[uiux-promote] create local branch from origin/$branch: $branch"
		git branch --track "$branch" "origin/$branch"
		return 0
	fi
	echo "[uiux-promote] branch not found: $branch"
	exit 1
}

ensure_local_branch "$SOURCE_BRANCH"
ensure_local_branch "$TARGET_BRANCH"

echo "[uiux-promote] switch to target: $TARGET_BRANCH"
git switch "$TARGET_BRANCH"

if git show-ref --verify --quiet "refs/remotes/origin/$TARGET_BRANCH"; then
	echo "[uiux-promote] rebase target onto origin/$TARGET_BRANCH"
	git pull --rebase origin "$TARGET_BRANCH"
fi

if git show-ref --verify --quiet "refs/remotes/origin/main"; then
	if git merge-base --is-ancestor origin/main HEAD; then
		echo "[uiux-promote] target already includes origin/main"
	else
		echo "[uiux-promote] merge origin/main into target"
		git merge origin/main
	fi
fi

if git merge-base --is-ancestor "$SOURCE_BRANCH" HEAD; then
	echo "[uiux-promote] no new commits to promote from $SOURCE_BRANCH"
else
	echo "[uiux-promote] merge $SOURCE_BRANCH -> $TARGET_BRANCH"
	git merge --no-ff "$SOURCE_BRANCH" -m "merge(uiux): promote $SOURCE_BRANCH into $TARGET_BRANCH"
fi

if [ "$RUN_GATE" -eq 1 ]; then
	echo "[uiux-promote] running npm run gate"
	npm run gate
else
	echo "[uiux-promote] running npm run check"
	npm run check
fi

echo "[uiux-promote] done"
echo "[uiux-promote] next: git push origin $TARGET_BRANCH"
