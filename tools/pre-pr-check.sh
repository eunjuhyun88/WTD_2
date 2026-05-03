#!/usr/bin/env bash
# pre-pr-check.sh — 에이전트가 PR 생성 전 반드시 실행하는 자기검증
#
# Karpathy 원칙: "agents must verify their own outputs before reporting done"
# 이 스크립트가 0을 반환해야만 gh pr create를 실행.
#
# 사용: ./tools/pre-pr-check.sh [--app-only] [--skip-typecheck]
# 종료 코드: 0 = OK, 1 = 실패 (PR 생성 중단)

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_TYPECHECK=0
APP_ONLY=0

for arg in "$@"; do
  case $arg in
    --skip-typecheck) SKIP_TYPECHECK=1 ;;
    --app-only) APP_ONLY=1 ;;
  esac
done

FAIL=0

echo "=== pre-pr-check: 자기검증 시작 ==="

# ── 1. Diff 요약 (항상 출력 — 에이전트가 자기 변경을 봄) ──────────────────
echo ""
echo "▶ 변경된 파일:"
git -C "$REPO_ROOT" diff --stat HEAD || git -C "$REPO_ROOT" diff --cached --stat

# ── 2. PR body에 Closes #N 포함 여부 확인 ──────────────────────────────────
echo ""
echo "▶ PR body 규칙 확인:"
echo "  반드시 'Closes #N' 포함 (Refs 금지). gh pr create 본문에 직접 확인."

# ── 3. font-size 직접 사용 금지 (CI 실패 원인 1위) ────────────────────────
echo ""
echo "▶ font-size 7-10px 직접 사용 검사:"
if git -C "$REPO_ROOT" diff HEAD -- '*.svelte' '*.css' | grep -E 'font-size:\s*(7|8|9|10)px' | head -5; then
  echo "  ❌ FAIL: font-size 7-10px 직접 사용 발견 — var(--ui-text-*) 사용 필수"
  FAIL=1
else
  echo "  ✅ OK"
fi

# ── 4. svelte-check (타입 에러) ────────────────────────────────────────────
if [ "$SKIP_TYPECHECK" -eq 0 ] && [ -d "$REPO_ROOT/app" ]; then
  echo ""
  echo "▶ svelte-check:"
  NEW_ERRORS=$(cd "$REPO_ROOT/app" && npx svelte-check --tsconfig tsconfig.json 2>&1 | grep "^Error" | grep -v "node_modules" | head -10 || true)
  if [ -n "$NEW_ERRORS" ]; then
    echo "  ❌ FAIL:"
    echo "$NEW_ERRORS"
    FAIL=1
  else
    echo "  ✅ OK (0 new errors)"
  fi
fi

# ── 5. migration 번호 중복 확인 ────────────────────────────────────────────
echo ""
echo "▶ Migration 번호 중복 확인:"
DUPES=$(ls "$REPO_ROOT/app/supabase/migrations/" | grep -oE '^[0-9]+' | sort | uniq -d || true)
if [ -n "$DUPES" ]; then
  echo "  ❌ FAIL: 중복 migration 번호: $DUPES"
  FAIL=1
else
  echo "  ✅ OK"
fi

# ── 결과 ──────────────────────────────────────────────────────────────────
echo ""
if [ "$FAIL" -eq 1 ]; then
  echo "=== ❌ pre-pr-check FAILED — PR 생성 중단. 위 오류 수정 후 재실행. ==="
  exit 1
else
  echo "=== ✅ pre-pr-check PASSED — gh pr create 진행 가능 ==="
  exit 0
fi
