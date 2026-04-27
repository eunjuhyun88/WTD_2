#!/bin/bash
# refresh_state.sh — Derived state 자동 생성 + worktree registry 머지
#
# 출력: state/state.json, state/worktrees.json
# state/worktrees.json 스키마(v2):
#   각 entry는 derived (git에서 자동) + declared (start/claim/end가 기록) 필드 합집합.
#   - derived: path, branch, head_sha, ahead, behind, modified, exists
#   - declared: agent_id, issue, work_item, status, claimed_at, last_active, notes
#   매 refresh 시 derived는 git에서 다시 계산, declared는 path 키로 보존.
#
# 사용:
#   ./tools/refresh_state.sh           # 일반 갱신 (declared 보존)
#   ./tools/refresh_state.sh --prune   # 사라진 worktree entry 제거 (기본은 status=orphan 표식)
# Stale 허용: ≤ 5초

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PRUNE=0
[ "${1:-}" = "--prune" ] && PRUNE=1

mkdir -p state

# 1. main SHA + 현재 브랜치 + open PRs ──────────────────────────────────────────
git fetch origin main --quiet 2>/dev/null || true
MAIN_SHA="$(git rev-parse origin/main 2>/dev/null || git rev-parse HEAD)"
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse HEAD)"

if command -v gh >/dev/null 2>&1; then
  OPEN_PRS="$(gh pr list --json number,title,headRefName,mergeable,mergeStateStatus --limit 30 2>/dev/null || echo '[]')"
else
  OPEN_PRS='[]'
fi

# 2. state.json (atomic) ──────────────────────────────────────────────────────
TMP_STATE="$(mktemp)"
cat > "$TMP_STATE" <<EOF
{
  "main_sha": "${MAIN_SHA}",
  "head_sha": "${HEAD_SHA}",
  "current_branch": "${CURRENT_BRANCH}",
  "open_prs": ${OPEN_PRS},
  "regenerated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
mv "$TMP_STATE" state/state.json

# 3. worktree registry 머지 ───────────────────────────────────────────────────
# 3a. 기존 registry 보호 (없거나 array 아니면 빈 array로 초기화)
if [ ! -f state/worktrees.json ] || ! jq -e 'type=="array"' state/worktrees.json >/dev/null 2>&1; then
  echo '[]' > state/worktrees.json
fi

# 3b. 현재 git이 알고 있는 worktree → derived JSON (임시 파일)
TMP_DERIVED="$(mktemp)"
{
  echo '['
  FIRST=1
  while IFS= read -r WT_PATH; do
    [ -z "$WT_PATH" ] && continue
    WT_BRANCH="$(git -C "$WT_PATH" rev-parse --abbrev-ref HEAD 2>/dev/null | tr -d '[:space:]' || echo unknown)"
    WT_HEAD="$(git -C "$WT_PATH" rev-parse HEAD 2>/dev/null | tr -d '[:space:]' || echo '')"
    WT_AHEAD="$(git -C "$WT_PATH" rev-list --count origin/main..HEAD 2>/dev/null | tr -d '[:space:]' || echo 0)"
    WT_BEHIND="$(git -C "$WT_PATH" rev-list --count HEAD..origin/main 2>/dev/null | tr -d '[:space:]' || echo 0)"
    WT_MOD="$(git -C "$WT_PATH" status --porcelain 2>/dev/null | wc -l | tr -d '[:space:]' || echo 0)"
    [ -z "$WT_AHEAD" ] && WT_AHEAD=0
    [ -z "$WT_BEHIND" ] && WT_BEHIND=0
    [ -z "$WT_MOD" ] && WT_MOD=0
    [ -z "$WT_BRANCH" ] && WT_BRANCH=unknown
    if [ "$FIRST" = "1" ]; then FIRST=0; else echo ','; fi
    jq -nc \
      --arg path "$WT_PATH" \
      --arg branch "$WT_BRANCH" \
      --arg head "$WT_HEAD" \
      --argjson ahead "$WT_AHEAD" \
      --argjson behind "$WT_BEHIND" \
      --argjson modified "$WT_MOD" \
      '{path:$path, branch:$branch, head_sha:$head, ahead:$ahead, behind:$behind, modified:$modified, exists:true}'
  done < <(git worktree list --porcelain | awk '/^worktree / {print $2}')
  echo ']'
} > "$TMP_DERIVED"

# 3c. merge: declared 보존 + derived 갱신 + orphan 처리 (slurpfile로 큰 array 처리)
TMP_WT="$(mktemp)"
jq -n \
  --slurpfile existing state/worktrees.json \
  --slurpfile derived "$TMP_DERIVED" \
  --argjson prune "$PRUNE" '
  ($existing[0]) as $E |
  ($derived[0]) as $D |
  def declared_defaults: {
    agent_id: null,
    issue: null,
    work_item: null,
    status: "active",
    claimed_at: null,
    last_active: null,
    notes: ""
  };
  ($D | map(. as $new |
    (($E | map(select(.path == $new.path)) | first) // {}) as $old |
    declared_defaults
    + ($old | with_entries(select(.key | IN("agent_id","issue","work_item","status","claimed_at","last_active","notes"))))
    + $new
  )) as $live |
  ($E | map(select(.path as $p | ($D | map(.path) | index($p)) == null))
    | map(. + {exists: false, status: "orphan"})) as $orphans |
  if $prune == 1 then $live else $live + $orphans end
' > "$TMP_WT"

# 3d. atomic write
mv "$TMP_WT" state/worktrees.json
rm -f "$TMP_DERIVED"

echo "✓ state refreshed at $(date -u +%H:%M:%SZ) (worktrees: $(jq 'length' state/worktrees.json))"
