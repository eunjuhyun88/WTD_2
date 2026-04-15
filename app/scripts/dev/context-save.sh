#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "Usage: bash scripts/dev/context-save.sh [--title <text>] [--work-id <id>] [--agent <name>] [--notes <text>] [--full]"
	echo ""
	echo "Example:"
	echo "  npm run ctx:save -- --title 'intel policy handoff' --work-id 'W-20260226-2151-backend-codex' --agent 'codex'"
}

sanitize() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g'
}

TITLE="manual"
WORK_ID=""
AGENT_ID="${USER:-agent}"
NOTES=""
COMPACT=1
MAX_LINES=20
MAX_CHARS=240

truncate_text() {
	local value="$1"
	if [ "${#value}" -le "$MAX_CHARS" ]; then
		printf '%s' "$value"
	else
		printf '%s...' "${value:0:$((MAX_CHARS - 3))}"
	fi
}

print_compact_list() {
	local content="$1"
	local count=0
	if [ -z "$content" ] || [ "$content" = "none" ] || [ "$content" = "clean" ]; then
		echo "- $content"
		return
	fi
	while IFS= read -r line; do
		[ -n "$line" ] || continue
		echo "- $(truncate_text "$line")"
		count=$((count + 1))
		if [ "$COMPACT" -eq 1 ] && [ "$count" -ge "$MAX_LINES" ]; then
			echo "- ... truncated ..."
			break
		fi
	done <<< "$content"
}

while [ "$#" -gt 0 ]; do
	case "$1" in
		--title)
			TITLE="${2:-}"
			shift 2
			;;
		--work-id)
			WORK_ID="${2:-}"
			shift 2
			;;
		--agent)
			AGENT_ID="${2:-}"
			shift 2
			;;
		--notes)
			NOTES="${2:-}"
			shift 2
			;;
		--full)
			COMPACT=0
			shift
			;;
		-h|--help)
			usage
			exit 0
			;;
		*)
			echo "Unknown option: $1"
			usage
			exit 1
			;;
	esac
done

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse --short HEAD)"
TS_HUMAN="$(date '+%Y-%m-%d %H:%M:%S %z')"
TS_KEY="$(date '+%Y%m%d-%H%M%S')"

BRANCH_SAFE="$(sanitize "${BRANCH//\//-}")"
TITLE_SAFE="$(sanitize "$TITLE")"
if [ -z "$TITLE_SAFE" ]; then
	TITLE_SAFE="snapshot"
fi

BASE_DIR="$ROOT_DIR/.agent-context"
SNAPSHOT_DIR="$BASE_DIR/snapshots/$BRANCH_SAFE"
COMPACT_DIR="$BASE_DIR/compact"
INDEX_FILE="$BASE_DIR/index.tsv"
LATEST_FILE="$BASE_DIR/latest-$BRANCH_SAFE.md"
SNAPSHOT_FILE="$SNAPSHOT_DIR/${TS_KEY}-${TITLE_SAFE}.md"

mkdir -p "$SNAPSHOT_DIR" "$COMPACT_DIR"

UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null || true)"
AHEAD_BEHIND="n/a"
if [ -n "$UPSTREAM" ] && git rev-parse --verify "$UPSTREAM" >/dev/null 2>&1; then
	AHEAD_BEHIND="$(git rev-list --left-right --count HEAD..."$UPSTREAM" | awk '{print "ahead="$1", behind="$2}')"
fi

CHANGED_MAIN="none"
if git rev-parse --verify origin/main >/dev/null 2>&1; then
	CHANGED_MAIN="$(git diff --name-only origin/main...HEAD || true)"
	[ -n "$CHANGED_MAIN" ] || CHANGED_MAIN="none"
fi

UNCOMMITTED="$(git status --short || true)"
[ -n "$UNCOMMITTED" ] || UNCOMMITTED="clean"

RECENT_COMMITS="$(git log --oneline -n 8 || true)"
[ -n "$RECENT_COMMITS" ] || RECENT_COMMITS="none"

WATCH_LOG="$ROOT_DIR/docs/AGENT_WATCH_LOG.md"
WATCH_LOG_PRESENT="no"
if [ -f "$WATCH_LOG" ]; then
	WATCH_LOG_PRESENT="yes"
fi

{
	echo "# Context Snapshot"
	echo ""
	echo "- Timestamp: $TS_HUMAN"
	echo "- Branch: $BRANCH"
	echo "- Head: $HEAD_SHA"
	echo "- Upstream: ${UPSTREAM:-none}"
	echo "- Ahead/Behind: $AHEAD_BEHIND"
	echo "- Agent: $AGENT_ID"
	echo "- Work ID: ${WORK_ID:-none}"
	echo "- Title: $TITLE"
	echo ""
	echo "## Objective"
	echo "$TITLE"
	echo ""
	echo "## Work Identity"
	echo "- agent: $AGENT_ID"
	echo "- work_id: ${WORK_ID:-none}"
	echo "- branch: $BRANCH"
	echo ""
	echo "## Repo State"
	echo "- root: $ROOT_DIR"
	echo "- head: $HEAD_SHA"
	echo "- upstream: ${UPSTREAM:-none}"
	echo "- ahead_behind: $AHEAD_BEHIND"
	echo ""
	echo "## Uncommitted Files"
	print_compact_list "$UNCOMMITTED"
	echo ""
	echo "## Changed Files vs origin/main"
	print_compact_list "$CHANGED_MAIN"
	echo ""
	echo "## Recent Commits"
	print_compact_list "$RECENT_COMMITS"
	echo ""
	echo "## Runtime Context Flags"
	echo "- watch_log_present: $WATCH_LOG_PRESENT"
	echo "- checkpoint_latest: .agent-context/checkpoints/$BRANCH_SAFE-latest.md"
	echo "- brief_latest: .agent-context/briefs/$BRANCH_SAFE-latest.md"
	echo "- handoff_latest: .agent-context/handoffs/$BRANCH_SAFE-latest.md"
	echo ""
	echo "## Notes"
	if [ -n "$NOTES" ]; then
		truncate_text "$NOTES"
	else
		echo "- none"
	fi
	echo ""
	echo "## Resume Commands"
	echo "- npm run safe:status"
	echo "- npm run ctx:compact"
	echo "- npm run ctx:restore -- --mode brief"
	echo "- npm run ctx:restore -- --mode handoff"
	echo "- npm run safe:sync"
} > "$SNAPSHOT_FILE"

cp "$SNAPSHOT_FILE" "$LATEST_FILE"

if [ ! -f "$INDEX_FILE" ]; then
	echo -e "timestamp\tbranch\thead\twork_id\tagent\ttitle\tpath" > "$INDEX_FILE"
fi
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$TS_HUMAN" \
	"$BRANCH" \
	"$HEAD_SHA" \
	"${WORK_ID:-none}" \
	"$AGENT_ID" \
	"$TITLE" \
	"${SNAPSHOT_FILE#$ROOT_DIR/}" >> "$INDEX_FILE"

echo "[ctx:save] saved snapshot: ${SNAPSHOT_FILE#$ROOT_DIR/}"
echo "[ctx:save] updated latest pointer: ${LATEST_FILE#$ROOT_DIR/}"
