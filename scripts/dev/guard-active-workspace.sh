#!/usr/bin/env bash
set -euo pipefail

if [ "${ALLOW_LEGACY_WORKSPACE:-0}" = "1" ]; then
	echo "[workspace-guard] ALLOW_LEGACY_WORKSPACE=1 set. Skipping guard."
	exit 0
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
WORKSPACE_NAME="$(basename "$ROOT_DIR")"
PARENT_DIR="$(dirname "$ROOT_DIR")"
ACTIVE_WORKSPACE_HINT="$PARENT_DIR/frontend (or another git worktree created from the canonical frontend repo)"

case "$WORKSPACE_NAME" in
	frontend-passport)
		echo "[workspace-guard] blocked: '$WORKSPACE_NAME' is a deprecated local workspace."
		echo "[workspace-guard] work from: $ACTIVE_WORKSPACE_HINT"
		echo "[workspace-guard] override (temporary): ALLOW_LEGACY_WORKSPACE=1"
		exit 1
		;;
esac

echo "[workspace-guard] ok: $WORKSPACE_NAME"
