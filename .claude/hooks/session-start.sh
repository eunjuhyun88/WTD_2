#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

echo "[memento] Start order: README.md -> AGENTS.md -> docs/README.md -> ARCHITECTURE.md -> relevant canonical docs."

if [ -f "scripts/dev/context-restore.sh" ]; then
	MEMENTO_AGENT="${MEMENTO_AGENT:-${CTX_AGENT_ID:-implementer-ui}}"
	if OUTPUT="$(MEMENTO_AGENT="$MEMENTO_AGENT" bash scripts/dev/context-restore.sh --mode resume 2>/dev/null)"; then
		echo
		echo "[memento] Latest branch resume bundle:"
		printf '%s\n' "$OUTPUT" | sed -n '1,120p'
	else
		echo "[memento] No branch resume bundle yet. Create a semantic checkpoint before non-trivial work."
		echo "[memento] Example: npm run ctx:checkpoint -- --work-id \"W-...\" --surface \"<surface>\" --objective \"<objective>\""
	fi
fi

if [ -f "scripts/dev/context-autopilot.mjs" ]; then
	node scripts/dev/context-autopilot.mjs session-start >/dev/null 2>&1 || true
fi

# MemKraft accumulated knowledge context (fail-open)
if [ -f "scripts/dev/memkraft-session-start.sh" ]; then
	bash scripts/dev/memkraft-session-start.sh 2>/dev/null || true
fi
