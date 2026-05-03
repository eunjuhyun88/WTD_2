#!/usr/bin/env bash
# claim-migration.sh — atomic migration number reservation
#
# 사용: ./tools/claim-migration.sh
# 출력: 054  (다음 사용 가능한 번호를 stdout으로)
#
# Karpathy 원칙: 병렬 에이전트가 같은 migration 번호 선점하는 레이스 컨디션 제거.
# 파일 생성으로 즉시 번호 예약 — 나중에 실제 SQL로 교체.
#
# 에이전트 프롬프트에서:
#   MIGRATION_NUM=$(./tools/claim-migration.sh)
#   # → "054" 반환, app/supabase/migrations/054_.sql.reserved 파일 생성됨
#   mv app/supabase/migrations/054_.sql.reserved app/supabase/migrations/054_my_table.sql

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_ROOT/app/supabase/migrations"

# 현재 최대 번호 계산 (reserved 포함)
LAST=$(ls "$MIGRATIONS_DIR" | grep -E '^[0-9]+' | grep -oE '^[0-9]+' | sort -n | tail -1)
NEXT=$(printf "%03d" $((10#$LAST + 1)))

# 즉시 placeholder 파일 생성 (레이스 컨디션 방지)
PLACEHOLDER="$MIGRATIONS_DIR/${NEXT}_.sql.reserved"
touch "$PLACEHOLDER"

echo "$NEXT"
