#!/bin/bash
# end.sh — 세션 종료 + ledger append + lock 해제
#
# 사용:
#   ./tools/end.sh "PR #321" "git checkout -b feat/w-0146" [optional lesson]

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ $# -lt 2 ]; then
  echo "Usage: $0 \"<shipped>\" \"<handoff>\" [lesson]"
  echo "Example: $0 \"PR #321\" \"git checkout -b feat/w-0146\" \"FeatureWindowStore migration\""
  exit 1
fi

SHIPPED="$1"
HANDOFF="$2"
LESSON="${3:-}"

AGENT="$(cat state/current_agent.txt 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
END_SHA="$(git rev-parse HEAD)"
DATE="$(date -u +%Y-%m-%d)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 1. memory/sessions/{date}.jsonl append (memkraft 형식과 일치)
SESSION_FILE="memory/sessions/${DATE}.jsonl"
mkdir -p memory/sessions

# event = "session ended", tags=session,end + agent ID
ENTRY=$(jq -nc --arg ts "$TS" \
                --arg agent "$AGENT" \
                --arg event "session ended ($AGENT)" \
                --arg shipped "$SHIPPED" \
                --arg handoff "$HANDOFF" \
                --arg branch "$BRANCH" \
                --arg sha "$END_SHA" \
   '{
     ts: $ts,
     id: $agent,
     event: $event,
     tags: ["session", "end", $agent],
     importance: "normal",
     branch: $branch,
     end_sha: $sha,
     shipped: $shipped,
     handoff: $handoff
   }')

echo "$ENTRY" >> "$SESSION_FILE"

# 2. spec/CONTRACTS.md에서 자기 lock 제거
if [ -f spec/CONTRACTS.md ]; then
  # macOS sed 호환 (-i ''  vs Linux -i)
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^| ${AGENT} |/d" spec/CONTRACTS.md
  else
    sed -i "/^| ${AGENT} |/d" spec/CONTRACTS.md
  fi
fi

# 3. lesson이 있으면 memory에 저장 (incident가 아니라 session note)
if [ -n "$LESSON" ]; then
  LESSON_ENTRY=$(jq -nc --arg ts "$TS" \
                         --arg agent "$AGENT" \
                         --arg event "lesson: $LESSON" \
     '{ts: $ts, id: $agent, event: $event, tags: ["lesson", $agent], importance: "high"}')
  echo "$LESSON_ENTRY" >> "$SESSION_FILE"
fi

# 4. state 갱신
./tools/refresh_state.sh >/dev/null

echo "✓ Session $AGENT closed"
echo "  shipped: $SHIPPED"
echo "  handoff: $HANDOFF"
[ -n "$LESSON" ] && echo "  lesson:  $LESSON"
echo "  ledger:  $SESSION_FILE"
