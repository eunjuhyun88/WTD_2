#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FAIL=0

ok() {
	echo "[baseline:check] ok: $1"
}

fail() {
	echo "[baseline:check] fail: $1"
	FAIL=1
}

has_fixed_text() {
	local needle="$1"
	local path="$2"
	if command -v rg >/dev/null 2>&1; then
		rg -Fq "$needle" "$path"
	else
		grep -Fq -- "$needle" "$path"
	fi
}

require_file() {
	local path="$1"
	if [ -f "$path" ]; then
		ok "file exists: $path"
	else
		fail "missing file: $path"
	fi
}

require_dir() {
	local path="$1"
	if [ -d "$path" ]; then
		ok "dir exists: $path"
	else
		fail "missing dir: $path"
	fi
}

require_text() {
	local path="$1"
	local needle="$2"
	local label="${3:-$needle}"
	if has_fixed_text "$needle" "$path"; then
		ok "text present in $path: $label"
	else
		fail "missing text in $path: $label"
	fi
}

require_work_item_shape() {
	local path="$1"
	local required_sections=(
		"## Goal"
		"## Owner"
		"## Scope"
		"## Non-Goals"
		"## Canonical Files"
		"## Decisions"
		"## Next Steps"
		"## Exit Criteria"
	)

	for section in "${required_sections[@]}"; do
		require_text "$path" "$section" "$section section"
	done

	local owner
	owner="$(awk '
		$0 == "## Owner" { getline; while ($0 ~ /^[[:space:]]*$/) getline; print; exit }
	' "$path" | tr -d "[:space:]")"

	case "$owner" in
		app|engine|contract|research)
			ok "valid owner in $path: $owner"
			;;
		*)
			fail "invalid owner in $path: ${owner:-<empty>}"
			;;
	esac
}

REQUIRED_DIRS=(
	"docs"
	"docs/archive"
	"docs/decisions"
	"docs/domains"
	"docs/product"
	"docs/runbooks"
	"research"
	"research/datasets"
	"research/evals"
	"research/experiments"
	"research/notes"
	"research/thesis"
	"work"
	"work/active"
	"work/completed"
)

REQUIRED_FILES=(
	"README.md"
	"AGENTS.md"
	"docs/README.md"
	"docs/domains/contracts.md"
	"docs/decisions/ADR-000-operating-system-baseline.md"
	"app/docs/COGOCHI.md"
)

for dir in "${REQUIRED_DIRS[@]}"; do
	require_dir "$dir"
done

for file in "${REQUIRED_FILES[@]}"; do
	require_file "$file"
done

require_text "AGENTS.md" "## Default Read Scope" "default read scope"
require_text "AGENTS.md" "## Default Exclude Scope" "default exclude scope"
require_text "AGENTS.md" "## Work Item Discipline" "work item discipline"
require_text "AGENTS.md" "## Verification Minimum" "verification minimum"

require_text "README.md" "## Canonical Structure" "canonical structure"
require_text "README.md" "## Read Order (Default)" "default read order"
require_text "docs/README.md" "## Read Order" "docs read order"
require_text "docs/archive/README.md" "reference-only" "archive reference-only marker"

require_text "app/docs/COGOCHI.md" "Legacy reference during docs transition" "legacy reference banner"
require_text "app/docs/COGOCHI.md" "Canonical product and operating truth is now split into layered root docs." "layered root docs notice"

CONTRACT_PATHS=(
	"app/src/lib/contracts/index.ts"
	"app/src/lib/contracts/challenge.ts"
	"app/src/lib/contracts/verdict.ts"
	"engine/challenge/types.py"
	"engine/api/routes/patterns.py"
	"app/src/routes/api/wizard/+server.ts"
)

for path in "${CONTRACT_PATHS[@]}"; do
	require_file "$path"
done

ACTIVE_WORK_ITEMS=()
while IFS= read -r work_item; do
	ACTIVE_WORK_ITEMS+=("$work_item")
done < <(find work/active -maxdepth 1 -type f -name 'W-*.md' | sort)

if [ "${#ACTIVE_WORK_ITEMS[@]}" -eq 0 ]; then
	fail "no active work items found in work/active"
else
	ok "active work items found: ${#ACTIVE_WORK_ITEMS[@]}"
fi

for work_item in "${ACTIVE_WORK_ITEMS[@]}"; do
	require_work_item_shape "$work_item"
done

if [ "$FAIL" -ne 0 ]; then
	echo "[baseline:check] failed."
	exit 1
fi

echo "[baseline:check] all operating-baseline checks passed."
