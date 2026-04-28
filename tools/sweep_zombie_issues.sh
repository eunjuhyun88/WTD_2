#!/usr/bin/env bash
# sweep_zombie_issues.sh — work/completed/ ↔ open GitHub Issues 비교
# 좀비 이슈 후보 보고 (기본 dry-run, --apply 시 실제 close)
#
# Usage:
#   tools/sweep_zombie_issues.sh [--apply]
#
# Zombie 정의: work/completed/W-####-*.md 존재 + GitHub Issue OPEN 상태
# state/work-issue-map.jsonl 있으면 우선 참조, 없으면 gh search fallback

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MAP_FILE="${REPO_ROOT}/state/work-issue-map.jsonl"
APPLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ "$APPLY" == true ]] && echo "⚠️  APPLY MODE — 실제로 issue close 실행" || echo "🔍 DRY RUN — 보고만 (--apply 로 실제 close)"
echo ""

zombies=()
total=0
seen_w_ids=""

for path in "${REPO_ROOT}"/work/completed/W-[0-9][0-9][0-9][0-9]-*.md; do
  [[ -f "$path" ]] || continue
  fname="$(basename "$path")"
  w_id="$(echo "$fname" | grep -oE '^W-[0-9]{4}')"
  [[ -z "$w_id" ]] && continue
  # Dedupe: same W-#### may have multiple work files (re-used IDs across topics)
  case " $seen_w_ids " in *" $w_id "*) continue ;; esac
  seen_w_ids="$seen_w_ids $w_id"
  total=$((total + 1))

  # Find issue number — map file first, then gh search
  issue_num=""
  if [[ -f "$MAP_FILE" ]]; then
    entry="$(grep "\"w_id\":[[:space:]]*\"$w_id\"" "$MAP_FILE" | tail -1 || true)"
    if [[ -n "$entry" ]]; then
      issue_num="$(echo "$entry" | python3 -c 'import sys,json; print(json.loads(sys.stdin.read())["issue"])' 2>/dev/null || true)"
    fi
  fi
  if [[ -z "$issue_num" ]]; then
    # Fallback: gh issue search (title-scoped + first-W-#### filter to avoid false positives
    # where meta issues mention many W-#### in title/body — same fix as _backfill_impl.py)
    result="$(gh issue list --search "$w_id in:title" --state all --json number,state,title --limit 10 2>/dev/null || echo "[]")"
    issue_num="$(echo "$result" | W_ID="$w_id" python3 -c '
import sys, json, re, os
data = json.loads(sys.stdin.read())
w_id = os.environ["W_ID"]
first_widx_re = re.compile(r"W-\d{4}")
for item in data:
    m = first_widx_re.search(item["title"])
    if m and m.group(0) == w_id:
        print(item["number"])
        break
' 2>/dev/null || true)"
  fi
  [[ -z "$issue_num" ]] && continue

  # Check if issue is still OPEN
  gh_state="$(gh issue view "$issue_num" --json state -q .state 2>/dev/null || echo "MISSING")"
  if [[ "$gh_state" == "OPEN" ]]; then
    zombies+=("$w_id:#$issue_num")
    echo "🧟 ZOMBIE: $w_id → #$issue_num (work=completed, gh=OPEN)"
    if [[ "$APPLY" == true ]]; then
      gh issue close "$issue_num" --comment "Auto-closed: work item $w_id is in work/completed/. Closed by sweep_zombie_issues.sh."
      echo "   ✅ closed #$issue_num"
    fi
  fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Completed work items scanned: $total"
echo "Zombie issues found:          ${#zombies[@]}"
if [[ ${#zombies[@]} -eq 0 ]]; then
  echo "✅ 좀비 이슈 없음"
elif [[ "$APPLY" == false ]]; then
  echo "💡 실제 close: tools/sweep_zombie_issues.sh --apply"
fi
