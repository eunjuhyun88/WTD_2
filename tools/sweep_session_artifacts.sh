#!/bin/bash
# sweep_session_artifacts.sh — 세션 아티팩트 + docs/live 중복 자동 정리
# AGENTS.md:150 enforcement (no AGENT-HANDOFF in active)
#
# D-1: session/checkpoint/handoff 패턴 → docs/archive/agent-handoffs/{date}/
# D-2: docs/live와 동명 파일 → work/active/ 사본 삭제 (canonical 단일화)
#
# 출력: 정리 카운트 + 변경 파일 목록

set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

DATE="$(date -u +%Y-%m-%d)"
ARCHIVE_DIR="docs/archive/agent-handoffs/${DATE}"

D1_COUNT=0
D2_COUNT=0

# D-1
echo "=== D-1: 세션 아티팩트 archive ==="
for f in work/active/W-*.md work/active/W-agent*.md work/active/W-session*.md; do
  [ -e "$f" ] || continue
  fname=$(basename "$f")
  if echo "$fname" | grep -qE 'session-handoff|session-checkpoint|^W-agent[0-9]+-session|^W-session-cleanup|-checkpoint-[0-9]'; then
    mkdir -p "$ARCHIVE_DIR"
    git mv "$f" "$ARCHIVE_DIR/$fname"
    echo "  → $ARCHIVE_DIR/$fname"
    D1_COUNT=$((D1_COUNT + 1))
  fi
done
[ "$D1_COUNT" = "0" ] && echo "  (none)"

# D-2
echo ""
echo "=== D-2: docs/live 중복 삭제 ==="
for f in work/active/*.md; do
  [ -f "$f" ] || continue
  fname=$(basename "$f")
  [ "$fname" = "CURRENT.md" ] && continue
  if [ -f "docs/live/$fname" ]; then
    git rm "$f" >/dev/null
    echo "  ✗ work/active/$fname (canonical: docs/live/$fname)"
    D2_COUNT=$((D2_COUNT + 1))
  fi
done
[ "$D2_COUNT" = "0" ] && echo "  (none)"

echo ""
echo "Sweep:"
echo "  D-1 session artifacts archived: $D1_COUNT"
echo "  D-2 docs/live duplicates removed: $D2_COUNT"
