#!/bin/bash
# track_repo.sh — repo 전반 entity를 memkraft에 등록
#
# 등록 항목:
#   - W-번호 (work/active/W-XXXX-*.md) → concept entity
#   - Agent ID (memory/sessions/agents/A###.jsonl) → person entity
#   - 주요 모듈 (engine/*, app/*) → topic entity
#
# Idempotent — 이미 등록된 entity는 skip.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MK="$SCRIPT_DIR/mk.sh"

if [ ! -d "$REPO_ROOT/memory" ]; then
  echo "✗ memory/ not found"
  exit 1
fi

if [ ! -x "$MK" ]; then
  echo "✗ tools/mk.sh not executable"
  exit 1
fi

# 중요: MemKraft는 tools/mk.sh만 통해 실행한다.
# wrapper가 MEMKRAFT_DIR을 repo root memory/로 고정한다.
cd "$REPO_ROOT"

ADDED=0
SKIPPED=0

# 1. W-번호 → concept
echo "Tracking W-numbers..."
for f in "$REPO_ROOT"/work/active/W-*.md; do
  [ -f "$f" ] || continue
  basename=$(basename "$f" .md)
  # W-XXXX prefix만 추출 (W-XXXX-foo-bar → W-XXXX)
  wnum=$(echo "$basename" | grep -oE '^W-[0-9]+' || true)
  [ -z "$wnum" ] && continue

  # already tracked?
  if "$MK" list 2>/dev/null | grep -q "$wnum"; then
    SKIPPED=$((SKIPPED + 1))
  else
    "$MK" track "$wnum" --type concept --source "work/active/${basename}.md" >/dev/null 2>&1 \
      && ADDED=$((ADDED + 1)) || true
  fi
done

# 2. Agent IDs → person
echo "Tracking agents..."
for f in "$REPO_ROOT"/memory/sessions/agents/A*.jsonl; do
  [ -f "$f" ] || continue
  aid=$(basename "$f" .jsonl)
  if "$MK" list 2>/dev/null | grep -q "$aid"; then
    SKIPPED=$((SKIPPED + 1))
  else
    "$MK" track "$aid" --type person --source "memory/sessions/agents/${aid}.jsonl" >/dev/null 2>&1 \
      && ADDED=$((ADDED + 1)) || true
  fi
done

# 3. 주요 모듈 → topic
echo "Tracking modules..."
for mod in copy_trading search features patterns memory; do
  modpath="engine/${mod}"
  if [ -d "$REPO_ROOT/$modpath" ]; then
    if "$MK" list 2>/dev/null | grep -q "$mod"; then
      SKIPPED=$((SKIPPED + 1))
    else
      "$MK" track "$mod" --type topic --source "${modpath}/" >/dev/null 2>&1 \
        && ADDED=$((ADDED + 1)) || true
    fi
  fi
done

# 4. 인덱스 재빌드
"$MK" index >/dev/null 2>&1 || true

echo "✓ Tracked: +${ADDED} new, ${SKIPPED} already-existed"
echo "  list: ./tools/mk.sh list"
echo "  search: ./tools/mk.sh search '<query>'"
