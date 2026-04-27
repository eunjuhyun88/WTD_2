#!/bin/bash
# complete_work_item.sh — work item 1개를 active → completed로 이동
#
# 사용:
#   ./tools/complete_work_item.sh W-0234
#   ./tools/complete_work_item.sh W-0234-some-slug
#   ./tools/complete_work_item.sh W-0234 --force        # Exit Criteria 미충족 강제
#
# 동작:
#   1. work/active/<arg>*.md 매칭 (slug 일부 가능)
#   2. Exit Criteria 진척 확인 (--force 없으면 100% 강제)
#   3. git mv work/active → work/completed
#   4. CURRENT.md 활성표 행 제거
#   5. memkraft log

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ $# -lt 1 ]; then
  echo "Usage: $0 <W-XXXX-slug-or-prefix> [--force]"
  exit 1
fi

ARG="$1"
FORCE="${2:-}"

# 1. 매칭 파일
MATCHES=$(ls work/active/${ARG}*.md 2>/dev/null || true)
if [ -z "$MATCHES" ]; then
  echo "✗ work/active/${ARG}*.md — 매칭 없음"
  exit 1
fi

COUNT=$(echo "$MATCHES" | wc -l | tr -d ' ')
if [ "$COUNT" -gt 1 ]; then
  echo "✗ 매칭 ${COUNT}개. 정확한 슬러그 지정:"
  echo "$MATCHES" | sed 's/^/  /'
  exit 1
fi

FILE="$MATCHES"
FNAME=$(basename "$FILE")
WSLUG="${FNAME%.md}"

# 2. Exit Criteria 검증
EC_TOTAL=$(grep -E '^- \[( |x)\]' "$FILE" 2>/dev/null | wc -l | tr -d ' ')
EC_DONE=$(grep -E '^- \[x\]' "$FILE" 2>/dev/null | wc -l | tr -d ' ')

if [ "$EC_TOTAL" -gt 0 ] && [ "$EC_DONE" -lt "$EC_TOTAL" ] && [ "$FORCE" != "--force" ]; then
  echo "✗ Exit Criteria 미충족: ${EC_DONE}/${EC_TOTAL}"
  echo "  강제 완료: $0 $ARG --force"
  exit 1
fi

# 3. git mv
mkdir -p work/completed
git mv "$FILE" "work/completed/$FNAME"

# 4. CURRENT.md 활성표 행 제거
if [ -f work/active/CURRENT.md ] && grep -q "\`${WSLUG}\`" work/active/CURRENT.md; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^| \`${WSLUG}\`/d" work/active/CURRENT.md
  else
    sed -i "/^| \`${WSLUG}\`/d" work/active/CURRENT.md
  fi
  git add work/active/CURRENT.md
fi

# 5. memkraft log
MK="$ROOT/tools/mk.sh"
if [ -x "$MK" ] && [ -d memory ]; then
  "$MK" log \
    --event "Work item ${WSLUG} 완료 → work/completed/" \
    --tags "work,complete,${WSLUG}" \
    --importance high >/dev/null 2>&1 || true
fi

echo "✓ ${FNAME} → work/completed/"
echo "✓ CURRENT.md 활성표 갱신"
echo "  Exit Criteria: ${EC_DONE}/${EC_TOTAL}${FORCE:+ (forced)}"
