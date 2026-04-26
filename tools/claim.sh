#!/bin/bash
# claim.sh — file-domain ownership lock
# 다른 에이전트가 같은 domain 잡고 있으면 거절 (병렬 머지 충돌 차단)
#
# 사용: ./tools/claim.sh "engine/search/, app/copy-trading/"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ $# -lt 1 ]; then
  echo "Usage: $0 \"<file-domain>\""
  echo "Example: $0 \"engine/search/, app/copy-trading/\""
  exit 1
fi

DOMAIN="$1"
FORCE=0
[ "${2:-}" = "--force" ] && FORCE=1

AGENT="$(cat state/current_agent.txt 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
NOW="$(date -u +%H:%M)"

# ── Non-Goal / Frozen gate (CHARTER.md §Frozen) ─────────────────
# 매칭되면 확인 프롬프트. --force로 통과 가능 (사유 기록).
NONGOAL_REGEX='copy[._ ]?trad|copy_trading|leaderboard.*sub|memkraft|multi[._ -]?agent|chart[._ ]?polish|w-0212|session[._ ]?handoff[._ ]?upgrade|new[._ ]?slash'
COMBINED="$DOMAIN $BRANCH"
if echo "$COMBINED" | grep -iE "$NONGOAL_REGEX" >/dev/null 2>&1; then
  MATCH=$(echo "$COMBINED" | grep -iEo "$NONGOAL_REGEX" | head -1)
  echo "⚠️  Non-Goal / Frozen domain 감지: '$MATCH'"
  echo "   spec/CHARTER.md §Frozen 참조 — 이 작업은 코어가 아닙니다."
  echo ""
  if [ -f spec/CHARTER.md ]; then
    awk '/^## 🚫 Frozen/,/^## 🛡/' spec/CHARTER.md | head -20 | sed 's/^/   /'
    echo ""
  fi
  if [ "$FORCE" -ne 1 ]; then
    echo "계속하려면 --force 플래그 + 사유:"
    echo "  ./tools/claim.sh \"$DOMAIN\" --force"
    echo ""
    echo "또는 코어 작업으로 변경 (spec/PRIORITIES.md 참조)."
    exit 2
  fi
  echo "[FORCE] Non-Goal claim 통과. 사유는 PR 본문에 명시 필수."
  echo "$(date -u +%FT%TZ) | $AGENT | force-claimed: $DOMAIN | branch: $BRANCH" \
    >> state/nongoal_force_log.txt 2>/dev/null || true
fi

# CONTRACTS.md 없으면 생성
if [ ! -f spec/CONTRACTS.md ]; then
  cat > spec/CONTRACTS.md <<EOF
# Active File-Domain Locks

다른 에이전트가 같은 domain에 claim하면 \`./tools/claim.sh\`가 거절합니다.
세션 종료 시 \`./tools/end.sh\`가 자동으로 lock을 제거합니다.

| Agent | Domain | Branch | Started |
|---|---|---|---|
EOF
fi

# 충돌 검사 — lock table row만 검사한다. 설명 문구/예시 텍스트에서
# domain 문자열이 발견되어 false-positive가 나는 것을 막는다.
for d in $(echo "$DOMAIN" | tr ',' '\n' | sed 's/^ *//;s/ *$//'); do
  if grep -E '^\| A[0-9]+' spec/CONTRACTS.md | grep -F "$d" >/dev/null 2>&1; then
    EXISTING=$(grep -E '^\| A[0-9]+' spec/CONTRACTS.md | grep -F "$d" | head -1)
    echo "✗ Domain '$d' already claimed:"
    echo "  $EXISTING"
    echo ""
    echo "Resolve options:"
    echo "  1. 다른 domain 선택"
    echo "  2. 기존 에이전트와 조정 후 그쪽이 ./tools/end.sh 실행"
    exit 1
  fi
done

# Lock 추가
echo "| $AGENT | $DOMAIN | $BRANCH | $NOW |" >> spec/CONTRACTS.md

# live 파일에 claimed domain 반영 (다른 에이전트가 실시간으로 볼 수 있게)
"$SCRIPT_DIR/live.sh" update "$DOMAIN" 2>/dev/null || true

echo "✓ $AGENT locked: $DOMAIN"
echo "  released by: ./tools/end.sh"
