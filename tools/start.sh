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

# 2. 다음 Agent ID 발번 (가변, 제한 없음) — agent별 jsonl에서 가장 큰 번호 +1
LATEST_ID=0
if [ -d memory/sessions/agents ]; then
  LATEST_ID=$(ls memory/sessions/agents/A*.jsonl 2>/dev/null \
              | sed -E 's|.*/A([0-9]+)\.jsonl|\1|' \
              | sort -n | tail -1 || echo 0)
fi
LATEST_ID=${LATEST_ID:-0}
NEXT_NUM=$((10#${LATEST_ID} + 1))
NEXT_ID=$(printf "A%03d" $NEXT_NUM)
echo "$NEXT_ID" > state/current_agent.txt

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
echo "Active locks:"
if [ -f spec/CONTRACTS.md ]; then
  grep -E "^\| A[0-9]+" spec/CONTRACTS.md 2>/dev/null \
    | sed 's/^/  /' \
    | head -10 || echo "  (none)"
else
  echo "  (spec/CONTRACTS.md not yet created)"
fi

echo ""
echo "Priorities (P0/P1):"
if [ -f spec/PRIORITIES.md ]; then
  grep -E "^## P[0-9]" spec/PRIORITIES.md | head -5 | sed 's/^/  /'
else
  echo "  (spec/PRIORITIES.md not yet created)"
fi

# 4. memkraft 통합 — open loops + dream 시그널
if [ -x "$MK" ] && [ -d memory ]; then
  echo ""
  echo "Open loops (memkraft):"
  "$MK" open-loops --dry-run 2>/dev/null | head -8 | sed 's/^/  /' || echo "  (none)"

  echo ""
  echo "Memory health (memkraft dream):"
  "$MK" dream --dry-run 2>/dev/null | head -5 | sed 's/^/  /' || true
fi

# 5. 최근 5개 에이전트 (per-agent jsonl 기준)
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

# 6. 직전 에이전트 handoff
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
