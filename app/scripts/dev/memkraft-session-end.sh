#!/usr/bin/env bash
# MemKraft session-end hook — auto-extract from watch log (fail-open)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MEMORY_DIR="$REPO_ROOT/memory"

# Skip if memkraft not installed or memory not initialized
if ! command -v memkraft &>/dev/null; then exit 0; fi
if [ ! -f "$MEMORY_DIR/RESOLVER.md" ]; then exit 0; fi

# Extract from latest watch log entry (last 50 lines)
if [ -f "$REPO_ROOT/docs/AGENT_WATCH_LOG.md" ]; then
  LATEST_ENTRY=$(tail -50 "$REPO_ROOT/docs/AGENT_WATCH_LOG.md")
  (cd "$MEMORY_DIR" && memkraft extract "$LATEST_ENTRY" --source "agent-session" 2>/dev/null) || true
fi

# Log session event
BRANCH=$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null || echo "unknown")
(cd "$MEMORY_DIR" && memkraft log "Session ended: $BRANCH" --tags "session" --importance low 2>/dev/null) || true
