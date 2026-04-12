#!/usr/bin/env bash
set -euo pipefail

sanitize() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9._-]+/-/g; s/^-+|-+$//g'
}

ensure_ci_branch_checkout() {
	local current_branch
	current_branch="$(git rev-parse --abbrev-ref HEAD)"
	if [ "$current_branch" != "HEAD" ]; then
		return
	fi

	local ci_branch="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}"
	if [ -z "$ci_branch" ]; then
		echo "[ci:context] detached HEAD with no CI branch metadata; leaving checkout as-is"
		return
	fi

	echo "[ci:context] attaching detached HEAD to local branch: $ci_branch"
	git checkout -B "$ci_branch" >/dev/null 2>&1
}

ensure_ci_context_artifacts() {
	local branch_name
	branch_name="$(git rev-parse --abbrev-ref HEAD)"
	local branch_safe
	branch_safe="$(sanitize "${branch_name//\//-}")"
	local base_dir=".agent-context"
	local brief_file="$base_dir/briefs/${branch_safe}-latest.md"
	local handoff_file="$base_dir/handoffs/${branch_safe}-latest.md"
	local checkpoint_file="$base_dir/checkpoints/${branch_safe}-latest.md"

	if [ -f "$brief_file" ] && [ -f "$handoff_file" ] && [ -f "$checkpoint_file" ]; then
		echo "[ci:context] branch-local context artifacts already exist"
		return
	fi

	local ts
	ts="$(date '+%Y%m%d-%H%M')"
	local work_id="CI-${ts}-${branch_safe}"

	echo "[ci:context] synthesizing ephemeral context artifacts for $branch_name"
	npm run ctx:save -- --title "ci-context" --work-id "$work_id" --agent "ci"
	npm run ctx:checkpoint -- \
		--work-id "$work_id" \
		--surface "cross-cutting" \
		--objective "Validate ${branch_name} in remote CI before merge" \
		--status "in_progress" \
		--why "Remote CI needs branch-local context artifacts even though .agent-context is intentionally untracked." \
		--scope "Generate temporary checkpoint, brief, and handoff artifacts in the CI checkout so strict context quality can verify the branch." \
		--doc "README.md" \
		--doc "docs/README.md" \
		--doc "docs/CI_PIPELINE.md" \
		--next "Run strict context quality against the generated CI artifacts." \
		--next "Proceed to sandbox and project checks after the CI context gate passes." \
		--question "Should remote CI consume exported context artifacts instead of synthesizing them per run?" \
		--exit "ctx:check -- --strict passes for the checked-out branch in CI."
	npm run ctx:compact -- --work-id "$work_id" --docs-check pass
}

ROOT_DIR="$(git rev-parse --show-toplevel)"
cd "$ROOT_DIR"

ensure_ci_branch_checkout

echo "[ci:context] docs check"
npm run docs:check

ensure_ci_context_artifacts

echo "[ci:context] strict context quality"
npm run ctx:check -- --strict

CLAIMS_DIR=".agent-context/coordination/claims"
FORCE_COORD="${CTX_CI_REQUIRE_COORD:-0}"

if [ "$FORCE_COORD" = "1" ]; then
	echo "[ci:context] forced coordination check"
	npm run coord:check
elif [ -d "$CLAIMS_DIR" ] && find "$CLAIMS_DIR" -maxdepth 1 -type f -name '*.json' | grep -q .; then
	echo "[ci:context] coordination claims detected in checkout"
	npm run coord:check
else
	echo "[ci:context] no committed coordination claims detected; skipping remote coord:check"
fi

echo "[ci:context] sandbox policy"
npm run sandbox:check
