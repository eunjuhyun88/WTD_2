#!/bin/bash
# save.sh — 세션 중간 체크포인트 (memkraft 기반)
#
# 지금까지 한 일 + 다음에 할 일을 memkraft에 기록.
# 저장 위치:
#   - memory/sessions/{date}.jsonl    (memkraft가 관리, timeline)
#   - memory/sessions/agents/{agent}.jsonl  (per-agent, 우리가 추가)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
MK="$SCRIPT_DIR/mk.sh"

NEXT="${1:-}"

AGENT="$(cat state/current_agent.txt 2>/dev/null || echo "")"
if [ -z "$AGENT" ]; then
  echo "✗ Agent ID 미발번. ./tools/start.sh 먼저 실행하세요."
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse --short HEAD)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DATE="$(date -u +%Y-%m-%d)"

# 1. 최근 commit
DONE_RAW=$(git log --since="3 hours ago" --pretty=format:"%h %s" --no-merges 2>/dev/null | head -10 || true)
DONE_SUMMARY=$(echo "$DONE_RAW" | head -3 | paste -sd '; ' -)

# 2. NEXT 비어있으면 prompt
if [ -z "$NEXT" ]; then
  echo "사용법: ./tools/save.sh \"<다음에 할 일>\""
  echo ""
  echo "지금까지 한 일 (최근 3시간):"
  echo "$DONE_RAW" | sed 's/^/  /' || echo "  (no commits)"
  exit 1
fi

# 3. memkraft log — 두 번 (done + next)
# 중요: tools/mk.sh가 MEMKRAFT_DIR을 repo root memory/로 고정한다.
if [ -x "$MK" ] && [ -d memory ]; then
  # done event
  if [ -n "$DONE_SUMMARY" ]; then
    "$MK" log \
      --event "${AGENT} done: ${DONE_SUMMARY}" \
      --tags "checkpoint,done,${AGENT}" \
      --importance normal >/dev/null 2>&1 || true
  fi

  # next event
  "$MK" log \
    --event "${AGENT} next: ${NEXT}" \
    --tags "checkpoint,next,${AGENT}" \
    --importance normal >/dev/null 2>&1 || true
fi

# 4. agent별 jsonl에도 동일 entry append
AGENT_FILE="memory/sessions/agents/${AGENT}.jsonl"
mkdir -p memory/sessions/agents

# done JSON
DONE_JSON='[]'
if [ -n "$DONE_RAW" ]; then
  DONE_JSON=$(echo "$DONE_RAW" | jq -Rs 'split("\n") | map(select(length > 0))')
fi

# 내가 오픈한 PR
PR_JSON='[]'
if command -v gh >/dev/null 2>&1; then
  PR_JSON=$(gh pr list --author @me --state open --limit 5 --json number,title 2>/dev/null || echo '[]')
fi

ENTRY=$(jq -nc \
  --arg ts "$TS" \
  --arg agent "$AGENT" \
  --arg branch "$BRANCH" \
  --arg sha "$HEAD_SHA" \
  --arg next "$NEXT" \
  --argjson done "$DONE_JSON" \
  --argjson prs "$PR_JSON" \
  '{
    ts: $ts,
    id: $agent,
    event: "checkpoint",
    tags: ["save", "checkpoint", $agent],
    importance: "normal",
    branch: $branch,
    head_sha: $sha,
    done: $done,
    prs_open: $prs,
    next: $next
  }')

echo "$ENTRY" >> "$AGENT_FILE"

# 5. 출력
echo "✓ Checkpoint 저장됨 ($AGENT @ $HEAD_SHA)"
echo ""
if [ -n "$DONE_RAW" ]; then
  echo "지금까지 한 일:"
  echo "$DONE_RAW" | sed 's/^/  /'
else
  echo "지금까지 한 일: (최근 3시간 commit 없음)"
fi
echo ""
echo "다음에 할 일:"
echo "  $NEXT"
echo ""
echo "기록:"
echo "  ./tools/mk.sh log: memory/sessions/${DATE}.jsonl"
echo "  per-agent:    $AGENT_FILE"
