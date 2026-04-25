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
AGENT="$(cat state/current_agent.txt 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
NOW="$(date -u +%H:%M)"

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

# 충돌 검사 — 같은 domain 키워드가 이미 있는지
for d in $(echo "$DOMAIN" | tr ',' '\n' | sed 's/^ *//;s/ *$//'); do
  if grep -F "$d" spec/CONTRACTS.md >/dev/null 2>&1; then
    EXISTING=$(grep -F "$d" spec/CONTRACTS.md | head -1)
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
echo "✓ $AGENT locked: $DOMAIN"
echo "  released by: ./tools/end.sh"
