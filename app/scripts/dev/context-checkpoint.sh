#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "Usage: bash scripts/dev/context-checkpoint.sh --work-id <id> --surface <surface> --objective <text> [options] [--full]"
	echo ""
	echo "Required:"
	echo "  --work-id <id>"
	echo "  --surface <terminal|arena|signals|passport|cross-cutting>"
	echo "  --objective <text>"
	echo ""
	echo "Optional repeatable fields:"
	echo "  --status <in_progress|blocked|ready_for_impl|ready_for_push>"
	echo "  --why <text>"
	echo "  --scope <text>"
	echo "  --doc <path>"
	echo "  --file <path>"
	echo "  --decision <text>"
	echo "  --rejected <text>"
	echo "  --question <text>"
	echo "  --next <text>"
	echo "  --exit <text>"
}

sanitize() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g'
}

print_list() {
	local item=""
	local wrote=0
	local count=0
	for item in "$@"; do
		if [ -n "$item" ]; then
			if [ "${#item}" -gt "$MAX_ITEM_CHARS" ]; then
				echo "- ${item:0:$((MAX_ITEM_CHARS - 3))}..."
			else
				echo "- $item"
			fi
			wrote=1
			count=$((count + 1))
			if [ "$COMPACT" -eq 1 ] && [ "$count" -ge "$MAX_ITEMS" ]; then
				echo "- ... truncated ..."
				break
			fi
		fi
	done
	if [ "$wrote" -eq 0 ]; then
		echo "- none"
	fi
}

WORK_ID=""
SURFACE=""
STATUS="in_progress"
OBJECTIVE=""
WHY_NOW=""
SCOPE=""
COMPACT=1
MAX_ITEMS=5
MAX_ITEM_CHARS=220

truncate_field() {
	local value="$1"
	if [ "${#value}" -le "$MAX_ITEM_CHARS" ]; then
		printf '%s' "$value"
	else
		printf '%s...' "${value:0:$((MAX_ITEM_CHARS - 3))}"
	fi
}

declare -a DOCS=()
declare -a FILES=()
declare -a DECISIONS=()
declare -a REJECTED=()
declare -a QUESTIONS=()
declare -a NEXT_ACTIONS=()
declare -a EXIT_CRITERIA=()

while [ "$#" -gt 0 ]; do
	case "$1" in
		--work-id)
			WORK_ID="${2:-}"
			shift 2
			;;
		--surface)
			SURFACE="${2:-}"
			shift 2
			;;
		--status)
			STATUS="${2:-}"
			shift 2
			;;
		--objective)
			OBJECTIVE="${2:-}"
			shift 2
			;;
		--why)
			WHY_NOW="${2:-}"
			shift 2
			;;
		--scope)
			SCOPE="${2:-}"
			shift 2
			;;
		--doc)
			DOCS+=("${2:-}")
			shift 2
			;;
		--file)
			FILES+=("${2:-}")
			shift 2
			;;
		--decision)
			DECISIONS+=("${2:-}")
			shift 2
			;;
		--rejected)
			REJECTED+=("${2:-}")
			shift 2
			;;
		--question)
			QUESTIONS+=("${2:-}")
			shift 2
			;;
		--next)
			NEXT_ACTIONS+=("${2:-}")
			shift 2
			;;
		--exit)
			EXIT_CRITERIA+=("${2:-}")
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

if [ -z "$WORK_ID" ] || [ -z "$SURFACE" ] || [ -z "$OBJECTIVE" ]; then
	echo "Missing required arguments."
	usage
	exit 1
fi

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse --short HEAD)"
TS_HUMAN="$(date '+%Y-%m-%d %H:%M:%S %z')"
TS_KEY="$(date '+%Y%m%d-%H%M%S')"
BRANCH_SAFE="$(sanitize "${BRANCH//\//-}")"
WORK_SAFE="$(sanitize "$WORK_ID")"

BASE_DIR="$ROOT_DIR/.agent-context"
CHECKPOINT_DIR="$BASE_DIR/checkpoints"
RUNTIME_DIR="$BASE_DIR/runtime"
CATALOG_FILE="$BASE_DIR/catalog.tsv"
CHECKPOINT_FILE="$CHECKPOINT_DIR/${WORK_SAFE}.md"
BRANCH_LATEST_FILE="$CHECKPOINT_DIR/${BRANCH_SAFE}-latest.md"
WORK_POINTER_FILE="$RUNTIME_DIR/${BRANCH_SAFE}.work-id"

mkdir -p "$CHECKPOINT_DIR" "$RUNTIME_DIR"

{
	echo "# Checkpoint"
	echo ""
	echo "- Work ID: $WORK_ID"
	echo "- Branch: $BRANCH"
	echo "- Head: $HEAD_SHA"
	echo "- Surface: $SURFACE"
	echo "- Status: $STATUS"
	echo "- Updated At: $TS_HUMAN"
	echo ""
	echo "## Objective"
	truncate_field "$OBJECTIVE"
	echo ""
	echo "## Why Now"
	if [ -n "$WHY_NOW" ]; then
		truncate_field "$WHY_NOW"
	else
		echo "- none"
	fi
	echo ""
	echo "## Scope"
	if [ -n "$SCOPE" ]; then
		truncate_field "$SCOPE"
	else
		echo "- none"
	fi
	echo ""
	echo "## Owned Files"
	print_list "${FILES[@]-}"
	echo ""
	echo "## Canonical Docs Opened"
	print_list "${DOCS[@]-}"
	echo ""
	echo "## Decisions Made"
	print_list "${DECISIONS[@]-}"
	echo ""
	echo "## Rejected Alternatives"
	print_list "${REJECTED[@]-}"
	echo ""
	echo "## Open Questions"
	print_list "${QUESTIONS[@]-}"
	echo ""
	echo "## Next Actions"
	print_list "${NEXT_ACTIONS[@]-}"
	echo ""
	echo "## Exit Criteria"
	print_list "${EXIT_CRITERIA[@]-}"
} > "$CHECKPOINT_FILE"

cp "$CHECKPOINT_FILE" "$BRANCH_LATEST_FILE"
printf '%s\n' "$WORK_ID" > "$WORK_POINTER_FILE"

if [ ! -f "$CATALOG_FILE" ]; then
	echo -e "timestamp\tartifact_type\tbranch\twork_id\tsurface\tstatus\tpath" > "$CATALOG_FILE"
fi

printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$TS_KEY" \
	"checkpoint" \
	"$BRANCH" \
	"$WORK_ID" \
	"$SURFACE" \
	"$STATUS" \
	"${CHECKPOINT_FILE#$ROOT_DIR/}" >> "$CATALOG_FILE"

echo "[ctx:checkpoint] saved: ${CHECKPOINT_FILE#$ROOT_DIR/}"
echo "[ctx:checkpoint] branch latest: ${BRANCH_LATEST_FILE#$ROOT_DIR/}"
