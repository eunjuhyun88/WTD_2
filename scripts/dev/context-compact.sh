#!/usr/bin/env bash
set -euo pipefail

usage() {
	echo "Usage: bash scripts/dev/context-compact.sh [--source <snapshot.md>] [--checkpoint <checkpoint.md>] [--work-id <id>] [--max-lines <n>]"
	echo "       [--docs-check <pass|fail|warn|unknown>] [--check <pass|fail|warn|unknown>]"
	echo "       [--build <pass|fail|warn|unknown>] [--gate <pass|fail|warn|unknown>]"
	echo ""
	echo "Generates branch-local brief/handoff artifacts from the latest snapshot and semantic checkpoint."
}

sanitize() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g'
}

extract_section() {
	local source="$1"
	local header="$2"
	local limit="${3:-0}"
	awk -v h="## $header" -v limit="$limit" '
		$0 == h {in_section=1; next}
		in_section && /^## / {exit}
		in_section && NF {
			print
			count += 1
			if (limit > 0 && count >= limit) exit
		}
	' "$source"
}

trim_non_empty() {
	local limit="$1"
	awk -v limit="$limit" 'NF {print; count += 1; if (count >= limit) exit}'
}

meta_value() {
	local source="$1"
	local key="$2"
	awk -F': ' -v prefix="- $key" '$1 == prefix {print $2; exit}' "$source"
}

json_escape() {
	CTX_JSON_VALUE="$1" node -e 'const value = process.env.CTX_JSON_VALUE ?? ""; process.stdout.write(JSON.stringify(value).slice(1, -1));'
}

SOURCE_FILE=""
CHECKPOINT_FILE=""
WORK_ID=""
MAX_LINES=160
VALIDATION_DOCS_CHECK="unknown"
VALIDATION_CHECK="unknown"
VALIDATION_BUILD="unknown"
VALIDATION_GATE="unknown"

