#!/usr/bin/env bash
# Check if auto-injected context is within the 5,000 token budget.
# Usage: ./tools/token-budget-check.sh [--warn-only]
# Exit 0 = within budget. Exit 1 = over budget (unless --warn-only).

set -euo pipefail

WARN_ONLY="${1:-}"
BUDGET=5000

output=$(bash "$(dirname "$0")/measure_context_tokens.sh" 2>/dev/null)
echo "$output"

total=$(echo "$output" | grep '합계' | grep -oE '[0-9]+tok' | tr -d 'tok' | head -1)

if [[ -z "$total" ]]; then
  echo "⚠️  Could not parse total — skipping budget check"
  exit 0
fi

if (( total > BUDGET )); then
  echo ""
  echo "❌ Budget exceeded: ${total}tok > ${BUDGET}tok"
  echo "   → Run ./tools/memory-rotate.sh to archive old MEMORY.md entries"
  echo "   → Slim AGENTS.md or CURRENT.md if still over"
  [[ "$WARN_ONLY" == "--warn-only" ]] && exit 0
  exit 1
else
  echo ""
  echo "✅ Budget OK: ${total}tok ≤ ${BUDGET}tok"
fi
