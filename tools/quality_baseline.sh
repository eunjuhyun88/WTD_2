#!/usr/bin/env bash
# W-A108: quality_baseline.sh
# Prints current values for all 5 quality metrics + recommended CI thresholds.
# Run from repo root: bash tools/quality_baseline.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE="$ROOT/engine"
APP="$ROOT/app"

echo ""
echo "┌─────────────────────────────────────────────────────────────┐"
echo "│  WTD Quality Baseline (W-A108)                             │"
echo "└─────────────────────────────────────────────────────────────┘"
echo ""

# 1. scheduler.py lines
SCHED_LINES=$(wc -l < "$ENGINE/scanner/scheduler.py" | tr -d ' ')
SCHED_BUDGET=400
SCHED_STATUS=$( [ "$SCHED_LINES" -le "$SCHED_BUDGET" ] && echo "✅" || echo "❌" )
printf "  %-35s %s %d  (budget ≤ %d)\n" "scheduler.py lines:" "$SCHED_STATUS" "$SCHED_LINES" "$SCHED_BUDGET"

# 2. pipeline.py lines
PIPE_LINES=$(wc -l < "$ENGINE/pipeline.py" | tr -d ' ')
PIPE_BUDGET=140
PIPE_STATUS=$( [ "$PIPE_LINES" -le "$PIPE_BUDGET" ] && echo "✅" || echo "❌" )
printf "  %-35s %s %d  (budget ≤ %d)\n" "pipeline.py lines:" "$PIPE_STATUS" "$PIPE_LINES" "$PIPE_BUDGET"

# 3. from engine.research import count
RESEARCH_COUNT=$(grep -rh "from engine\.research" "$ENGINE" --include="*.py" 2>/dev/null | wc -l | tr -d ' ')
RESEARCH_BUDGET=15
RESEARCH_STATUS=$( [ "$RESEARCH_COUNT" -le "$RESEARCH_BUDGET" ] && echo "✅" || echo "❌" )
printf "  %-35s %s %d  (budget ≤ %d)\n" "engine.research imports:" "$RESEARCH_STATUS" "$RESEARCH_COUNT" "$RESEARCH_BUDGET"

# 4. font-size violations
FONT_COUNT=$(grep -rE "font-size:[[:space:]]*(7|8|9|10)px" "$APP/src" --include="*.svelte" --include="*.css" 2>/dev/null | wc -l | tr -d ' ')
FONT_BUDGET=400
FONT_STATUS=$( [ "$FONT_COUNT" -le "$FONT_BUDGET" ] && echo "✅" || echo "❌" )
printf "  %-35s %s %d  (budget ≤ %d → target 0 after W-0389)\n" "font-size violations:" "$FONT_STATUS" "$FONT_COUNT" "$FONT_BUDGET"

# 5. Pydantic deprecation warnings
if command -v uv &>/dev/null; then
  PYDANTIC_RAW=$(cd "$ENGINE" && uv run pytest tests/research/test_autoresearch_runner.py -q --tb=no 2>&1)
  PYDANTIC_COUNT=$(echo "$PYDANTIC_RAW" | grep -c "PydanticDeprecatedSince20" || true)
  PYDANTIC_COUNT=$(echo "$PYDANTIC_COUNT" | tr -d ' \n')
else
  PYDANTIC_COUNT="(uv not found)"
fi
PYDANTIC_BUDGET=0
if [[ "$PYDANTIC_COUNT" =~ ^[0-9]+$ ]]; then
  PYDANTIC_STATUS=$( [ "$PYDANTIC_COUNT" -le "$PYDANTIC_BUDGET" ] && echo "✅" || echo "❌" )
else
  PYDANTIC_STATUS="⚠️"
fi
printf "  %-35s %s %s  (budget = %d)\n" "Pydantic v2 warnings:" "$PYDANTIC_STATUS" "$PYDANTIC_COUNT" "$PYDANTIC_BUDGET"

echo ""
echo "  Run 'uv run pytest tests/perf/ --benchmark-only' for latency numbers."
echo ""
