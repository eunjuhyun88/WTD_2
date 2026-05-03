#!/usr/bin/env bash
# Log context token count at session end.
# Usage: ./tools/log-session-tokens.sh [agent-id] [work-item] [event]
# Appends one line to work/log/token-usage/YYYY-MM.tsv

set -euo pipefail

AGENT="${1:-unknown}"
WORK_ITEM="${2:-}"
EVENT="${3:-session-end}"
LOG_DIR="work/log/token-usage"
LOG_FILE="$LOG_DIR/$(date +%Y-%m).tsv"
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

mkdir -p "$LOG_DIR"

# Measure current context
output=$(bash tools/measure_context_tokens.sh 2>/dev/null || echo "")
total=$(echo "$output" | grep '합계' | grep -oE '[0-9]+tok' | tr -d 'tok' | head -1 || echo "0")

# Write header if new file
if [[ ! -f "$LOG_FILE" ]]; then
  echo -e "timestamp\tagent\twork_item\tevent\ttotal_tok\tbudget_ok" > "$LOG_FILE"
fi

budget_ok="true"
if (( total > 5000 )); then
  budget_ok="false"
fi

echo -e "${TS}\t${AGENT}\t${WORK_ITEM}\t${EVENT}\t${total}\t${budget_ok}" >> "$LOG_FILE"
echo "📊 Logged: ${total}tok (${EVENT}) → ${LOG_FILE}"
