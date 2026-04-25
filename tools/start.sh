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

# 5. 최근 세션 (jsonl 마지막 3개)
echo ""
echo "Recent sessions (last 3):"
for f in $(ls -t memory/sessions/*.jsonl 2>/dev/null | head -3); do
  date=$(basename "$f" .jsonl)
  count=$(wc -l < "$f" | tr -d ' ')
  echo "  $date ($count events)"
done

cat <<EOF

═══════════════════════════════════
Next:
  ./tools/claim.sh <file-domain>     # 작업 시작 시 lock
  cat spec/PRIORITIES.md             # 자세한 P0/P1 보기
  ./tools/verify_design.sh           # 코드 머지 전 drift 검사
  ./tools/end.sh "shipped" "handoff" # 세션 종료 시
═══════════════════════════════════
EOF
