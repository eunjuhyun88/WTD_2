#!/usr/bin/env bash
# MemKraft session-start hook — show relevant context (fail-open)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
MEMORY_DIR="$REPO_ROOT/memory"
MK="$REPO_ROOT/tools/mk.sh"

# Skip if memkraft not installed or memory not initialized
if [ ! -x "$MK" ]; then exit 0; fi
if [ ! -f "$MEMORY_DIR/RESOLVER.md" ]; then exit 0; fi

echo "[memkraft] Memory health:"
"$MK" dream --dry-run 2>/dev/null | head -5 || true

echo "[memkraft] Open loops:"
"$MK" open-loops --dry-run 2>/dev/null | head -10 || true
