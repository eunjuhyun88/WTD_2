#!/bin/bash
# start.sh — Multi-agent boot (memkraft 통합)
# MemKraft brief + open-loops + state + spec를 한 번에 보여줌.
# 다음 에이전트가 30-50초 안에 컨텍스트 확보.
#
# 사용:
#   ./tools/start.sh                # 일반 부팅
#   ./tools/start.sh --quiet        # 한 줄만 (Agent ID + main SHA)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
MK="$SCRIPT_DIR/mk.sh"

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

# 1. state 갱신
./tools/refresh_state.sh >/dev/null

MAIN_SHA="$(jq -r .main_sha state/state.json 2>/dev/null || echo unknown)"
CURRENT_BRANCH="$(jq -r .current_branch state/state.json 2>/dev/null || echo unknown)"
HEAD_SHA="$(git rev-parse --short HEAD)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 2. 다음 Agent ID 발번 (가변, 제한 없음)
#    memory/sessions/agents/*.jsonl에 이미 기록된 번호와 git common dir의
#    local atomic counter를 함께 본다. 같은 clone의 여러 worktree에서 동시에
#    start해도 같은 ID를 받지 않게 하는 최소 예약 장치다.
LATEST_ID=0
if [ -d memory/sessions/agents ]; then
  LATEST_ID=$(ls memory/sessions/agents/A*.jsonl 2>/dev/null \
              | sed -E 's|.*/A([0-9]+)\.jsonl|\1|' \
              | sort -n | tail -1 || echo 0)
fi
LATEST_ID=${LATEST_ID:-0}
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
AGENT_STATE_DIR="$GIT_COMMON_DIR/agent-os"
COUNTER_FILE="$AGENT_STATE_DIR/next_agent_number"
LOCK_DIR="$AGENT_STATE_DIR/agent-id.lock"
mkdir -p "$AGENT_STATE_DIR"

for _ in $(seq 1 100); do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
    break
  fi
  sleep 0.05
done

if [ ! -d "$LOCK_DIR" ]; then
  echo "✗ Could not reserve Agent ID lock: $LOCK_DIR" >&2
  exit 1
fi

