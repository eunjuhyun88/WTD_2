#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

node scripts/dev/refresh-generated-context.mjs --check

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
	"docs/design-docs"
	"docs/product-specs"
	"docs/exec-plans"
	"docs/exec-plans/active"
	"docs/exec-plans/completed"
	"docs/generated"
	"docs/references"
)

REQUIRED_FILES=(
	"README.md"
	"AGENTS.md"
	"CLAUDE.md"
	"ARCHITECTURE.md"
	"docs/README.md"
	"docs/SYSTEM_INTENT.md"
	"docs/DESIGN.md"
	"docs/FRONTEND.md"
	"docs/PLANS.md"
	"docs/PRODUCT_SENSE.md"
	"docs/QUALITY_SCORE.md"
	"docs/RELIABILITY.md"
	"docs/SECURITY.md"
	"docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md"
	"docs/design-docs/index.md"
	"docs/design-docs/core-beliefs.md"
	"docs/design-docs/arena-domain-model.md"
	"docs/design-docs/learning-loop.md"
	"docs/product-specs/index.md"
	"docs/product-specs/arena.md"
	"docs/product-specs/terminal.md"
	"docs/product-specs/signals.md"
	"docs/product-specs/passport.md"
	"docs/exec-plans/index.md"
	"docs/exec-plans/active/README.md"
	"docs/exec-plans/active/context-system-rollout-2026-03-06.md"
	"docs/exec-plans/completed/README.md"
	"docs/exec-plans/tech-debt-tracker.md"
	"docs/generated/README.md"
	"docs/generated/db-schema.md"
	"docs/generated/game-record-schema.md"
	"docs/generated/route-map.md"
	"docs/generated/store-authority-map.md"
	"docs/generated/api-group-map.md"
	"docs/references/index.md"
	"scripts/dev/context-checkpoint.sh"
	"scripts/dev/check-context-quality.sh"
)

for dir in "${REQUIRED_DIRS[@]}"; do
	require_dir "$dir"
done

for file in "${REQUIRED_FILES[@]}"; do
	require_file "$file"
done

require_text "AGENTS.md" "docs/README.md" "task-level docs router"
require_text "AGENTS.md" "ARCHITECTURE.md" "architecture map"
require_text "AGENTS.md" "ctx:checkpoint" "semantic checkpoint command"
require_text "AGENTS.md" "ctx:check -- --strict" "strict context quality command"
require_text "README.md" "## 1.1) Context Routing" "context routing section"
require_text "README.md" "### Context Artifact Model" "context artifact model section"
require_text "README.md" "ctx:checkpoint" "checkpoint command in readme"
require_text "README.md" "ctx:check -- --strict" "strict context quality command in readme"
require_text "CLAUDE.md" "current git worktree rooted at this repository" "worktree-aware claude guide"
require_text "ARCHITECTURE.md" "## Canonical Doc Entry Points" "canonical doc entry section"
require_text "docs/README.md" "## Canonical Entry Docs" "canonical entry docs"
require_text "docs/README.md" "## Structured Knowledge Base" "structured knowledge base"
require_text "docs/README.md" "current git worktree rooted at this repository" "worktree-aware active boundary"
require_text "docs/SYSTEM_INTENT.md" "## Non-Negotiable Invariants" "system invariants"
require_text "docs/DESIGN.md" "## Design Authority Stack" "design authority stack"
require_text "docs/design-docs/arena-domain-model.md" "## Canonical Record: GameRecord" "arena domain GameRecord section"
require_text "docs/design-docs/learning-loop.md" "## ORPO Learning" "learning loop ORPO section"
require_text "docs/FRONTEND.md" "## State Authority" "state authority section"
require_text "docs/PLANS.md" "## Current Active Planning Surface" "active planning section"
require_text "docs/PRODUCT_SENSE.md" "## Core Product Heuristics" "product heuristics"
require_text "docs/QUALITY_SCORE.md" "Scale:" "quality scale"
require_text "docs/QUALITY_SCORE.md" "Context handoff quality" "context handoff quality row"
require_text "docs/RELIABILITY.md" "## Reliability Rules" "reliability rules"
require_text "docs/SECURITY.md" "## Security Non-Negotiables" "security non-negotiables"
require_text "docs/design-docs/core-beliefs.md" "## Beliefs" "beliefs section"
require_text "docs/product-specs/index.md" "## Surface Specs" "surface specs section"
require_text "docs/generated/game-record-schema.md" "## Primary Structure" "game record schema structure"
require_text "docs/generated/route-map.md" "## App Routes" "route map section"
require_text "docs/generated/store-authority-map.md" "## Stores" "store authority section"
require_text "docs/generated/api-group-map.md" "## API Group Overview" "api group overview"
require_text "docs/exec-plans/index.md" "## Active" "active plans section"
require_text "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" "Scope: current git worktree rooted at this repository" "worktree-aware scope"
require_text "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" "## 2) Context Architecture" "context architecture section"
require_text "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" "ctx:checkpoint" "checkpoint command in protocol"
require_text "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" "brief" "brief mode in protocol"
require_absent "AGENTS.md" "/Users/ej/Downloads/maxidoge-clones/frontend" "hardcoded frontend path in agents"
require_absent "AGENTS.md" "/Users/ej/Downloads/maxi-doge-unified/README.md" "broken external ssot readme path in agents"
require_absent "CLAUDE.md" "DEPRECATED" "deprecated claude banner"
require_absent "CLAUDE.md" "/Users/ej/Downloads/maxidoge-clones/frontend" "hardcoded frontend path in claude guide"
require_absent "docs/README.md" "/Users/ej/Downloads/maxidoge-clones/frontend" "hardcoded frontend path in docs router"
require_absent "docs/AGENT_CONTEXT_COMPACTION_PROTOCOL.md" "/Users/ej/Downloads/maxidoge-clones/frontend" "hardcoded frontend path in compaction protocol"
require_absent "docs/exec-plans/active/context-system-rollout-2026-03-06.md" "/Users/ej/Downloads/maxidoge-clones/frontend" "hardcoded frontend path in rollout plan"
require_absent "docs/DESIGN.md" "../STOCKCLAW_UNIFIED_DESIGN.md" "external arena design ref in design entry doc"
require_absent "docs/product-specs/index.md" "../STOCKCLAW_UNIFIED_DESIGN.md" "external arena design ref in product spec index"
require_absent "docs/product-specs/arena.md" "../STOCKCLAW_UNIFIED_DESIGN.md" "external arena design ref in arena spec"
require_absent "docs/PRODUCT_SENSE.md" "../STOCKCLAW_UNIFIED_DESIGN.md" "external arena design ref in product sense"

if [ "$FAIL" -ne 0 ]; then
	echo "[docs:check] failed."
	exit 1
fi

echo "[docs:check] all context-system checks passed."