while [ "$#" -gt 0 ]; do
	case "$1" in
		--source)
			SOURCE_FILE="${2:-}"
			shift 2
			;;
		--checkpoint)
			CHECKPOINT_FILE="${2:-}"
			shift 2
			;;
		--work-id)
			WORK_ID="${2:-}"
			shift 2
			;;
		--max-lines)
			MAX_LINES="${2:-160}"
			shift 2
			;;
		--docs-check)
			VALIDATION_DOCS_CHECK="${2:-unknown}"
			shift 2
			;;
		--check)
			VALIDATION_CHECK="${2:-unknown}"
			shift 2
			;;
		--build)
			VALIDATION_BUILD="${2:-unknown}"
			shift 2
			;;
		--gate)
			VALIDATION_GATE="${2:-unknown}"
			shift 2
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
BRANCH_SAFE="$(sanitize "${BRANCH//\//-}")"
HEAD_SHA="$(git rev-parse --short HEAD)"
BASE_DIR="$ROOT_DIR/.agent-context"
SNAPSHOT_DIR="$BASE_DIR/snapshots/$BRANCH_SAFE"
CHECKPOINT_DIR="$BASE_DIR/checkpoints"
BRIEF_DIR="$BASE_DIR/briefs"
HANDOFF_DIR="$BASE_DIR/handoffs"
COMPACT_DIR="$BASE_DIR/compact"
RUNTIME_DIR="$BASE_DIR/runtime"
STATE_DIR="$BASE_DIR/state"
PINNED_FILE="$BASE_DIR/pinned-facts.md"
CATALOG_FILE="$BASE_DIR/catalog.tsv"

mkdir -p "$BRIEF_DIR" "$HANDOFF_DIR" "$COMPACT_DIR" "$RUNTIME_DIR" "$STATE_DIR"

if [ -z "$SOURCE_FILE" ]; then
	SOURCE_FILE="$(ls -1t "$SNAPSHOT_DIR"/*.md 2>/dev/null || true)"
	SOURCE_FILE="${SOURCE_FILE%%$'\n'*}"
fi

if [ -z "$SOURCE_FILE" ] || [ ! -f "$SOURCE_FILE" ]; then
	echo "[ctx:compact] no snapshot found."
	echo "[ctx:compact] run: npm run ctx:save -- --title '<task>'"
	exit 1
fi

if [ -z "$CHECKPOINT_FILE" ]; then
	if [ -n "$WORK_ID" ]; then
		WORK_SAFE="$(sanitize "$WORK_ID")"
		CANDIDATE="$CHECKPOINT_DIR/${WORK_SAFE}.md"
		if [ -f "$CANDIDATE" ]; then
			CHECKPOINT_FILE="$CANDIDATE"
		fi
	fi
fi

if [ -z "$CHECKPOINT_FILE" ] || [ ! -f "$CHECKPOINT_FILE" ]; then
	BRANCH_CHECKPOINT="$CHECKPOINT_DIR/${BRANCH_SAFE}-latest.md"
	if [ -f "$BRANCH_CHECKPOINT" ]; then
		CHECKPOINT_FILE="$BRANCH_CHECKPOINT"
	fi
fi

HAS_CHECKPOINT=0
if [ -n "$CHECKPOINT_FILE" ] && [ -f "$CHECKPOINT_FILE" ]; then
	HAS_CHECKPOINT=1
fi

TS_HUMAN="$(date '+%Y-%m-%d %H:%M:%S %z')"
SNAPSHOT_OBJECTIVE="$(extract_section "$SOURCE_FILE" "Objective" 6)"
WORK_IDENTITY="$(extract_section "$SOURCE_FILE" "Work Identity" 8)"
REPO_STATE="$(extract_section "$SOURCE_FILE" "Repo State" 12)"
UNCOMMITTED="$(extract_section "$SOURCE_FILE" "Uncommitted Files" 30)"
CHANGED_FILES="$(extract_section "$SOURCE_FILE" "Changed Files vs origin/main" 30)"
RECENT_COMMITS="$(extract_section "$SOURCE_FILE" "Recent Commits" 10)"
RUNTIME_FLAGS="$(extract_section "$SOURCE_FILE" "Runtime Context Flags" 10)"
NOTES="$(extract_section "$SOURCE_FILE" "Notes" 12)"
RESUME_COMMANDS="$(extract_section "$SOURCE_FILE" "Resume Commands" 10)"

WORK_ID_EFFECTIVE="${WORK_ID:-}"
SURFACE="unknown"
STATUS="unknown"
CURRENT_OBJECTIVE="$SNAPSHOT_OBJECTIVE"
WHY_NOW="- none"
SCOPE="- none"
OWNED_FILES="- none"
CANONICAL_DOCS="- none"
DECISIONS="- none"
REJECTED="- none"
OPEN_QUESTIONS="- none"
NEXT_ACTIONS="- none"
EXIT_CRITERIA="- none"
WARNINGS=()

if [ "$HAS_CHECKPOINT" -eq 1 ]; then
	WORK_ID_EFFECTIVE="$(meta_value "$CHECKPOINT_FILE" "Work ID")"
	SURFACE="$(meta_value "$CHECKPOINT_FILE" "Surface")"
	STATUS="$(meta_value "$CHECKPOINT_FILE" "Status")"
	CURRENT_OBJECTIVE="$(extract_section "$CHECKPOINT_FILE" "Objective" 6)"
	WHY_NOW="$(extract_section "$CHECKPOINT_FILE" "Why Now" 10)"
	SCOPE="$(extract_section "$CHECKPOINT_FILE" "Scope" 12)"
	OWNED_FILES="$(extract_section "$CHECKPOINT_FILE" "Owned Files" 20)"
	CANONICAL_DOCS="$(extract_section "$CHECKPOINT_FILE" "Canonical Docs Opened" 12)"
	DECISIONS="$(extract_section "$CHECKPOINT_FILE" "Decisions Made" 12)"
	REJECTED="$(extract_section "$CHECKPOINT_FILE" "Rejected Alternatives" 10)"
	OPEN_QUESTIONS="$(extract_section "$CHECKPOINT_FILE" "Open Questions" 12)"
	NEXT_ACTIONS="$(extract_section "$CHECKPOINT_FILE" "Next Actions" 10)"
	EXIT_CRITERIA="$(extract_section "$CHECKPOINT_FILE" "Exit Criteria" 10)"
else
	WARNINGS+=("no semantic checkpoint recorded for this branch")
fi

if [ -z "$WORK_ID_EFFECTIVE" ]; then
	WORK_ID_EFFECTIVE="AUTO-$BRANCH_SAFE"
fi

WORK_SAFE="$(sanitize "$WORK_ID_EFFECTIVE")"
BRIEF_WORK_FILE="$BRIEF_DIR/${WORK_SAFE}.md"
BRIEF_BRANCH_FILE="$BRIEF_DIR/${BRANCH_SAFE}-latest.md"
HANDOFF_WORK_FILE="$HANDOFF_DIR/${WORK_SAFE}.md"
HANDOFF_BRANCH_FILE="$HANDOFF_DIR/${BRANCH_SAFE}-latest.md"
STATE_FILE="$STATE_DIR/${WORK_SAFE}.json"
COMPAT_FILE="$COMPACT_DIR/${BRANCH_SAFE}-latest.md"

if [ -z "$CURRENT_OBJECTIVE" ] || [[ "$CURRENT_OBJECTIVE" =~ ^(auto-(safe-status|safe-sync-start|safe-sync-end|pre-push|post-merge)|unknown)$ ]]; then
	WARNINGS+=("objective is still stage-like; checkpoint objective should replace automation stage names")
fi

if [ -z "$NEXT_ACTIONS" ] || [ "$NEXT_ACTIONS" = "- none" ]; then
	WARNINGS+=("next actions missing from semantic checkpoint")
fi

if [ -z "$OPEN_QUESTIONS" ] || [ "$OPEN_QUESTIONS" = "- none" ]; then
	WARNINGS+=("open questions missing from semantic checkpoint")
fi

PINNED_FACTS="- none"
if [ -f "$PINNED_FILE" ]; then
	PINNED_FACTS="$(trim_non_empty 40 < "$PINNED_FILE")"
	[ -n "$PINNED_FACTS" ] || PINNED_FACTS="- none"
fi

VALIDATION_SNAPSHOT=$(
	cat <<EOF
- docs:check: $VALIDATION_DOCS_CHECK
- check: $VALIDATION_CHECK
- build: $VALIDATION_BUILD
- gate: $VALIDATION_GATE
- head: $HEAD_SHA
- uncommitted_state: $( [ "$UNCOMMITTED" = "- clean" ] && echo clean || echo dirty )
EOF
)

READ_THESE_FIRST="$CANONICAL_DOCS"
if [ "$READ_THESE_FIRST" = "- none" ]; then
	READ_THESE_FIRST=$(
		cat <<EOF
- README.md
- docs/README.md
- ARCHITECTURE.md
- docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md
EOF
	)
fi

HANDOFF_CHANGED_FILES="$CHANGED_FILES"
BRANCH_DIFF_CONTEXT="- none"
if [ "$HAS_CHECKPOINT" -eq 1 ] && [ "$OWNED_FILES" != "- none" ]; then
	HANDOFF_CHANGED_FILES="$OWNED_FILES"
	if [ -n "$CHANGED_FILES" ] && [ "$CHANGED_FILES" != "- none" ]; then
		BRANCH_DIFF_CONTEXT="$CHANGED_FILES"
	fi
fi

WARNING_BLOCK="- none"
if [ "${#WARNINGS[@]}" -gt 0 ]; then
	WARNING_BLOCK=""
	for warning in "${WARNINGS[@]}"; do
		WARNING_BLOCK+="- $warning"$'\n'
	done
	WARNING_BLOCK="$(trim_non_empty 20 <<< "$WARNING_BLOCK")"
fi

{
	echo "# Work Brief"
	echo ""
	echo "- Generated: $TS_HUMAN"
	echo "- Branch: $BRANCH"
	echo "- Head: $HEAD_SHA"
	echo "- Work ID: $WORK_ID_EFFECTIVE"
	echo "- Surface: $SURFACE"
	echo "- Status: $STATUS"
	echo "- Source snapshot: ${SOURCE_FILE#$ROOT_DIR/}"
	if [ "$HAS_CHECKPOINT" -eq 1 ]; then
		echo "- Source checkpoint: ${CHECKPOINT_FILE#$ROOT_DIR/}"
	else
		echo "- Source checkpoint: none"
	fi
	echo ""
	echo "## Current Objective"
	echo "${CURRENT_OBJECTIVE:-- none}"
	echo ""
	echo "## Why Now"
	echo "${WHY_NOW:-- none}"
	echo ""
	echo "## Repo State"
	echo "${REPO_STATE:-- none}"
	echo ""
	echo "## Owned Files"
	echo "${OWNED_FILES:-- none}"
	echo ""
	echo "## Locked Decisions"
	echo "${DECISIONS:-- none}"
	echo ""
	echo "## Open Questions"
	echo "${OPEN_QUESTIONS:-- none}"
	echo ""
echo "## Immediate Next Step"
echo "${NEXT_ACTIONS:-- none}"
echo ""
echo "## Exit Criteria"
echo "${EXIT_CRITERIA:-- none}"
echo ""
echo "## Validation Snapshot"
echo "$VALIDATION_SNAPSHOT"
	echo ""
	echo "## Read These First"
	echo "$READ_THESE_FIRST"
	echo ""
	echo "## Risks / Warnings"
	echo "$WARNING_BLOCK"
	echo ""
	echo "## Runtime Flags"
	echo "${RUNTIME_FLAGS:-- none}"
} | awk -v limit="$MAX_LINES" '
	NR <= limit {print}
	NR == limit + 1 {print ""; print "_(truncated by ctx:compact max-lines budget)_"}
' > "$BRIEF_WORK_FILE"

{
	echo "# Work Handoff"
	echo ""
	echo "- Generated: $TS_HUMAN"
	echo "- Branch: $BRANCH"
	echo "- Head: $HEAD_SHA"
	echo "- Work ID: $WORK_ID_EFFECTIVE"
	echo "- Surface: $SURFACE"
	echo "- Status: $STATUS"
	echo ""
	echo "## What Changed"
	echo "${HANDOFF_CHANGED_FILES:-- none}"
	echo ""
	echo "## Why This Direction Was Chosen"
	echo "${WHY_NOW:-- none}"
	echo ""
	echo "## Scope"
	echo "${SCOPE:-- none}"
	echo ""
	echo "## Branch Diff Context"
	echo "${BRANCH_DIFF_CONTEXT:-- none}"
	echo ""
	echo "## Remaining Work"
	echo "${NEXT_ACTIONS:-- none}"
	echo ""
	echo "## Rejected Alternatives"
	echo "${REJECTED:-- none}"
	echo ""
	echo "## Risks / Traps"
	echo "$WARNING_BLOCK"
	echo ""
	echo "## Open Questions"
	echo "${OPEN_QUESTIONS:-- none}"
	echo ""
	echo "## Exit Criteria"
	echo "${EXIT_CRITERIA:-- none}"
	echo ""
	echo "## Validate Before Push"
	echo "$VALIDATION_SNAPSHOT"
	echo ""
	echo "## Resume Commands"
	echo "${RESUME_COMMANDS:-- none}"
	echo ""
	echo "## Pinned Facts"
	echo "$PINNED_FACTS"
	echo ""
	echo "## Recent Commits"
	echo "${RECENT_COMMITS:-- none}"
	echo ""
	echo "## Notes"
	echo "${NOTES:-- none}"
} > "$HANDOFF_WORK_FILE"

cp "$BRIEF_WORK_FILE" "$BRIEF_BRANCH_FILE"
cp "$HANDOFF_WORK_FILE" "$HANDOFF_BRANCH_FILE"
cp "$BRIEF_WORK_FILE" "$COMPAT_FILE"
cp "$BRIEF_WORK_FILE" "$BASE_DIR/latest-brief-$BRANCH_SAFE.md"
cp "$HANDOFF_WORK_FILE" "$BASE_DIR/latest-handoff-$BRANCH_SAFE.md"
cp "$COMPAT_FILE" "$BASE_DIR/latest-compact-$BRANCH_SAFE.md"

cat > "$STATE_FILE" <<EOF
{
  "workId": "$(json_escape "$WORK_ID_EFFECTIVE")",
  "branch": "$(json_escape "$BRANCH")",
  "surface": "$(json_escape "$SURFACE")",
  "status": "$(json_escape "$STATUS")",
  "objective": "$(json_escape "$CURRENT_OBJECTIVE")",
  "whyNow": "$(json_escape "$WHY_NOW")",
  "scope": "$(json_escape "$SCOPE")",
  "ownedFiles": "$(json_escape "$OWNED_FILES")",
  "canonicalDocs": "$(json_escape "$CANONICAL_DOCS")",
  "openQuestions": "$(json_escape "$OPEN_QUESTIONS")",
  "nextActions": "$(json_escape "$NEXT_ACTIONS")",
  "head": "$(json_escape "$HEAD_SHA")",
  "checkpointPresent": $HAS_CHECKPOINT,
  "validation": {
    "docsCheck": "$(json_escape "$VALIDATION_DOCS_CHECK")",
    "check": "$(json_escape "$VALIDATION_CHECK")",
    "build": "$(json_escape "$VALIDATION_BUILD")",
    "gate": "$(json_escape "$VALIDATION_GATE")"
  },
  "briefPath": "$(json_escape "${BRIEF_WORK_FILE#$ROOT_DIR/}")",
  "handoffPath": "$(json_escape "${HANDOFF_WORK_FILE#$ROOT_DIR/}")"
}
EOF

if [ ! -f "$CATALOG_FILE" ]; then
	echo -e "timestamp\tartifact_type\tbranch\twork_id\tsurface\tstatus\tpath" > "$CATALOG_FILE"
fi

TS_KEY="$(date '+%Y%m%d-%H%M%S')"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$TS_KEY" \
	"brief" \
	"$BRANCH" \
	"$WORK_ID_EFFECTIVE" \
	"$SURFACE" \
	"$STATUS" \
	"${BRIEF_WORK_FILE#$ROOT_DIR/}" >> "$CATALOG_FILE"
printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
	"$TS_KEY" \
	"handoff" \
	"$BRANCH" \
	"$WORK_ID_EFFECTIVE" \
	"$SURFACE" \
	"$STATUS" \
	"${HANDOFF_WORK_FILE#$ROOT_DIR/}" >> "$CATALOG_FILE"

printf '%s\n' "$WORK_ID_EFFECTIVE" > "$RUNTIME_DIR/${BRANCH_SAFE}.latest-work-id"

echo "[ctx:compact] source: ${SOURCE_FILE#$ROOT_DIR/}"
if [ "$HAS_CHECKPOINT" -eq 1 ]; then
	echo "[ctx:compact] checkpoint: ${CHECKPOINT_FILE#$ROOT_DIR/}"
else
	echo "[ctx:compact] checkpoint: none (degraded fallback brief/handoff)"
fi
echo "[ctx:compact] brief: ${BRIEF_BRANCH_FILE#$ROOT_DIR/}"
echo "[ctx:compact] handoff: ${HANDOFF_BRANCH_FILE#$ROOT_DIR/}"
echo "[ctx:compact] compatibility output: ${COMPAT_FILE#$ROOT_DIR/}"
