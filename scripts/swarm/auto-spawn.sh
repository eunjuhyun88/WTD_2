#!/usr/bin/env bash
#
# scripts/swarm/auto-spawn.sh — swarm-v1 observability pick, no auto-invoke
#
# Called from .claude/hooks/subagent-auto-spawn.sh on every SubagentStop.
# Reads the DAG ready set, picks the highest-priority slice whose WIP cap
# still has room under the active rollout phase, and appends one line to
# today's digest file at .agent-context/digest/YYYY-MM-DD.md.
#
# This script EXPLICITLY DOES NOT spawn a Claude subagent. Per swarm-v1
# design §10, Claude API rate limit is the hardest constraint at n>=10 —
# auto-invocation is unsafe until Z3 cost-ceiling-guard lands. This script
# is observability-only: it makes the scheduler's next decision visible to
# the human operator (or a future slice) without using any API budget.
#
# Silent-success contract:
#   - Always exits 0, even when there is no ready slice or no WIP room.
#   - Errors go to stderr and the digest; the hook is never a blocker.
#   - If scripts/slice/cli.mjs is missing (non-swarm branch), exit 0 silently.
#
# Canonical references:
#   - Design: docs/exec-plans/active/swarm-v1-design-2026-04-11.md §3.1, §10
#   - Agent spec: .claude/agents/scheduler.md
#   - Slice CLI: scripts/slice/cli.mjs (ready / status subcommands)

set -euo pipefail

# ---------------------------------------------------------------------------
# Locate repo root. Refuse to run anywhere else.
# ---------------------------------------------------------------------------

if ! ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null)"; then
	# Not inside a git worktree — nothing to observe.
	exit 0
fi
cd "$ROOT_DIR"

SLICE_CLI="scripts/slice/cli.mjs"
if [ ! -f "$SLICE_CLI" ]; then
	# Non-swarm branch. Silent exit so we don't spam hook output.
	exit 0
fi

# ---------------------------------------------------------------------------
# Tool checks (fail-open for missing tools — we are a hook, never block).
# ---------------------------------------------------------------------------

if ! command -v node >/dev/null 2>&1; then
	echo "[auto-spawn] node missing; skipping" >&2
	exit 0
fi
if ! command -v jq >/dev/null 2>&1; then
	echo "[auto-spawn] jq missing; skipping" >&2
	exit 0
fi

# ---------------------------------------------------------------------------
# Digest setup — append-only, one file per day.
# ---------------------------------------------------------------------------

DIGEST_DIR=".agent-context/digest"
mkdir -p "$DIGEST_DIR"
DIGEST_FILE="$DIGEST_DIR/$(date +%Y-%m-%d).md"

# First time writing today? Seed a header so the file is self-explanatory.
if [ ! -f "$DIGEST_FILE" ]; then
	cat > "$DIGEST_FILE" <<EOF
# Daily digest — $(date +%Y-%m-%d)

Append-only operational log. Each line is one event from the swarm-v1
auto-spawn hook, the main-keeper loop, or a human operator note.

Format: \`- HH:MM:SSZ <source>: <message>\`

## Events

EOF
fi

TS_SHORT="$(date -u +%H:%M:%SZ)"

append_digest() {
	# Argument $1 is the event line body.
	printf -- '- %s %s\n' "$TS_SHORT" "$1" >> "$DIGEST_FILE"
}

# ---------------------------------------------------------------------------
# Read ready set and status JSON.
# ---------------------------------------------------------------------------

READY_JSON="$(node "$SLICE_CLI" ready --json 2>/dev/null || echo '[]')"
if [ "$READY_JSON" = '[]' ]; then
	append_digest "auto-spawn: ready set empty (scheduler idle)"
	exit 0
fi

STATUS_JSON="$(node "$SLICE_CLI" status --json 2>/dev/null || echo '{}')"
if [ "$STATUS_JSON" = '{}' ]; then
	echo "[auto-spawn] status --json returned empty; aborting observability pass" >&2
	exit 0
fi

# ---------------------------------------------------------------------------
# Pick the highest-priority ready slice that does not exceed its WIP cap.
# ---------------------------------------------------------------------------

ACTIVE_PHASE="$(echo "$STATUS_JSON" | jq -r '.policy.active_phase // "unknown"')"

# Sort by priority DESC, iterate, check cap per track.
PICKED=""
while IFS=$'\t' read -r SLICE_ID SLICE_TRACK SLICE_PRIORITY; do
	[ -z "$SLICE_ID" ] && continue

	CAP="$(echo "$STATUS_JSON" | jq -r --arg t "$SLICE_TRACK" '.policy.effective[$t] // 0')"
	WIP="$(echo "$STATUS_JSON" | jq -r --arg t "$SLICE_TRACK" '.wip[$t] // 0')"

	if [ "$WIP" -ge "$CAP" ]; then
		append_digest "auto-spawn: WIP saturated track=$SLICE_TRACK ($WIP/$CAP phase=$ACTIVE_PHASE) — cannot pick $SLICE_ID (pri=$SLICE_PRIORITY)"
		continue
	fi

	# Room available — this is the pick.
	PICKED="$SLICE_ID"
	append_digest "auto-spawn: next ready slice=$SLICE_ID track=$SLICE_TRACK pri=$SLICE_PRIORITY (WIP $WIP/$CAP phase=$ACTIVE_PHASE)"
	break
done < <(echo "$READY_JSON" | jq -r 'sort_by(-.priority) | .[] | [.id, .track, .priority] | @tsv')

if [ -z "$PICKED" ]; then
	# Every ready slice was blocked by WIP — nothing to do.
	# The per-track saturation lines above already told the story.
	exit 0
fi

exit 0
