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

# 5a. W-0272 Phase 2 — close session span if one was opened by start.sh
if [ -f state/current_session_span.txt ] && command -v node >/dev/null 2>&1 && [ -f tools/trace-emit.mjs ]; then
  SESSION_SPAN_ID="$(cat state/current_session_span.txt 2>/dev/null || true)"
  if [ -n "$SESSION_SPAN_ID" ]; then
    SHIPPED_ESC="$(printf '%s' "$SHIPPED" | tr '\n' ' ' | head -c 200)"
    HANDOFF_ESC="$(printf '%s' "$HANDOFF" | tr '\n' ' ' | head -c 200)"
    node tools/trace-emit.mjs end-span "$SESSION_SPAN_ID" \
      --status ok \
      --attr "shipped=$SHIPPED_ESC" \
      --attr "handoff=$HANDOFF_ESC" >/dev/null 2>&1 || true
    rm -f state/current_session_span.txt state/current_trace.txt 2>/dev/null || true
  fi
fi

# 5b. worktree registry status=done (SSOT)
"$SCRIPT_DIR/worktree-registry.sh" set status done >/dev/null 2>&1 || true

# 5c. branch push hint (본인 commit 있고 PR 없을 때만)
LOCAL_AHEAD_END=0
UPSTREAM_END="$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo "")"
[ -n "$UPSTREAM_END" ] && LOCAL_AHEAD_END="$(git rev-list --count "$UPSTREAM_END..HEAD" 2>/dev/null || echo 0)"
HAS_PR=0
if command -v gh >/dev/null 2>&1; then
  gh pr view --json number 2>/dev/null | jq -e '.number' >/dev/null 2>&1 && HAS_PR=1
fi
if [ "${LOCAL_AHEAD_END:-0}" -gt 0 ] && [ "$HAS_PR" = "0" ]; then
  echo ""
  echo "📤 미푸시 commit ${LOCAL_AHEAD_END}개 — 권장:"
  echo "   git push -u origin $BRANCH"
  echo "   gh pr create --fill"
fi

# 6. state 갱신
./tools/refresh_state.sh >/dev/null

# 6.5 sweep + drift check (재발 방지 자동화)
if [ -x "$SCRIPT_DIR/sweep_session_artifacts.sh" ]; then
  echo ""
  "$SCRIPT_DIR/sweep_session_artifacts.sh" || true
fi
if [ -x "$SCRIPT_DIR/check_drift.sh" ]; then
  echo ""
  "$SCRIPT_DIR/check_drift.sh" || true
fi

# W-1004 inbox — 미답 메시지 경고 (non-blocking)
if [ -f "$SCRIPT_DIR/agent-message.sh" ]; then
  UNREAD_END="$(bash "$SCRIPT_DIR/agent-message.sh" count --unread 2>/dev/null || echo 0)"
  if [ "${UNREAD_END:-0}" -gt 0 ]; then
    echo ""
    echo "⚠️  미읽은 메시지 ${UNREAD_END}개 — 종료 전 확인 권장:"
    bash "$SCRIPT_DIR/agent-message.sh" list --unread 2>/dev/null || true
  fi
fi

# W-1004 ownership 자동 해제 — 파일 해제 안내 (non-blocking)
if [ -f "$SCRIPT_DIR/own.sh" ] && [ -f state/file-ownership.jsonl ]; then
  MY_CLAIMS="$(bash "$SCRIPT_DIR/own.sh" list --mine 2>/dev/null | grep -v '(no active claims)' | wc -l | tr -d ' ' || echo 0)"
  if [ "${MY_CLAIMS:-0}" -gt 0 ]; then
    echo ""
    echo "📋 남아있는 파일 claim ${MY_CLAIMS}개 (24h TTL 자동 만료):"
    bash "$SCRIPT_DIR/own.sh" list --mine 2>/dev/null || true
    echo "   → 즉시 해제: tools/own.sh release <file>"
  fi
fi

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
