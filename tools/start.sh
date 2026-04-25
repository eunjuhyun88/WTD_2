#!/bin/bash
# start.sh — Multi-agent boot 통합
# MemKraft + state + spec를 한 번에 보여줌. 다음 에이전트가 30-50초 안에 컨텍스트 확보.
#
# 사용:
#   ./tools/start.sh                # 일반 부팅
#   ./tools/start.sh --quiet        # 한 줄만 (Agent ID + main SHA)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

# 1. state 갱신
./tools/refresh_state.sh >/dev/null

MAIN_SHA="$(jq -r .main_sha state/state.json 2>/dev/null || echo unknown)"
CURRENT_BRANCH="$(jq -r .current_branch state/state.json 2>/dev/null || echo unknown)"

# 2. 다음 Agent ID 발번 (가변, 제한 없음)
# memory/sessions/*.jsonl에서 가장 큰 A### 찾고 +1
LATEST_ID=$(grep -hoE '"id":"A[0-9]+"' memory/sessions/*.jsonl 2>/dev/null \
            | sed 's/.*A\([0-9]*\).*/\1/' \
            | sort -n | tail -1 || true)
LATEST_ID=${LATEST_ID:-0}
NEXT_NUM=$((10#${LATEST_ID} + 1))
NEXT_ID=$(printf "A%03d" $NEXT_NUM)
echo "$NEXT_ID" > state/current_agent.txt

if [ $QUIET -eq 1 ]; then
  echo "Agent: $NEXT_ID | main: ${MAIN_SHA:0:8} | branch: $CURRENT_BRANCH"
  exit 0
fi

# 3. 부팅 출력
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

# 4. MemKraft session-start (있으면 실행)
if [ -x app/scripts/dev/memkraft-session-start.sh ]; then
  echo ""
  echo "MemKraft signals:"
  bash app/scripts/dev/memkraft-session-start.sh 2>/dev/null | head -10 || true
fi

# 5. 최근 에이전트 이력 (agent별 파일이 있으면 거기서, 없으면 date jsonl에서)
echo ""
echo "Recent agents (last 5):"
LATEST_AGENTS=$(ls -t memory/sessions/agents/*.jsonl 2>/dev/null | head -5)
if [ -n "$LATEST_AGENTS" ]; then
  for f in $LATEST_AGENTS; do
    aid=$(basename "$f" .jsonl)
    last=$(tail -1 "$f" 2>/dev/null | jq -r '.event // "?"' 2>/dev/null | head -c 70)
    echo "  $aid — $last"
  done
else
  echo "  (no per-agent records yet — first agent to use ./tools/end.sh creates them)"
fi

# 내 이력 (NEXT_ID는 새 발번이라 비어있음, 직전 ID 표시)
PREV_ID=$(printf "A%03d" $((10#${LATEST_ID:-0})))
PREV_FILE="memory/sessions/agents/${PREV_ID}.jsonl"
if [ -f "$PREV_FILE" ]; then
  echo ""
  echo "Previous agent ($PREV_ID) handoff:"
  tail -1 "$PREV_FILE" 2>/dev/null | jq -r '"  shipped: \(.shipped // "?")\n  handoff: \(.handoff // "?")"' 2>/dev/null || true
fi

cat <<EOF

═══════════════════════════════════
Next:
  ./tools/claim.sh <file-domain>     # 작업 시작 시 lock
  cat spec/PRIORITIES.md             # 자세한 P0/P1 보기
  ./tools/end.sh "shipped" "handoff" # 세션 종료 시
═══════════════════════════════════
EOF
