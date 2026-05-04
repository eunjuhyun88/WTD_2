#!/bin/bash
# claim.sh — file-domain ownership lock + GitHub Issue assignee mutex
#
# 사용:
#   ./tools/claim.sh "engine/search/, app/copy-trading/"          # legacy (file-domain만)
#   ./tools/claim.sh "engine/search/" --issue 358                 # +Issue assignee mutex (권장)
#   ./tools/claim.sh "engine/search/" --issue 358 --force         # frozen gate 통과
#
# CHARTER §Coordination: GitHub Issue assignee = primary mutex.
# 자세한 내용: docs/runbooks/multi-agent-coordination.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

if [ $# -lt 1 ]; then
  echo "Usage: $0 \"<file-domain>\" [--issue N] [--force]"
  echo "Example: $0 \"engine/search/, app/copy-trading/\" --issue 358"
  exit 1
fi

DOMAIN="$1"
shift
FORCE=0
ISSUE_NUM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --force) FORCE=1; shift ;;
    --issue) ISSUE_NUM="${2:-}"; shift 2 ;;
    *) shift ;;
  esac
done

AGENT="$(cat state/current_agent.txt 2>/dev/null || echo unknown)"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
NOW="$(date -u +%H:%M)"
PID="$$"

# ── GitHub Issue assignee 통합 (primary mutex, CHARTER §Coordination) ──
# --issue N 지정 시 Issue assignee를 먼저 획득 → file-domain claim 진행.
# Issue 미지정/gh 미인증이면 graceful skip — legacy file-domain only.
if [ -n "$ISSUE_NUM" ]; then
  if ! command -v gh >/dev/null 2>&1 || ! gh auth status >/dev/null 2>&1; then
    echo "✗ --issue $ISSUE_NUM 지정됐지만 gh CLI 미인증." >&2
    echo "  \`gh auth login\` 후 다시 시도하거나, --issue 빼고 legacy claim." >&2
    exit 1
  fi
  # Issue 존재 여부 + 다른 assignee 점검
  ISSUE_INFO=$(gh issue view "$ISSUE_NUM" --json state,assignees,title 2>/dev/null || true)
  if [ -z "$ISSUE_INFO" ]; then
    echo "✗ Issue #$ISSUE_NUM 없거나 접근 불가." >&2
    exit 1
  fi
  ISSUE_STATE=$(echo "$ISSUE_INFO" | jq -r '.state')
  if [ "$ISSUE_STATE" != "OPEN" ]; then
    echo "✗ Issue #$ISSUE_NUM 상태가 $ISSUE_STATE — claim 불가." >&2
    exit 1
  fi
  OTHER_ASSIGNEES=$(echo "$ISSUE_INFO" | jq -r '.assignees | map(.login) | join(",")')
  ME=$(gh api user --jq .login 2>/dev/null || echo "")
  if [ -n "$OTHER_ASSIGNEES" ] && [ "$OTHER_ASSIGNEES" != "$ME" ]; then
    echo "⚠️  Issue #$ISSUE_NUM 이미 [$OTHER_ASSIGNEES] assigned. 같은 작업 중복 위험."
    if [ "$FORCE" -ne 1 ]; then
      echo "조정 후 그쪽이 \`gh issue edit $ISSUE_NUM --remove-assignee\` 해제하거나"
      echo "다른 Issue 선택. 강제 진행은 --force."
      exit 2
    fi
  fi
  # Issue mutex 획득 (idempotent)
  gh issue edit "$ISSUE_NUM" --add-assignee @me >/dev/null 2>&1 || true
  echo "✓ Issue #$ISSUE_NUM mutex acquired (assignee: @me)"
fi

