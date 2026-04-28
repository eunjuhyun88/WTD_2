#!/bin/bash
# check_drift.sh — drift 검증 (보고만, 자동 수정 안 함)
#
# E-1: CURRENT.md 표기 main SHA == origin/main 검증
# E-2: W-#### 충돌 (같은 번호 다른 파일)
# E-3: CURRENT.md 활성표 listed인데 파일 없음 (validator 위반)
# E-4: HEAD vs origin/main 차이 (rebase/merge 권장)
#
# Usage: ./tools/check_drift.sh [--strict]
#   --strict: WARN > 0이면 exit 1 (CI/hook용)

set -eo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

WARN=0
STRICT=0
for arg in "$@"; do
  if [ "$arg" = "--strict" ]; then STRICT=1; fi
done

echo "=== Drift Check ==="

# E-1
DECLARED=$(grep -oE '^`[a-f0-9]{8}`' work/active/CURRENT.md 2>/dev/null | head -1 | tr -d '`' || true)
ACTUAL=$(git rev-parse --short=8 origin/main 2>/dev/null || echo "")
if [ -n "$DECLARED" ] && [ -n "$ACTUAL" ] && [ "$DECLARED" != "$ACTUAL" ]; then
  echo "⚠ E-1: CURRENT.md main SHA \`$DECLARED\` ≠ origin/main \`$ACTUAL\`"
  WARN=$((WARN + 1))
fi

# E-4
git fetch origin main >/dev/null 2>&1 || true
AHEAD=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
if [ "$AHEAD" -gt 0 ]; then
  UPSTREAM=$(git rev-parse --abbrev-ref @{u} 2>/dev/null || echo "")
  LOCAL_AHEAD="0"
  if [ -n "$UPSTREAM" ]; then
    LOCAL_AHEAD=$(git rev-list --count "${UPSTREAM}..HEAD" 2>/dev/null || echo "0")
  fi
  echo "⚠ E-4: origin/main이 ${AHEAD} commit 앞섬 (본인 commit ${LOCAL_AHEAD}개)"
  if [ "$LOCAL_AHEAD" = "0" ]; then
    echo "    추천: git merge --ff-only origin/main"
  else
    echo "    추천: git merge origin/main         # 안전 (push된 commit 보존)"
    echo "          git rebase origin/main         # push 안 한 경우만"
  fi
  WARN=$((WARN + 1))
fi

# E-2
DUPS=$(ls work/active/ 2>/dev/null | grep -oE '^W-[0-9]{4}' | sort | uniq -c | awk '$1 > 1 {print "    "$2" ("$1"개)"}')
if [ -n "$DUPS" ]; then
  echo "⚠ E-2: W-#### 충돌:"
  echo "$DUPS"
  MAX=$(ls work/active/ 2>/dev/null | grep -oE '^W-[0-9]{4}' | sort -u | tail -1 | sed 's/^W-//')
  if [ -n "$MAX" ]; then
    NEXT=$(printf "W-%04d" $((10#$MAX + 1)))
    echo "    다음 사용 가능 번호: $NEXT"
  fi
  WARN=$((WARN + 1))
fi

# E-3
ACTIVE_LISTED=$(awk 'BEGIN{f=0} /^## 활성 Work Items/{f=1; next} f && (/^---$/ || /^## /){f=0} f' work/active/CURRENT.md 2>/dev/null \
  | grep -oE '`W-[0-9]{4}-[a-z0-9-]+`' | tr -d '`' | sort -u || true)
MISSING=""
for w in $ACTIVE_LISTED; do
  if [ ! -f "work/active/${w}.md" ]; then
    MISSING="$MISSING $w"
  fi
done
if [ -n "$MISSING" ]; then
  echo "⚠ E-3: CURRENT.md 활성표 listed인데 파일 없음:"
  echo "$MISSING" | tr ' ' '\n' | grep -v '^$' | sed 's/^/    /'
  WARN=$((WARN + 1))
fi

if [ "$WARN" = "0" ]; then
  echo "✓ Drift 없음"
fi

if [ "$STRICT" = "1" ] && [ "$WARN" -gt 0 ]; then
  exit 1
fi
exit 0
