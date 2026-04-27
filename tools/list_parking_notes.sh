#!/bin/bash
# list_parking_notes.sh — CURRENT.md 미등재 + 머지 PR 없음 work item 표시
#
# 정의: parking note = work/active/에 있지만 CURRENT.md '## 활성 Work Items' 표에
# 등재되지 않았고, origin/main에 매칭 머지 PR도 없는 work item.
# AGENTS.md "Work Item Discipline": parking notes는 reference-only.

set -uo pipefail
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

ACTIVE_LISTED=$(awk 'BEGIN{f=0} /^## 활성 Work Items/{f=1; next} f && (/^---$/ || /^## /){f=0} f' work/active/CURRENT.md 2>/dev/null \
  | grep -oE '`W-[0-9]{4}-[a-z0-9-]+`' | tr -d '`' | sort -u || true)

COUNT=0
for f in work/active/W-*.md; do
  [ -f "$f" ] || continue
  fname=$(basename "$f")
  slug="${fname%.md}"

  # CURRENT.md 등재?
  if echo "$ACTIVE_LISTED" | grep -q "^${slug}$"; then continue; fi

  # 머지 PR?
  wnum=$(echo "$slug" | grep -oE '^W-[0-9]{4}')
  if [ -n "$wnum" ] && git log origin/main --oneline --grep="$wnum" 2>/dev/null | head -1 | grep -q .; then
    continue
  fi

  last_mod=$(git log origin/main -1 --format='%ai' -- "$f" 2>/dev/null | cut -d' ' -f1)
  echo "  $slug (last: ${last_mod:-?})"
  COUNT=$((COUNT + 1))
done

if [ "$COUNT" = "0" ]; then
  echo "✓ Parking notes 없음"
else
  echo ""
  echo "Total parking notes: $COUNT"
  echo "  검토 후 archive: git mv work/active/<slug>.md docs/archive/work-pre-{date}/"
  echo "  CURRENT.md에 등재 (활성으로 promote)"
fi
