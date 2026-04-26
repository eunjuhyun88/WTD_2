#!/usr/bin/env bash
# Repo-pinned MemKraft CLI entrypoint.
#
# MemKraft resolves its store from MEMKRAFT_DIR or from ./memory relative to
# the current working directory. Keep every repo script on this wrapper so app/
# and memory/ cwd calls do not accidentally create a second memory root.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$REPO_ROOT/engine"
MEMORY_DIR="${MEMKRAFT_DIR:-$REPO_ROOT/memory}"

export MEMKRAFT_DIR="$MEMORY_DIR"

mkdir -p \
  "$MEMORY_DIR/entities" \
  "$MEMORY_DIR/inbox" \
  "$MEMORY_DIR/originals" \
  "$MEMORY_DIR/tasks" \
  "$MEMORY_DIR/meetings" \
  "$MEMORY_DIR/debug" \
  "$MEMORY_DIR/.memkraft/snapshots" \
  "$MEMORY_DIR/.memkraft/channels" \
  "$MEMORY_DIR/.memkraft/tasks" \
  "$MEMORY_DIR/.memkraft/agents"

if [ -x "$ENGINE_DIR/.venv/bin/memkraft" ]; then
  exec "$ENGINE_DIR/.venv/bin/memkraft" "$@"
fi

if command -v uv >/dev/null 2>&1; then
  cd "$ENGINE_DIR"
  exec uv run memkraft "$@"
fi

echo "MemKraft CLI unavailable. Run: cd engine && uv sync" >&2
exit 127
