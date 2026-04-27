#!/bin/bash
# classify_work_items.sh — work/active/W-*.md를 자동 분류
#
# 출력: reports/work-active-classification-{date}.md
# 카테고리:
#   keep-active     — CURRENT.md 등재 + Exit 미완료
#   completed       — 머지 PR 매핑 + Exit 100%
#   archive         — 세션 아티팩트 (handoff/checkpoint/agent)
#   delete          — docs/live와 동명 파일 (work/active 사본 폐기)
#   parking-review  — CURRENT.md 미등재 + 머지 PR 없음
#   manual          — 위 룰로 분류 안 되는 edge case

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

DATE="$(date -u +%Y-%m-%d)"
REPORT="reports/work-active-classification-${DATE}.md"
mkdir -p reports

CURRENT="work/active/CURRENT.md"

KEEP_ACTIVE=()
COMPLETED=()
ARCHIVE=()
DELETE=()
PARKING=()
MANUAL=()

count=0
for f in work/active/W-*.md; do
  [ -e "$f" ] || continue
  fname=$(basename "$f")
  count=$((count + 1))

  # CURRENT.md 자체는 스킵
  if [ "$fname" = "CURRENT.md" ]; then continue; fi

  # 번호 추출 (W-XXXX 또는 W-agent / W-session 패턴)
  if [[ "$fname" =~ ^W-([0-9]{4})- ]]; then
    wnum="W-${BASH_REMATCH[1]}"
  else
    wnum="$(echo "$fname" | sed 's/\.md$//')"
  fi

  # 1. 세션 아티팩트 패턴 → archive (D-1)
  if echo "$fname" | grep -qE 'session-handoff|session-checkpoint|^W-agent[0-9]+-session|^W-session-cleanup|-checkpoint-[0-9]'; then
    ARCHIVE+=("$fname|D-1 session artifact")
    continue
  fi

  # 2. docs/live 중복 → delete (D-2)
  if [ -f "docs/live/$fname" ]; then
    DELETE+=("$fname|D-2 docs/live duplicate")
    continue
  fi

  # 3. CURRENT.md 등재 여부
  in_current=0
  if grep -qF "$wnum" "$CURRENT" 2>/dev/null; then
    in_current=1
  fi

  # 4. 머지 PR 매핑 (origin/main 기준)
  merged_pr=$(git log origin/main --oneline --grep="$wnum" 2>/dev/null | head -1 | awk '{print $1}')

  # 5. 마지막 수정
  last_mod=$(git log origin/main -1 --format='%ai' -- "$f" 2>/dev/null | cut -d' ' -f1)
  [ -z "$last_mod" ] && last_mod="?"

  # 6. Exit Criteria 진척
  ec_total=$(grep -E '^- \[( |x)\]' "$f" 2>/dev/null | wc -l | tr -d ' ')
  ec_done=$(grep -E '^- \[x\]' "$f" 2>/dev/null | wc -l | tr -d ' ')

  # 7. Goal 1줄 (## Goal 다음 첫 비어있지 않은 줄)
  goal=$(awk '/^## Goal|^## 목표/{flag=1; next} flag && NF{print; exit}' "$f" 2>/dev/null | head -c 100 | tr -d '|\n')
  [ -z "$goal" ] && goal="(no Goal section)"

  # 8. 분류
  meta="ec=${ec_done}/${ec_total} mod=${last_mod} pr=${merged_pr:-none}"

  if [ "$in_current" = "1" ]; then
    if [ "$ec_total" -gt 0 ] && [ "$ec_done" = "$ec_total" ] && [ -n "$merged_pr" ]; then
      COMPLETED+=("$fname|merged + exit done|${meta}|${goal}")
    else
      KEEP_ACTIVE+=("$fname|in CURRENT.md|${meta}|${goal}")
    fi
  elif [ -n "$merged_pr" ] && [ "$ec_total" -gt 0 ] && [ "$ec_done" = "$ec_total" ]; then
    COMPLETED+=("$fname|merged + exit done|${meta}|${goal}")
  elif [ -z "$merged_pr" ]; then
    PARKING+=("$fname|no PR + not in CURRENT|${meta}|${goal}")
  else
    MANUAL+=("$fname|edge case|${meta}|${goal}")
  fi
done

# 보고서 생성
{
  echo "# Work Active Classification — $DATE"
  echo ""
  echo "Total scanned: $count files in work/active/"
  echo ""
  echo "## Summary"
  echo ""
  echo "| Category | Count | Action |"
  echo "|---|---|---|"
  echo "| keep-active     | ${#KEEP_ACTIVE[@]} | leave in active/ |"
  echo "| completed       | ${#COMPLETED[@]} | git mv to work/completed/ |"
  echo "| archive         | ${#ARCHIVE[@]} | mv to docs/archive/agent-handoffs/ |"
  echo "| delete          | ${#DELETE[@]} | rm (docs/live duplicate) |"
  echo "| parking-review  | ${#PARKING[@]} | manual review |"
  echo "| manual          | ${#MANUAL[@]} | edge case |"
  echo ""

  for cat_label in "KEEP_ACTIVE:keep-active" "COMPLETED:completed" "ARCHIVE:archive" "DELETE:delete" "PARKING:parking-review" "MANUAL:manual"; do
    var="${cat_label%%:*}"
    label="${cat_label#*:}"
    echo "## $label"
    echo ""
    eval "items=(\"\${${var}[@]:-}\")"
    if [ "${#items[@]}" -gt 0 ] && [ -n "${items[0]:-}" ]; then
      echo "| File | Reason | Meta | Goal |"
      echo "|---|---|---|---|"
      for item in "${items[@]}"; do
        IFS='|' read -ra parts <<< "$item"
        echo "| ${parts[0]:-} | ${parts[1]:-} | ${parts[2]:-} | ${parts[3]:-} |"
      done
    else
      echo "_(none)_"
    fi
    echo ""
  done
} > "$REPORT"

echo "✓ Report: $REPORT"
echo ""
echo "Counts:"
echo "  keep-active:    ${#KEEP_ACTIVE[@]}"
echo "  completed:      ${#COMPLETED[@]}"
echo "  archive:        ${#ARCHIVE[@]}"
echo "  delete:         ${#DELETE[@]}"
echo "  parking-review: ${#PARKING[@]}"
echo "  manual:         ${#MANUAL[@]}"
