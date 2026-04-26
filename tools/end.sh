#!/bin/bash
# end.sh — 세션 종료 (memkraft 통합)
#
# 자동:
#   1. memkraft log: session ended event
#   2. memkraft retro --dry-run: Well/Bad/Next 자동 추출 표시
#   3. memkraft distill-decisions: decision 후보 추출 안내
#   4. agent별 jsonl append (per-agent history)
#   5. spec/CONTRACTS.md lock 해제
#   6. state 갱신
#
# 사용:
#   ./tools/end.sh "PR #321" "git checkout -b feat/w-0146" [optional lesson]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
MK="$SCRIPT_DIR/mk.sh"

if [ $# -lt 2 ]; then
  echo "Usage: $0 \"<shipped>\" \"<handoff>\" [lesson]"
  echo "Example: $0 \"PR #321\" \"git checkout -b feat/w-0146\" \"FeatureWindowStore migration\""
  exit 1
fi

SHIPPED="$1"
HANDOFF="$2"
LESSON="${3:-}"

AGENT="$(cat state/current_agent.txt 2>/dev/null || echo "")"
if [ -z "$AGENT" ] || [ "$AGENT" = "unknown" ]; then
  echo "✗ Agent ID 미발번 (state/current_agent.txt 없음 또는 'unknown')." >&2
  echo "  이 worktree에서 ./tools/start.sh를 먼저 실행하세요." >&2
  echo "  (silent 'unknown' fallback은 per-agent jsonl 손실을 일으켜 제거됐습니다.)" >&2
  exit 1
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
END_SHA="$(git rev-parse HEAD)"
DATE="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. memkraft log — session end + lesson
# 중요: tools/mk.sh가 MEMKRAFT_DIR을 repo root memory/로 고정한다.
if [ -x "$MK" ] && [ -d memory ]; then
  "$MK" log \
    --event "${AGENT} session ended | shipped: ${SHIPPED} | handoff: ${HANDOFF}" \
    --tags "session,end,${AGENT}" \
    --importance high >/dev/null 2>&1 || true

  if [ -n "$LESSON" ]; then
    "$MK" log \
      --event "${AGENT} lesson: ${LESSON}" \
      --tags "lesson,${AGENT}" \
      --importance high >/dev/null 2>&1 || true
  fi
fi

# 2. agent별 jsonl append (memkraft가 안 하는 부분)
AGENT_FILE="memory/sessions/agents/${AGENT}.jsonl"
mkdir -p memory/sessions/agents

ENTRY=$(jq -nc \
  --arg ts "$TS" \
  --arg agent "$AGENT" \
  --arg event "session ended ($AGENT)" \
  --arg shipped "$SHIPPED" \
  --arg handoff "$HANDOFF" \
  --arg branch "$BRANCH" \
  --arg sha "$END_SHA" \
  '{
    ts: $ts,
    id: $agent,
    event: $event,
    tags: ["session", "end", $agent],
    importance: "high",
    branch: $branch,
    end_sha: $sha,
    shipped: $shipped,
    handoff: $handoff
  }')

echo "$ENTRY" >> "$AGENT_FILE"

if [ -n "$LESSON" ]; then
  LESSON_ENTRY=$(jq -nc \
    --arg ts "$TS" \
    --arg agent "$AGENT" \
    --arg event "lesson: $LESSON" \
    '{ts: $ts, id: $agent, event: $event, tags: ["lesson", $agent], importance: "high"}')
  echo "$LESSON_ENTRY" >> "$AGENT_FILE"
fi

# 3. design drift 확인 — 실패하면 lock을 유지한 채 종료를 중단한다.
if [ -x "$SCRIPT_DIR/verify_design.sh" ]; then
  "$SCRIPT_DIR/verify_design.sh"
fi

# 4. spec/CONTRACTS.md에서 자기 lock 제거
if [ -f spec/CONTRACTS.md ]; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^| ${AGENT} |/d" spec/CONTRACTS.md
  else
    sed -i "/^| ${AGENT} |/d" spec/CONTRACTS.md
  fi
fi

# 5. live heartbeat 파일 삭제 (세션 종료 표시)
"$SCRIPT_DIR/live.sh" delete 2>/dev/null || true

# 6. state 갱신
./tools/refresh_state.sh >/dev/null

# 7. memkraft retro --dry-run (자동 회고 미리보기)
echo ""
echo "═══════════════════════════════════"
echo "✓ Session $AGENT closed"
echo "═══════════════════════════════════"
echo "  shipped: $SHIPPED"
echo "  handoff: $HANDOFF"
[ -n "$LESSON" ] && echo "  lesson:  $LESSON"
echo "  agent jsonl: $AGENT_FILE"

if [ -x "$MK" ] && [ -d memory ]; then
  echo ""
  echo "Daily retro (memkraft retro):"
  "$MK" retro --dry-run 2>/dev/null | head -20 | sed 's/^/  /' || true

  echo ""
  echo "Decision candidates (memkraft distill-decisions):"
  "$MK" distill-decisions 2>/dev/null | head -10 | sed 's/^/  /' || echo "  (none)"

  echo ""
  echo "다음 단계:"
  echo "  - 회고 정식 저장: ./tools/mk.sh retro"
  echo "  - 결정 추출 정식: ./tools/mk.sh distill-decisions --apply"
fi
