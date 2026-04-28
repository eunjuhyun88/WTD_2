#!/usr/bin/env bash
# context-pack.sh — work item + domain file slicer for /컨텍스트 skill
# Usage: tools/context-pack.sh "<keyword>" [domain]
#   keyword: task description or W-NNNN
#   domain:  engine | app | coordination (optional, auto-detected if omitted)

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

KEYWORD="${1:-}"
DOMAIN="${2:-}"
CHARS_PER_TOKEN=4

estimate_tokens() { echo $(( ${#1} / CHARS_PER_TOKEN )); }

# ── 1. Work item lookup ────────────────────────────────────────────────────
find_work_item() {
  local kw="$1"
  # W-NNNN direct match
  if [[ "$kw" =~ W-([0-9]{4}) ]]; then
    local wnum="${BASH_REMATCH[0]}"
    find "$REPO_ROOT/work/active" -name "${wnum}*.md" 2>/dev/null | head -1
    return
  fi
  # keyword grep
  grep -rl "$kw" "$REPO_ROOT/work/active/" 2>/dev/null | head -1
}

slice_work_item() {
  local file="$1"
  [[ -z "$file" || ! -f "$file" ]] && return
  # Extract Goal + Scope + Exit Criteria sections only
  awk '/^## Goal/{p=1} /^## (Non-Goals|CTO|AI Researcher|Decisions|Open Questions|Implementation|Facts|Handoff)/{p=0} p{print}' "$file"
}

# ── 2. Domain sub-file ─────────────────────────────────────────────────────
detect_domain() {
  local kw="${1,,}"  # lowercase
  if echo "$kw" | grep -qE "engine|verify|pv-|v-[0-9]|pattern|ledger|scanner|backtest|stats|executor|gate"; then
    echo "engine"
  elif echo "$kw" | grep -qE "app|chart|svelte|ui|terminal|frontend|프론트|차트"; then
    echo "app"
  elif echo "$kw" | grep -qE "pr|merge|worktree|deploy|branch|coordination|에이전트"; then
    echo "coordination"
  else
    echo ""
  fi
}

# ── 3. Code grep fallback ─────────────────────────────────────────────────
grep_code() {
  local kw="$1"
  local domain="${2:-}"
  local search_paths=()
  case "$domain" in
    engine) search_paths=("$REPO_ROOT/engine") ;;
    app)    search_paths=("$REPO_ROOT/app/src") ;;
    *)      search_paths=("$REPO_ROOT/engine" "$REPO_ROOT/app/src") ;;
  esac
  git -C "$REPO_ROOT" grep -n "$kw" -- "${search_paths[@]}" \
    --include="*.py" --include="*.ts" --include="*.svelte" 2>/dev/null \
    | head -30 || true
}

# ── Main ──────────────────────────────────────────────────────────────────
main() {
  [[ -z "$KEYWORD" ]] && { echo "Usage: $0 \"<keyword>\" [domain]" >&2; exit 1; }

  # Domain detection
  [[ -z "$DOMAIN" ]] && DOMAIN="$(detect_domain "$KEYWORD")"

  echo "## Work Item"
  local wi_file
  wi_file="$(find_work_item "$KEYWORD")"
  if [[ -n "$wi_file" ]]; then
    echo "File: $wi_file"
    slice_work_item "$wi_file"
  else
    echo "(no work item found — showing CURRENT.md active table)"
    grep -A 30 "^## 활성 Work Items" "$REPO_ROOT/work/active/CURRENT.md" 2>/dev/null | head -15 || true
  fi

  echo ""
  echo "## Domain Sub-file"
  if [[ -n "$DOMAIN" ]]; then
    local sub="$REPO_ROOT/agents/${DOMAIN}.md"
    [[ -f "$sub" ]] && cat "$sub" || echo "(not found: $sub)"
  else
    echo "(domain unknown — specify manually)"
  fi

  echo ""
  echo "## Code (grep fallback — use MCP serena if available)"
  grep_code "$KEYWORD" "$DOMAIN"
}

main "$@"
