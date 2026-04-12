#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT_DIR"

if [ -f "scripts/dev/context-autopilot.mjs" ]; then
	CTX_AGENT_ID="${CTX_AGENT_ID:-autopilot}" \
	MEMENTO_AGENT="${MEMENTO_AGENT:-implementer-ui}" \
	node scripts/dev/context-autopilot.mjs stop >/dev/null 2>&1 || true
else
	if [ -f "scripts/dev/context-auto.sh" ]; then
		CTX_AUTO_SKIP_COMPACT=1 bash scripts/dev/context-auto.sh claude-stop >/dev/null 2>&1 || true
	fi

	if [ -f "scripts/dev/context-compact.sh" ]; then
		bash scripts/dev/context-compact.sh >/dev/null 2>&1 || true
	fi

	if [ -f "scripts/dev/memento-relay.mjs" ]; then
		BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
		BRANCH_SAFE="$(printf '%s' "${BRANCH//\//-}" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g')"
		WORK_ID_FILE=".agent-context/runtime/${BRANCH_SAFE}.work-id"
		if [ -n "$BRANCH_SAFE" ] && [ -f "$WORK_ID_FILE" ]; then
			WORK_ID="$(cat "$WORK_ID_FILE" 2>/dev/null || true)"
			if [ -n "$WORK_ID" ]; then
				MEMENTO_AGENT="${MEMENTO_AGENT:-implementer-ui}" \
				node scripts/dev/memento-relay.mjs --branch "$BRANCH" --work-id "$WORK_ID" --agent "${MEMENTO_AGENT:-implementer-ui}" --summary "Claude stop relay for $BRANCH" >/dev/null 2>&1 || true
			fi
		fi
	fi
fi

# MemKraft session-end — auto-extract knowledge (fail-open)
if [ -f "scripts/dev/memkraft-session-end.sh" ]; then
	bash scripts/dev/memkraft-session-end.sh 2>/dev/null || true
fi
