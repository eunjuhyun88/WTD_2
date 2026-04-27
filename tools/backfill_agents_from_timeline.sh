#!/bin/bash
# backfill_agents_from_timeline.sh — 글로벌 timeline에서 누락된 per-agent jsonl 복구
#
# end.sh의 silent "unknown" fallback 버그로 A010~A016의 per-agent jsonl이 손실됐다.
# 글로벌 timeline (memory/sessions/YYYY-MM-DD.jsonl)에는 session_start/end/lesson
# 이벤트가 모두 남아 있으므로, 거기서 agent 태그를 보고 per-agent jsonl을 재구성한다.
#
# Idempotent: 같은 (agent, ts, event) 조합은 중복 추가하지 않는다.
#
# 사용:
#   ./tools/backfill_agents_from_timeline.sh           # 모든 agent 복구
#   ./tools/backfill_agents_from_timeline.sh A010 A016 # 특정 agent만

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p memory/sessions/agents

TIMELINE_FILES=(memory/sessions/2*.jsonl)
if [ ! -e "${TIMELINE_FILES[0]}" ]; then
  echo "✗ no timeline jsonl found in memory/sessions/"
  exit 0
fi

# 1) 어떤 agent ID가 timeline에 등장하는지 수집
ALL_AGENTS=$(jq -r '
  (.tags // [])[] | select(test("^A[0-9]+$"))
' "${TIMELINE_FILES[@]}" 2>/dev/null | sort -u)

# 인자로 필터링
if [ "$#" -gt 0 ]; then
  FILTER="$*"
  AGENTS=$(echo "$ALL_AGENTS" | grep -F -w -f <(printf '%s\n' $FILTER) || true)
else
  AGENTS="$ALL_AGENTS"
fi

if [ -z "$AGENTS" ]; then
  echo "(no agents to backfill)"
  exit 0
fi

ADDED_TOTAL=0
for AGENT in $AGENTS; do
  AGENT_FILE="memory/sessions/agents/${AGENT}.jsonl"
  touch "$AGENT_FILE"

  # 해당 agent의 모든 이벤트 추출 (timeline 포맷 → per-agent 포맷으로 정규화)
  EVENTS=$(jq -c --arg aid "$AGENT" '
    select((.tags // []) | index($aid))
    | {ts, id: $aid, event, tags, importance}
    + (if (.event | test("session ended")) then
        {shipped: ((.event | capture("shipped: (?<s>[^|]*?)( \\| handoff:|$)") | .s | rtrimstr(" ")) // ""),
         handoff: ((.event | capture("handoff: (?<h>.*)$") | .h) // "")}
       else {} end)
  ' "${TIMELINE_FILES[@]}" 2>/dev/null)

  if [ -z "$EVENTS" ]; then
    continue
  fi

  ADDED_FOR_AGENT=0
  while IFS= read -r entry; do
    [ -z "$entry" ] && continue
    KEY=$(echo "$entry" | jq -r '"\(.ts)|\(.event)"')
    if grep -Fq "$KEY" "$AGENT_FILE" 2>/dev/null; then
      continue
    fi
    if grep -Fq "\"ts\":\"${KEY%%|*}\"" "$AGENT_FILE" 2>/dev/null \
       && grep -Fq "${KEY##*|}" "$AGENT_FILE" 2>/dev/null; then
      continue
    fi
    echo "$entry" >> "$AGENT_FILE"
    ADDED_FOR_AGENT=$((ADDED_FOR_AGENT + 1))
  done <<< "$EVENTS"

  if [ "$ADDED_FOR_AGENT" -gt 0 ]; then
    # 시간순으로 재정렬
    sort -t '"' -k4 "$AGENT_FILE" -o "$AGENT_FILE"
    echo "  + $AGENT: $ADDED_FOR_AGENT entries"
    ADDED_TOTAL=$((ADDED_TOTAL + ADDED_FOR_AGENT))
  fi
done

echo ""
echo "✓ Backfill complete: $ADDED_TOTAL entries added across $(echo "$AGENTS" | wc -l | tr -d ' ') agent(s)"
