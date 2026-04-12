#!/usr/bin/env bash
# MemKraft session-start hook — show relevant context (fail-open)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MEMORY_DIR="$REPO_ROOT/memory"

# Skip if memkraft not installed or memory not initialized
if ! command -v memkraft &>/dev/null; then exit 0; fi
if [ ! -f "$MEMORY_DIR/RESOLVER.md" ]; then exit 0; fi

echo "[memkraft] Memory health:"
(cd "$MEMORY_DIR" && memkraft dream --dry-run 2>/dev/null | head -5) || true

echo "[memkraft] Open loops:"
(cd "$MEMORY_DIR" && memkraft open-loops 2>/dev/null | head -10) || true
