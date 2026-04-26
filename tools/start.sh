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

# 2. 다음 Agent ID 발번 — <identity>-<YYYY-MM-DD>-<seq>
# - identity: 기본 "claude", env MEMKRAFT_IDENTITY로 오버라이드 가능 (codex/cursor/사용자 등)
# - date: KST 날짜
# - seq: 같은 (identity, date) 안에서 01/02/03... 자동 증가
IDENTITY="${MEMKRAFT_IDENTITY:-claude}"
DATE_KST="$(TZ=Asia/Seoul date +%Y-%m-%d)"
PREFIX="${IDENTITY}-${DATE_KST}"

# 오늘 같은 identity의 최대 seq 찾기 (파일명 + jsonl 내부 id 모두 검사)
MAX_SEQ_FILE=$(ls memory/sessions/agents/${PREFIX}-*.jsonl 2>/dev/null \
               | sed "s|.*${PREFIX}-\([0-9][0-9]*\)\.jsonl|\1|" \
               | sort -n | tail -1 || true)
MAX_SEQ_INNER=$(grep -hoE "\"id\":\"${PREFIX}-[0-9]+\"" memory/sessions/agents/*.jsonl 2>/dev/null \
                | sed "s/.*${PREFIX}-\([0-9][0-9]*\).*/\1/" \
                | sort -n | tail -1 || true)
MAX_SEQ=0
[ -n "${MAX_SEQ_FILE:-}" ] && [ "$MAX_SEQ_FILE" -gt "$MAX_SEQ" ] && MAX_SEQ=$MAX_SEQ_FILE
[ -n "${MAX_SEQ_INNER:-}" ] && [ "$MAX_SEQ_INNER" -gt "$MAX_SEQ" ] && MAX_SEQ=$MAX_SEQ_INNER
NEXT_SEQ=$(printf "%02d" $((10#${MAX_SEQ} + 1)))
NEXT_ID="${PREFIX}-${NEXT_SEQ}"
echo "$NEXT_ID" > state/current_agent.txt

# 직전 ID (같은 identity 우선, 없으면 어떤 세션이든 가장 최근)
LATEST_ID=""
if [ "$MAX_SEQ" -gt 0 ]; then
  LATEST_ID="${PREFIX}-$(printf "%02d" $MAX_SEQ)"
else
  # 오늘 첫 세션 — 가장 최근 수정된 agent jsonl 사용
  LATEST_FILE=$(ls -t memory/sessions/agents/*.jsonl 2>/dev/null | head -1)
  [ -n "$LATEST_FILE" ] && LATEST_ID=$(basename "$LATEST_FILE" .jsonl)
fi

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

# 직전 세션 인계 표시
if [ -n "$LATEST_ID" ]; then
  PREV_FILE="memory/sessions/agents/${LATEST_ID}.jsonl"
  if [ -f "$PREV_FILE" ]; then
    echo ""
    echo "Previous session ($LATEST_ID) handoff:"
    tail -1 "$PREV_FILE" 2>/dev/null | jq -r '"  shipped: \(.shipped // "?")\n  handoff: \(.handoff // "?")"' 2>/dev/null || true
  fi
fi

cat <<EOF

═══════════════════════════════════
Next:
  ./tools/claim.sh <file-domain>     # 작업 시작 시 lock
  cat spec/PRIORITIES.md             # 자세한 P0/P1 보기
  ./tools/end.sh "shipped" "handoff" # 세션 종료 시
═══════════════════════════════════
EOF
