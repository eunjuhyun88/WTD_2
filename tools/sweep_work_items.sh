#!/usr/bin/env bash
# sweep_work_items.sh — work/active/ 자동 정리
# merged-to-main W-XXXX 파일 → work/completed/ 이동 (dry-run 기본)
#
# Usage:
#   tools/sweep_work_items.sh [--apply]
#
# Keep list: items still in-progress regardless of merge status.
# Edit KEEP_NUMS below when starting a new work item.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
APPLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --apply) APPLY=true; shift ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

[[ "$APPLY" == true ]] && echo "⚠️  APPLY MODE — 실제 이동" || echo "🔍 DRY RUN — 보고만 (--apply 로 실제 이동)"
echo ""

# Items to keep active even if merged (impl still in progress).
# Format: space-separated W-XXXX or exact filename fragment.
KEEP_NUMS="W-0212 W-0231 W-0233 W-0238 W-0239 W-0243 W-0245 W-0247 W-0248 W-0252 W-0263 W-0282 W-0283 W-0284"

moved=0
kept=0
not_merged=0

while IFS= read -r fname; do
  wnum=$(echo "$fname" | grep -oE "W-[0-9]{4}" | head -1)
  [[ -z "$wnum" ]] && continue

  # Check keep list
  if echo "$KEEP_NUMS" | grep -qw "$wnum"; then
    kept=$((kept + 1))
    continue
  fi

  # Check if merged to main
  if git log origin/main --oneline | grep -q "$wnum"; then
    if [[ "$APPLY" == true ]]; then
      mv "${REPO_ROOT}/work/active/${fname}" "${REPO_ROOT}/work/completed/${fname}"
      echo "  ✅ moved  → work/completed/$fname"
    else
      echo "  → MOVE  $fname"
    fi
    moved=$((moved + 1))
  else
    not_merged=$((not_merged + 1))
  fi
done < <(ls "${REPO_ROOT}/work/active/" | grep -E "^W-")

echo ""
echo "결과: move=${moved} keep=${kept} not-merged=${not_merged}"
if [[ "$APPLY" == false && "$moved" -gt 0 ]]; then echo "👉 --apply 로 실행"; fi
