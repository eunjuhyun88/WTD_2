#!/usr/bin/env bash
# 매 세션 자동 주입되는 컨텍스트 파일 토큰 측정 (4-char/token 근사)
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
MEMORY_MD="$HOME/.claude/projects/-Users-ej-Projects-wtd-v2/memory/MEMORY.md"

files=(
  "$REPO_ROOT/CLAUDE.md"
  "$REPO_ROOT/AGENTS.md"
  "$REPO_ROOT/work/active/CURRENT.md"
  "$MEMORY_MD"
)

total_chars=0
for f in "${files[@]}"; do
  if [[ -f "$f" ]]; then
    chars=$(wc -c < "$f")
    tokens=$((chars / 4))
    lines=$(wc -l < "$f")
    printf "%-50s %6d chars ≈ %5d tok  (%dL)\n" "$(basename $f)" "$chars" "$tokens" "$lines"
    total_chars=$((total_chars + chars))
  else
    printf "%-50s NOT FOUND\n" "$(basename $f)"
  fi
done

total_tokens=$((total_chars / 4))
echo "──────────────────────────────────────────────────────────────────"
printf "%-50s %6d chars ≈ %5d tok\n" "합계" "$total_chars" "$total_tokens"
echo ""
if [[ $total_tokens -le 5000 ]]; then
  echo "✅ 목표 달성 (≤5,000 tokens)"
else
  over=$((total_tokens - 5000))
  echo "❌ 목표 미달: ${total_tokens}tok (목표 5,000 대비 ${over}tok 초과)"
fi