# ── Non-Goal / Frozen gate (CHARTER.md §Frozen) ─────────────────
# 매칭되면 확인 프롬프트. --force로 통과 가능 (사유 기록).
# 2026-05-04 sync: chart.polish/w-0212 해제(2026-05-01), session.handoff.upgrade 유령패턴 제거.
# dispatcher/handoff.framework 패턴은 W-0404로 In-Scope 전환 — 원래도 regex에 없었음.
# coordination.stack 추가(CHARTER §Frozen 명시 패턴).
NONGOAL_REGEX='copy[._ ]?trad|copy_trading|leaderboard.*sub|memkraft|multi[._ -]?agent|new[._ ]?slash|new[._ ]?coordination[._ ]?stack'
COMBINED="$DOMAIN $BRANCH"
if echo "$COMBINED" | grep -iE "$NONGOAL_REGEX" >/dev/null 2>&1; then
  MATCH=$(echo "$COMBINED" | grep -iEo "$NONGOAL_REGEX" | head -1)
  echo "⚠️  Non-Goal / Frozen domain 감지: '$MATCH'"
  echo "   spec/CHARTER.md §Frozen 참조 — 이 작업은 코어가 아닙니다."
  echo ""
  if [ -f spec/CHARTER.md ]; then
    awk '/^## 🚫 Frozen/,/^## 🛡/' spec/CHARTER.md | head -20 | sed 's/^/   /'
    echo ""
  fi
  if [ "$FORCE" -ne 1 ]; then
    echo "계속하려면 --force 플래그 + 사유:"
    echo "  ./tools/claim.sh \"$DOMAIN\" --force"
    echo ""
    echo "또는 코어 작업으로 변경 (spec/PRIORITIES.md 참조)."
    exit 2
  fi
  echo "[FORCE] Non-Goal claim 통과. 사유는 PR 본문에 명시 필수."
  echo "$(date -u +%FT%TZ) | $AGENT | force-claimed: $DOMAIN | branch: $BRANCH" \
    >> state/nongoal_force_log.txt 2>/dev/null || true
fi

# CONTRACTS.md 없으면 생성
if [ ! -f spec/CONTRACTS.md ]; then
  cat > spec/CONTRACTS.md <<EOF
# Active File-Domain Locks

다른 에이전트가 같은 domain에 claim하면 \`./tools/claim.sh\`가 거절합니다.
세션 종료 시 \`./tools/end.sh\`가 자동으로 lock을 제거합니다.

| Agent | Domain | Branch | Started |
|---|---|---|---|
EOF
fi

# 충돌 검사 — lock table row만 검사 + stale PID 자동 해제
# 각 행 형식: | AGENT | DOMAIN | BRANCH | HH:MM | PID |
_sweep_stale_locks() {
  local tmp
  tmp=$(mktemp)
  while IFS= read -r line; do
    if echo "$line" | grep -qE '^\| A[0-9]+'; then
      local row_pid
      row_pid=$(echo "$line" | awk -F'|' '{print $6}' | tr -d ' ')
      if [ -n "$row_pid" ] && [ "$row_pid" != "PID" ]; then
        if ! kill -0 "$row_pid" 2>/dev/null; then
          echo "  ⚰️  stale lock removed (PID $row_pid dead): $line" >&2
          continue
        fi
      fi
    fi
    echo "$line"
  done < spec/CONTRACTS.md > "$tmp"
  mv "$tmp" spec/CONTRACTS.md
}
_sweep_stale_locks

for d in $(echo "$DOMAIN" | tr ',' '\n' | sed 's/^ *//;s/ *$//'); do
  if grep -E '^\| A[0-9]+' spec/CONTRACTS.md | grep -F "$d" >/dev/null 2>&1; then
    EXISTING=$(grep -E '^\| A[0-9]+' spec/CONTRACTS.md | grep -F "$d" | head -1)
    echo "✗ Domain '$d' already claimed:"
    echo "  $EXISTING"
    echo ""
    echo "Resolve options:"
    echo "  1. 다른 domain 선택"
    echo "  2. 기존 에이전트와 조정 후 그쪽이 ./tools/end.sh 실행"
    exit 1
  fi
done

# Lock 추가 (PID 포함 → stale 자동 감지 가능)
echo "| $AGENT | $DOMAIN | $BRANCH | $NOW | $PID |" >> spec/CONTRACTS.md

# live 파일에 claimed domain 반영 (다른 에이전트가 실시간으로 볼 수 있게)
"$SCRIPT_DIR/live.sh" update "$DOMAIN" 2>/dev/null || true

# worktree registry에 issue + work_item 매핑 (SSOT)
REG_ARGS=()
[ -n "$ISSUE_NUM" ] && REG_ARGS+=(--issue "$ISSUE_NUM")
WI_FROM_BRANCH="$(echo "$BRANCH" | grep -oE 'W-[0-9]{4}' | head -1)"
[ -n "$WI_FROM_BRANCH" ] && REG_ARGS+=(--work-item "$WI_FROM_BRANCH")
if [ ${#REG_ARGS[@]} -gt 0 ]; then
  "$SCRIPT_DIR/worktree-registry.sh" register --agent "$AGENT" "${REG_ARGS[@]}" >/dev/null 2>&1 || true
fi

echo "✓ $AGENT locked: $DOMAIN"
if [ -n "$ISSUE_NUM" ]; then
  echo "  GitHub Issue: #$ISSUE_NUM (assignee: @me)"
  echo "  released by: PR merge with \`Closes #$ISSUE_NUM\` (auto), or ./tools/end.sh"
else
  echo "  released by: ./tools/end.sh"
fi
