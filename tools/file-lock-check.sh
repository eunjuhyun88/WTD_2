#!/usr/bin/env bash
# file-lock-check.sh — 새 탭 에이전트 시작 전 파일 충돌 감지
#
# W-1003: 에이전트 간 파일 충돌 방지 (CURRENT.md Files 컬럼 기반)
#
# 사용: ./tools/file-lock-check.sh [file1 file2 ...]
#   인수 없음 → 현재 락 테이블 전체 출력 (상태 확인)
#   인수 있음 → 해당 파일이 다른 에이전트에 락됐는지 확인
#
# 종료 코드: 0 = 충돌 없음, 1 = 충돌 있음 또는 stale 락 있음

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURRENT_MD="$REPO_ROOT/work/active/CURRENT.md"
FAIL=0

# CURRENT.md 파싱 — 락 테이블 섹션만 추출 (다음 ## 섹션 전까지)
parse_lock_table() {
  awk '/^## 에이전트 락 테이블/{found=1; next} found && /^## /{exit} found && /^\|/{print}' "$CURRENT_MD" \
    | grep -v "^|--\|Work Item\|에이전트\|모두 free\|^| — " \
    || true
}

# stale 락 감지 (24h 이상) — 행에 날짜가 없어 파일 mtime 기반으로 대체
check_stale() {
  local stale_threshold=86400  # 24h in seconds
  local now
  now=$(date +%s)
  local mtime
  mtime=$(stat -f %m "$CURRENT_MD" 2>/dev/null || stat -c %Y "$CURRENT_MD" 2>/dev/null || echo 0)
  local age=$(( now - mtime ))
  if [[ $age -gt $stale_threshold ]]; then
    echo "  ⚠️  CURRENT.md 마지막 수정 ${age}s 전 (24h+) — stale 락 가능성"
    echo "     확인: 락 테이블에 실제 진행중 작업이 없으면 행 삭제"
    FAIL=1
  fi
}

echo "=== file-lock-check: 파일 충돌 검사 ==="
echo ""

# ── 락 테이블 파싱 ──────────────────────────────────────────────
LOCK_ROWS=$(parse_lock_table)

if [[ -z "$LOCK_ROWS" ]]; then
  echo "✅ 락 테이블 비어 있음 — 모두 free"
  echo ""
  check_stale
  echo ""
  echo "=== ✅ 충돌 없음 ==="
  exit "$FAIL"
fi

echo "▶ 현재 락 테이블:"
echo "$LOCK_ROWS" | while IFS= read -r row; do
  echo "  $row"
done
echo ""

# ── 인수 없으면 현황 출력 후 종료 ─────────────────────────────
if [[ $# -eq 0 ]]; then
  echo "※ 파일 지정 없음 — 현황 출력만 (충돌 체크하려면: $0 file1.ts file2.svelte)"
  check_stale
  echo ""
  echo "=== 확인 완료 ==="
  exit 0
fi

# ── 인수로 받은 파일들과 충돌 체크 ───────────────────────────
echo "▶ 충돌 검사 대상 파일: $*"
echo ""

LOCKED_FILES=$(echo "$LOCK_ROWS" | awk -F'|' '{print $5}' | tr ',' '\n' | tr -d ' ' | grep -v '^$' || true)

for target in "$@"; do
  basename_target=$(basename "$target")
  match=$(echo "$LOCKED_FILES" | grep -iFx "$basename_target" || true)
  if [[ -n "$match" ]]; then
    # 어느 Work Item이 락했는지 찾기
    owner_row=$(echo "$LOCK_ROWS" | grep -i "$basename_target" || true)
    work_item=$(echo "$owner_row" | awk -F'|' '{print $2}' | tr -d ' ')
    agent=$(echo "$owner_row" | awk -F'|' '{print $3}' | tr -d ' ')
    echo "  ❌ CONFLICT: $basename_target → 락됨 (Work Item: $work_item, Agent: $agent)"
    FAIL=1
  else
    echo "  ✅ $basename_target — free"
  fi
done

echo ""
check_stale

echo ""
if [[ "$FAIL" -eq 1 ]]; then
  echo "=== ❌ 충돌 또는 stale 락 발견 — 해당 Work Item 완료 대기 또는 파일 분리 검토 ==="
  exit 1
else
  echo "=== ✅ 충돌 없음 — 작업 시작 가능 ==="
  exit 0
fi
