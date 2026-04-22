#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

FAIL=0

has_fixed_text() {
	local needle="$1"
	local path="$2"
	if command -v rg >/dev/null 2>&1; then
		rg -Fq "$needle" "$path"
	else
		grep -Fq -- "$needle" "$path"
	fi
}

ok() {
	echo "[docs:check] ok: $1"
}

fail() {
	echo "[docs:check] fail: $1"
	FAIL=1
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

require_absent() {
	local path="$1"
	local needle="$2"
	local label="${3:-$needle}"
	if has_fixed_text "$needle" "$path"; then
		fail "unexpected text in $path: $label"
	else
		ok "text absent in $path: $label"
	fi
}

REQUIRED_DIRS=(
	"docs"
	"docs/archive"
	"docs/decisions"
	"docs/domains"
	"docs/product"
	"docs/runbooks"
	"research"
	"work"
	"work/active"
)

REQUIRED_FILES=(
	"README.md"
	"AGENTS.md"
	"CLAUDE.md"
	".claudeignore"
	".cursorignore"
	".ignore"
	".rgignore"
	"docs/README.md"
	"docs/product/brief.md"
	"docs/product/surfaces.md"
	"docs/product/research-thesis.md"
	"docs/domains/contracts.md"
	"docs/domains/terminal.md"
	"docs/domains/lab.md"
	"docs/domains/dashboard.md"
	"docs/domains/engine-pipeline.md"
	"docs/domains/evaluation.md"
	"docs/decisions/ADR-000-operating-system-baseline.md"
	"docs/decisions/ADR-001-engine-is-canonical.md"
	"docs/decisions/ADR-002-app-engine-boundary.md"
	"docs/decisions/ADR-003-challenge-contract.md"
	"work/active/CURRENT.md"
	"app/docs/COGOCHI.md"
	"app/docs/README.md"
	"app/docs/design-docs/index.md"
	"app/AGENTS.md"
	"app/CLAUDE.md"
	"app/ARCHITECTURE.md"
)

for dir in "${REQUIRED_DIRS[@]}"; do
	require_dir "$dir"
done

for file in "${REQUIRED_FILES[@]}"; do
	require_file "$file"
done

require_text "AGENTS.md" '`engine/` is the only backend truth' "engine canonical rule"
require_text "AGENTS.md" "## Default Read Scope" "default read scope"
require_text "AGENTS.md" "## Default Exclude Scope" "default exclude scope"
require_text "AGENTS.md" "## Work Item Discipline" "work item discipline"
require_text "AGENTS.md" "work/active/CURRENT.md" "CURRENT live index rule"
require_text "README.md" "## Canonical Structure" "canonical structure"
require_text "README.md" "## Read Order (Default)" "default read order"
require_text "README.md" "work/active/CURRENT.md" "README CURRENT read order"
require_text "CLAUDE.md" "## Canonical Read Order" "claude canonical read order"
require_text "CLAUDE.md" "work/active/CURRENT.md" "root claude CURRENT read order"
require_text "app/AGENTS.md" 'root `AGENTS.md`' "app agents points to root"
require_text "app/AGENTS.md" "CURRENT.md" "app agents CURRENT read order"
require_text "app/CLAUDE.md" "CURRENT.md" "app claude CURRENT read order"
require_text "app/ARCHITECTURE.md" 'Those remain canonical in `../engine/`.' "app architecture engine boundary"
require_text "docs/README.md" "docs/product/*.md" "docs router product path"
require_text "docs/README.md" "docs/domains/*.md" "docs router domains path"
require_text "work/active/CURRENT.md" "## 활성 Work Items" "CURRENT active work items section"
require_text "app/docs/README.md" "legacy/reference-first" "legacy docs router banner"
require_text "app/docs/design-docs/index.md" "not the canonical product entry point" "legacy design docs banner"
require_text "app/docs/COGOCHI.md" "legacy reference only" "legacy stub banner"
require_text "app/docs/COGOCHI.md" "Do not rebuild a monolithic PRD here." "stub migration rule"

require_absent "app/docs/README.md" "single source of truth" "legacy readme single-source claim"
require_absent "app/docs/design-docs/index.md" "single source of truth" "design index single-source claim"
require_absent "app/docs/COGOCHI.md" "/Users/ej/Projects/WTD/" "external backend repo claim"
require_absent "CLAUDE.md" '1. `app/docs/COGOCHI.md`' "root claude legacy-prd first read"
require_absent "CLAUDE.md" '2. `app/docs/COGOCHI.md`' "root claude legacy-prd second read"
require_absent "CLAUDE.md" '3. `app/docs/COGOCHI.md`' "root claude legacy-prd third read"
require_absent "CLAUDE.md" '2. Relevant `work/active/*.md`' "root claude pre-CURRENT read order"
require_absent "app/CLAUDE.md" '2. Relevant `../work/active/*.md`' "app claude pre-CURRENT read order"

for ignore_file in ".claudeignore" ".cursorignore" ".ignore" ".rgignore"; do
	require_text "$ignore_file" "app/node_modules/" "exclude app node_modules in $ignore_file"
	require_text "$ignore_file" "engine/.venv/" "exclude engine venv in $ignore_file"
	require_text "$ignore_file" "docs/archive/" "exclude docs archive in $ignore_file"
	require_text "$ignore_file" "app/docs/COGOCHI.md" "exclude legacy prd in $ignore_file"
done

if [ "$FAIL" -ne 0 ]; then
	echo "[docs:check] failed."
	exit 1
fi

echo "[docs:check] all operating-doc checks passed."
