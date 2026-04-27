#!/usr/bin/env bash
# MemKraft session-end hook — auto-extract from watch log (fail-open)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MEMORY_DIR="$REPO_ROOT/memory"
MK="$REPO_ROOT/tools/mk.sh"

# Skip if memkraft not installed or memory not initialized
if [ ! -x "$MK" ]; then exit 0; fi
if [ ! -f "$MEMORY_DIR/RESOLVER.md" ]; then exit 0; fi

# Extract from latest watch log entry (last 50 lines)
WATCH_LOG="$REPO_ROOT/app/docs/AGENT_WATCH_LOG.md"
if [ -f "$WATCH_LOG" ]; then
  LATEST_ENTRY=$(tail -50 "$WATCH_LOG")
  "$MK" extract "$LATEST_ENTRY" --source "agent-session" 2>/dev/null || true
fi

# Log session event
BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "unknown")
"$MK" log --event "Session ended: $BRANCH" --tags "session" --importance low 2>/dev/null || true
