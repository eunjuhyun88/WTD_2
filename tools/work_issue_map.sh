#!/usr/bin/env bash
# work_issue_map.sh — work item ↔ GitHub Issue mapping CRUD
#
# Usage:
#   tools/work_issue_map.sh add W-0269 506 [--pr 507] [--status design]
#   tools/work_issue_map.sh get W-0269                  # latest entry for W-0269
#   tools/work_issue_map.sh get-by-issue 506            # latest entry for issue 506
#   tools/work_issue_map.sh list [--status open]        # filter by status
#   tools/work_issue_map.sh verify                      # cross-check map ↔ gh issue list
#   tools/work_issue_map.sh add-pr W-0269 507           # append PR to existing W-#### entry
#
# Storage: state/work-issue-map.jsonl (append-only, JSONL)
# Each line: {"ts", "w_id", "issue", "pr": [], "status", "agent"}
# Latest entry per w_id wins on read.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MAP_FILE="${REPO_ROOT}/state/work-issue-map.jsonl"

# Ensure map file exists
mkdir -p "$(dirname "$MAP_FILE")"
touch "$MAP_FILE"

usage() {
  sed -n '4,15p' "$0" | sed 's/^# //'
  exit 1
}

cmd_add() {
  local w_id="${1:-}"
  local issue="${2:-}"
  shift 2 || true
  local pr_list="[]"
  local status="design"
  local agent="${AGENT_ID:-unknown}"

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pr) pr_list="[$2]"; shift 2 ;;
      --status) status="$2"; shift 2 ;;
      --agent) agent="$2"; shift 2 ;;
      *) echo "Unknown flag: $1" >&2; exit 1 ;;
    esac
  done

  if [[ -z "$w_id" || -z "$issue" ]]; then
    echo "Error: w_id and issue required" >&2
    usage
  fi

  if ! [[ "$w_id" =~ ^W-[0-9]{4}$ ]]; then
    echo "Error: w_id must match W-#### (got: $w_id)" >&2
    exit 1
  fi
  if ! [[ "$issue" =~ ^[0-9]+$ ]]; then
    echo "Error: issue must be numeric (got: $issue)" >&2
    exit 1
  fi

  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '{"ts":"%s","w_id":"%s","issue":%s,"pr":%s,"status":"%s","agent":"%s"}\n' \
    "$ts" "$w_id" "$issue" "$pr_list" "$status" "$agent" >> "$MAP_FILE"
  echo "✅ added: $w_id → #$issue (status=$status)"
}

cmd_add_pr() {
  local w_id="${1:-}"
  local pr="${2:-}"
  if [[ -z "$w_id" || -z "$pr" ]]; then
    echo "Error: w_id and pr required" >&2
    exit 1
  fi
  # Get latest entry for w_id
  local existing
  existing="$(grep "\"w_id\":[[:space:]]*\"$w_id\"" "$MAP_FILE" | tail -1 || true)"
  if [[ -z "$existing" ]]; then
    echo "Error: $w_id not found in map" >&2
    exit 1
  fi
  local issue
  issue="$(echo "$existing" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["issue"])')"
  local prs
  prs="$(echo "$existing" | python3 -c 'import sys,json; d=json.loads(sys.stdin.read()); d["pr"].append('"$pr"'); print(",".join(map(str,sorted(set(d["pr"])))))')"
  local ts
  ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local agent="${AGENT_ID:-unknown}"
  printf '{"ts":"%s","w_id":"%s","issue":%s,"pr":[%s],"status":"in_progress","agent":"%s"}\n' \
    "$ts" "$w_id" "$issue" "$prs" "$agent" >> "$MAP_FILE"
  echo "✅ pr added: $w_id PR #$pr"
}

cmd_get() {
  local w_id="${1:-}"
  if [[ -z "$w_id" ]]; then
    echo "Error: w_id required" >&2
    exit 1
  fi
  grep "\"w_id\":[[:space:]]*\"$w_id\"" "$MAP_FILE" | tail -1 || {
    echo "Not found: $w_id" >&2
    exit 1
  }
}

cmd_get_by_issue() {
  local issue="${1:-}"
  if [[ -z "$issue" ]]; then
    echo "Error: issue required" >&2
    exit 1
  fi
  grep "\"issue\":[[:space:]]*$issue[,}]" "$MAP_FILE" | tail -1 || {
    echo "Not found: #$issue" >&2
    exit 1
  }
}

cmd_list() {
  local filter_status=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --status) filter_status="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  if [[ -n "$filter_status" ]]; then
    grep "\"status\":[[:space:]]*\"$filter_status\"" "$MAP_FILE" || true
  else
    cat "$MAP_FILE"
  fi
}

cmd_verify() {
  echo "🔍 Verifying state/work-issue-map.jsonl ↔ GitHub..."
  local total=0
  local mismatch=0
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    total=$((total + 1))
    local w_id issue map_status
    w_id="$(echo "$line" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["w_id"])')"
    issue="$(echo "$line" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["issue"])')"
    map_status="$(echo "$line" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["status"])')"

    # Skip if not the latest entry for this w_id
    local latest
    latest="$(grep "\"w_id\":[[:space:]]*\"$w_id\"" "$MAP_FILE" | tail -1)"
    [[ "$line" != "$latest" ]] && continue

    local gh_state
    gh_state="$(gh issue view "$issue" --json state -q .state 2>/dev/null || echo "MISSING")"
    if [[ "$gh_state" == "MISSING" ]]; then
      echo "⚠️  $w_id → #$issue: GitHub issue 없음 (deleted?)"
      mismatch=$((mismatch + 1))
    elif [[ "$map_status" == "completed" && "$gh_state" == "OPEN" ]]; then
      echo "🧟 ZOMBIE: $w_id (map=completed) → #$issue (gh=OPEN)"
      mismatch=$((mismatch + 1))
    fi
  done < <(awk -F'"w_id":"' '!seen[$2]++' "$MAP_FILE" | tac 2>/dev/null || tail -r 2>/dev/null || cat)
  echo ""
  echo "Total entries: $total"
  echo "Mismatches: $mismatch"
  [[ $mismatch -eq 0 ]] && echo "✅ all consistent" || echo "❌ drift detected"
}

case "${1:-}" in
  add) shift; cmd_add "$@" ;;
  add-pr) shift; cmd_add_pr "$@" ;;
  get) shift; cmd_get "$@" ;;
  get-by-issue) shift; cmd_get_by_issue "$@" ;;
  list) shift; cmd_list "$@" ;;
  verify) shift; cmd_verify "$@" ;;
  *) usage ;;
esac
