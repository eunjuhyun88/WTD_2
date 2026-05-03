#!/usr/bin/env bash
# Spec readiness gate: score 0-10 for a Work Item before Haiku implementation.
# Usage: ./tools/spec-readiness.sh [W-XXXX or slug]
# Exit 0 = score ≥8 (Haiku-ready). Exit 1 = score <8 (needs Opus re-spec).

set -euo pipefail

QUERY="${1:-}"
REQUIRED_SECTIONS=("Goal" "Scope" "Non-Goals" "Canonical Files" "Exit Criteria" "Handoff Checklist" "Decisions")
SCORE=0
TOTAL=10
ISSUES=()

# Find the work item file
if [[ -z "$QUERY" ]]; then
  echo "Usage: $0 <W-XXXX or slug>"
  exit 1
fi

WORK_FILE=$(ls work/active/*"${QUERY}"*.md 2>/dev/null | head -1 || true)

if [[ -z "$WORK_FILE" ]]; then
  echo "❌ Work Item not found for: $QUERY"
  echo "   ls work/active/ | grep '$QUERY'"
  exit 1
fi

echo "📄 Checking: $WORK_FILE"
echo ""

# --- Section presence (7 points: 1 per required section) ---
for section in "${REQUIRED_SECTIONS[@]}"; do
  if grep -q "^## .*${section}" "$WORK_FILE" || grep -q "^## ${section}" "$WORK_FILE"; then
    ((SCORE++))
  else
    ISSUES+=("Missing section: ## ${section}")
  fi
done

# --- Exit Criteria have numeric/measurable ACs (1 point) ---
if grep -qE 'AC[0-9]|≥|≤|=.*%|p50|ms\b|tok\b' "$WORK_FILE"; then
  ((SCORE++))
else
  ISSUES+=("Exit Criteria lack measurable acceptance criteria (no AC#, ≥/≤, % or p50)")
fi

# --- Canonical Files list non-empty (1 point) ---
if grep -A5 "Canonical Files" "$WORK_FILE" | grep -qE '^\s*[-*]|`[^`]+\.(py|ts|svelte|sql)`'; then
  ((SCORE++))
else
  ISSUES+=("Canonical Files section appears empty or missing file paths")
fi

# --- No open TBD/TODO in critical sections (1 point) ---
if ! grep -qiE '^\s*[-*].*\bTBD\b|\bTODO\b' "$WORK_FILE"; then
  ((SCORE++))
else
  ISSUES+=("TBD/TODO found in list items — resolve before implementation")
fi

echo "=== Spec Readiness Score: ${SCORE}/${TOTAL} ==="
echo ""

if [[ ${#ISSUES[@]} -gt 0 ]]; then
  echo "Issues:"
  for issue in "${ISSUES[@]}"; do
    echo "  ❌ $issue"
  done
  echo ""
fi

if (( SCORE >= 8 )); then
  echo "✅ Haiku-ready (score ${SCORE} ≥ 8)"
  echo "   Next: /구현 $QUERY"
  exit 0
else
  echo "❌ Needs Opus re-spec (score ${SCORE} < 8)"
  echo "   Next: /설계 $QUERY  — add missing sections before /구현"
  exit 1
fi
