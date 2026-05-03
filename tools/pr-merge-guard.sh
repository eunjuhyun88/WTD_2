#!/usr/bin/env bash
# pr-merge-guard.sh — gh pr merge wrapper: PR author 검증 (W-1004 PR2)
# Usage: tools/pr-merge-guard.sh <pr-number> [gh pr merge flags...]
#   --admin  : 감사 로그 후 통과 (state/merge-overrides.jsonl)
#
# AGENTS.md 룰: `gh pr merge` 직접 호출 금지 — 이 wrapper 경유 필수.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

AGENT_FILE="state/current_agent.txt"
OVERRIDE_FILE="state/merge-overrides.jsonl"

AGENT="$(cat "$AGENT_FILE" 2>/dev/null | tr -d '[:space:]' || echo 'unknown')"
if [ "$AGENT" = "unknown" ] || [ -z "$AGENT" ]; then
  echo "❌ Agent ID 없음. ./tools/start.sh를 먼저 실행하세요." >&2
  exit 1
fi

if [ $# -eq 0 ]; then
  echo "Usage: tools/pr-merge-guard.sh <pr-number> [gh pr merge flags...]" >&2
  echo "       tools/pr-merge-guard.sh <pr-number> --admin [flags...]" >&2
  exit 1
fi

PR_NUM="$1"; shift

# --admin 플래그 감지
ADMIN=false
REMAINING_ARGS=()
for arg in "$@"; do
  [ "$arg" = "--admin" ] && ADMIN=true || REMAINING_ARGS+=("$arg")
done

# PR 작성자 조회
PR_INFO="$(gh pr view "$PR_NUM" --json author,headRefName,title 2>/dev/null)"
PR_AUTHOR="$(echo "$PR_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['author']['login'])" 2>/dev/null || echo '')"
PR_BRANCH="$(echo "$PR_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['headRefName'])" 2>/dev/null || echo '')"
PR_TITLE="$(echo "$PR_INFO" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['title'])" 2>/dev/null || echo '')"

# git user와 AGENT 매핑: git user.name or git user.email에 agent ID 포함 확인
GIT_USER="$(git config user.name 2>/dev/null || echo '')"
GIT_EMAIL="$(git config user.email 2>/dev/null || echo '')"

# 소유 판정: PR branch에 현재 agent의 W-XXXX 포함 OR git user 일치
AGENT_WNUM="$(echo "$AGENT" | grep -oE '[A-Z][0-9]+' | head -1 || true)"
BRANCH_WNUM="$(echo "$PR_BRANCH" | grep -oE 'W-[0-9]+' | head -1 || true)"

OWNER=false
if [ -n "$PR_AUTHOR" ] && [ -n "$GIT_USER" ]; then
  [ "$PR_AUTHOR" = "$GIT_USER" ] && OWNER=true
fi
# branch W-XXXX 매칭 (W-1004 → 같은 work item 에이전트라면 허용)
if [ -n "$BRANCH_WNUM" ]; then
  WNUM_IN_BRANCH="$(echo "$PR_BRANCH" | grep -oE 'W-[0-9]+' || true)"
  # 현재 active work item과 매칭되면 허용 (CURRENT.md 기반)
  if grep -q "$WNUM_IN_BRANCH" work/active/CURRENT.md 2>/dev/null; then
    CURR_AGENT="$(grep "$WNUM_IN_BRANCH" work/active/CURRENT.md | grep -oE '\b[A-Z][0-9]+-[a-z]+-[a-z]+\b' | head -1 || true)"
    [ "$CURR_AGENT" = "$AGENT" ] && OWNER=true
  fi
fi

TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if $OWNER; then
  echo "✅ PR #$PR_NUM ownership confirmed ($PR_AUTHOR). Merging..."
  gh pr merge "$PR_NUM" "${REMAINING_ARGS[@]}"
  exit $?
fi

if $ADMIN; then
  echo "{\"ts\":\"$TS\",\"agent\":\"$AGENT\",\"pr\":$PR_NUM,\"pr_author\":\"$PR_AUTHOR\",\"branch\":\"$PR_BRANCH\",\"action\":\"merge-override\"}" >> "$OVERRIDE_FILE"
  echo "⚠️  merge override: PR #$PR_NUM (author=$PR_AUTHOR) → logged to $OVERRIDE_FILE"
  gh pr merge "$PR_NUM" "${REMAINING_ARGS[@]}"
  exit $?
fi

echo "" >&2
echo "❌ PR merge blocked: ownership mismatch (W-1004)" >&2
echo "" >&2
echo "  PR #$PR_NUM: \"$PR_TITLE\"" >&2
echo "  PR author:   $PR_AUTHOR" >&2
echo "  You:         $AGENT ($GIT_USER)" >&2
echo "" >&2
echo "  자신이 만든 PR만 merge할 수 있습니다." >&2
echo "  긴급 override: tools/pr-merge-guard.sh $PR_NUM --admin [flags]" >&2
echo "" >&2
exit 1
