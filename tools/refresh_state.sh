#!/bin/bash
# refresh_state.sh — Derived state 자동 생성
# 손으로 적으면 거짓말. git/gh CLI에서 진실을 가져온다.
#
# 출력: state/state.json, state/worktrees.json
# Stale 허용: ≤ 5초

set -euo pipefail

# Main repo root (worktree 안에서 실행되어도 main repo 갱신)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p state

# 1. main SHA + 현재 브랜치
git fetch origin main --quiet 2>/dev/null || true
MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse HEAD)"

# 2. open PRs (gh CLI 있을 때만)
if command -v gh >/dev/null 2>&1; then
  OPEN_PRS="$(gh pr list --json number,title,headRefName,mergeable,mergeStateStatus --limit 30 2>/dev/null || echo '[]')"
else
  OPEN_PRS='[]'
fi

# 3. state.json 생성
cat > state/state.json <<EOF
{
  "main_sha": "${MAIN_SHA}",
  "head_sha": "${HEAD_SHA}",
  "current_branch": "${CURRENT_BRANCH}",
  "open_prs": ${OPEN_PRS},
  "regenerated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# 4. worktree 목록 (간소화)
{
  echo '['
  FIRST=1
  while IFS= read -r WT_PATH; do
    [ -z "$WT_PATH" ] && continue
    if [ "$FIRST" = "1" ]; then FIRST=0; else echo ','; fi
    WT_BRANCH="$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    WT_AHEAD="$(git -C "$WT_PATH" rev-list origin/main..HEAD 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
    WT_MOD="$(git -C "$WT_PATH" status --porcelain 2>/dev/null | wc -l | tr -d ' ' || echo 0)"
    printf '  {"path":"%s","branch":"%s","ahead":%s,"modified":%s}' \
      "$WT_PATH" "$WT_BRANCH" "$WT_AHEAD" "$WT_MOD"
  done < <(git worktree list --porcelain | awk '/^worktree / {print $2}')
  echo
  echo ']'
} > state/worktrees.json

echo "✓ state refreshed at $(date -u +%H:%M:%SZ)"