NEXT_NUM=$((10#${LATEST_ID} + 1))
if [ -f "$COUNTER_FILE" ]; then
  COUNTER_NUM="$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)"
  COUNTER_NUM="${COUNTER_NUM:-0}"
  case "$COUNTER_NUM" in
    ''|*[!0-9]*) COUNTER_NUM=0 ;;
  esac
  if [ "$COUNTER_NUM" -gt "$NEXT_NUM" ]; then
    NEXT_NUM="$COUNTER_NUM"
  fi
fi
NEXT_ID=$(printf "A%03d" "$NEXT_NUM")
echo "$((NEXT_NUM + 1))" > "$COUNTER_FILE"
rmdir "$LOCK_DIR" 2>/dev/null || true
trap - EXIT

echo "$NEXT_ID" > state/current_agent.txt
AGENT_FILE="memory/sessions/agents/${NEXT_ID}.jsonl"
mkdir -p memory/sessions/agents

if [ ! -s "$AGENT_FILE" ]; then
  START_ENTRY=$(jq -nc \
    --arg ts "$TS" \
    --arg agent "$NEXT_ID" \
    --arg branch "$CURRENT_BRANCH" \
    --arg baseline "$MAIN_SHA" \
    --arg sha "$HEAD_SHA" \
    '{
      ts: $ts,
      id: $agent,
      event: "session started",
      tags: ["session", "start", $agent],
      importance: "normal",
      branch: $branch,
      baseline: $baseline,
      head_sha: $sha
    }')
  echo "$START_ENTRY" >> "$AGENT_FILE"

  if [ -x "$MK" ] && [ -d memory ]; then
    "$MK" log \
      --event "${NEXT_ID} session started | branch: ${CURRENT_BRANCH} | baseline: ${MAIN_SHA:0:8}" \
      --tags "session,start,${NEXT_ID}" \
      --importance normal >/dev/null 2>&1 || true
  fi
fi

# live heartbeat 파일 생성 (동시 실행 에이전트 가시성)
"$SCRIPT_DIR/live.sh" write 2>/dev/null || true

if [ $QUIET -eq 1 ]; then
  echo "Agent: $NEXT_ID | main: ${MAIN_SHA:0:8} | branch: $CURRENT_BRANCH"
  exit 0
fi

# 3. 부팅 출력 헤더
cat <<EOF
═══════════════════════════════════
You are Agent ${NEXT_ID}
═══════════════════════════════════
Baseline:    ${MAIN_SHA:0:8}  (origin/main)
Branch:      ${CURRENT_BRANCH}

Open PRs:
EOF

jq -r '.open_prs[] | "  #\(.number) — \(.title) [\(.mergeable // "?")]"' state/state.json 2>/dev/null \
  | head -10 || echo "  (none or gh CLI unavailable)"

echo ""
echo "Live agents (now):"
"$SCRIPT_DIR/live.sh" show 2>/dev/null || echo "  (none)"

echo ""
echo "Active locks (claimed domains):"
if [ -f spec/CONTRACTS.md ]; then
  grep -E "^\| A[0-9]+" spec/CONTRACTS.md 2>/dev/null \
    | sed 's/^/  /' \
    | head -10 || echo "  (none)"
else
  echo "  (none)"
fi

echo ""
echo "Priorities (P0/P1):"
if [ -f spec/PRIORITIES.md ]; then
  grep -E "^## P[0-9]" spec/PRIORITIES.md | head -5 | sed 's/^/  /'
else
  echo "  (spec/PRIORITIES.md not yet created)"
fi

# 4. design verification summary
if [ -x "$SCRIPT_DIR/verify_design.sh" ]; then
  echo ""
  echo "Design status:"
  "$SCRIPT_DIR/verify_design.sh" --summary 2>/dev/null | sed 's/^/  /' \
    || echo "  DRIFT ⚠ run ./tools/verify_design.sh"
fi

# 5. memkraft 통합 — open loops + dream 시그널
if [ -x "$MK" ] && [ -d memory ]; then
  echo ""
  echo "Open loops (memkraft):"
  "$MK" open-loops --dry-run 2>/dev/null | head -8 | sed 's/^/  /' || echo "  (none)"

  echo ""
  echo "Memory health (memkraft dream):"
  "$MK" dream --dry-run 2>/dev/null | head -5 | sed 's/^/  /' || true
fi

# 6. 최근 5개 에이전트 (per-agent jsonl 기준)
echo ""
echo "Recent agents (last 5):"
LATEST_AGENTS=$(ls -t memory/sessions/agents/A*.jsonl 2>/dev/null | head -5)
if [ -n "$LATEST_AGENTS" ]; then
  for f in $LATEST_AGENTS; do
    aid=$(basename "$f" .jsonl)
    last=$(tail -1 "$f" 2>/dev/null | jq -r '.event // "?"' 2>/dev/null | head -c 70)
    echo "  $aid — $last"
  done
else
  echo "  (no per-agent records yet)"
fi

# 7. 직전 에이전트 handoff
PREV_ID=$(printf "A%03d" $((10#${LATEST_ID:-0})))
PREV_FILE="memory/sessions/agents/${PREV_ID}.jsonl"
if [ -f "$PREV_FILE" ]; then
  echo ""
  echo "Previous agent ($PREV_ID) handoff:"
  tail -1 "$PREV_FILE" 2>/dev/null \
    | jq -r '"  shipped: \(.shipped // "?")\n  handoff: \(.handoff // .next // "?")"' 2>/dev/null \
    || true
fi

cat <<EOF

═══════════════════════════════════
Slash commands:
  /claim "<file-domain>"      lock 후 작업 시작
  /save "<다음에 할 일>"       세션 중간 체크포인트
  /end "shipped" "handoff"    세션 종료
  /agent-status               현재 상태 한눈에

MemKraft direct:
  ./tools/mk.sh retro              일일 회고 (Well/Bad/Next 자동 추출)
  ./tools/mk.sh search "query"     메모리 검색
  ./tools/mk.sh lookup "query"     entity/decision/incident 조회
═══════════════════════════════════
EOF
