#!/usr/bin/env bash
# refresh_docs_navigator.sh — AGENTS.md §문서 지도 경로 유효성 검증
#
# Usage: tools/refresh_docs_navigator.sh [--check]
#   (인자 없음): 검증 결과 출력
#   --check: 실패 시 exit 1 (CI용)
#
# 역할: 문서 지도에 명시된 canonical doc 파일이 실제로 존재하는지 확인.
#       코드 변경으로 파일이 이동/삭제됐을 때 doc stale을 조기 감지.

set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

CHECK_MODE=0
[ "${1:-}" = "--check" ] && CHECK_MODE=1

FAIL=0

echo "=== Docs Navigator Check ==="

# ── 1. Canonical doc 파일 존재 확인 ─────────────────────────────────────────
CANONICAL_DOCS=(
  "AGENTS.md"
  "CLAUDE.md"
  "work/active/CURRENT.md"
  "spec/NAMING.md"
  "spec/PRIORITIES.md"
  "spec/CHARTER.md"
  "agents/app.md"
  "agents/engine.md"
  "agents/coordination.md"
  "state/inventory.md"
  "work/active/PRODUCT-DESIGN-PAGES-V2.md"
  "work/active/PTRACK.md"
  "docs/live/PRD.md"
)

for f in "${CANONICAL_DOCS[@]}"; do
  if [ ! -f "$f" ]; then
    echo "❌ 누락: $f"
    FAIL=1
  fi
done

# ── 2. AGENTS.md §문서 지도에서 언급된 경로 유효성 ───────────────────────────
# 백틱 안의 경로 추출 후 필터링:
#   - 와일드카드 (*.md, **) 제외 — 디렉터리 존재만 확인
#   - 플레이스홀더 (XXXX, YYYY, <, >) 제외
if [ -f "AGENTS.md" ]; then
  while IFS= read -r fpath; do
    # 플레이스홀더/패턴 skip
    if echo "$fpath" | grep -qE 'XXXX|YYYY|<[^>]+>|\*|\{|\}'; then
      continue
    fi
    # 디렉터리 언급 (끝이 /) — 디렉터리 존재 확인
    if [[ "$fpath" == */ ]]; then
      if [ ! -d "${fpath%/}" ]; then
        echo "⚠ 디렉터리 없음: $fpath (AGENTS.md 참조)"
        FAIL=1
      fi
      continue
    fi
    # 일반 파일 경로
    if [ ! -e "$fpath" ]; then
      echo "⚠ 경로 없음: $fpath (AGENTS.md 참조)"
      FAIL=1
    fi
  done < <(
    grep -oE '`[a-zA-Z0-9_./-]+`' AGENTS.md 2>/dev/null \
      | tr -d '`' \
      | grep -E '^(work|docs|spec|agents|state|tools|app|engine)/' \
      | sort -u
  )
fi

# ── 3. 결과 ──────────────────────────────────────────────────────────────────
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 문서 지도 검증 통과 — canonical doc 전부 존재"
else
  echo ""
  echo "수정 방법:"
  echo "  1. 파일 이동됨 → 해당 doc 파일 경로 업데이트 + spec/NAMING.md §3 갱신"
  echo "  2. 파일 삭제됨 → AGENTS.md §문서 지도 해당 항목 제거"
  echo "  3. 신규 파일   → CANONICAL_DOCS 배열에 추가 후 PR"
  if [ "$CHECK_MODE" -eq 1 ]; then
    exit 1
  fi
fi
