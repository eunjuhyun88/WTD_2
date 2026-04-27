#!/bin/bash
# start.sh — Multi-agent boot (memkraft 통합)
# MemKraft brief + open-loops + state + spec를 한 번에 보여줌.
# 다음 에이전트가 30-50초 안에 컨텍스트 확보.
#
# 사용:
#   ./tools/start.sh                # 일반 부팅
#   ./tools/start.sh --quiet        # 한 줄만 (Agent ID + main SHA)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"
MK="$SCRIPT_DIR/mk.sh"

QUIET=0
[ "${1:-}" = "--quiet" ] && QUIET=1

# 1. 자동 main sync (안전한 경우만 fast-forward) + state 갱신
git fetch origin main >/dev/null 2>&1 || true
AHEAD=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
if [ "$AHEAD" -gt 0 ] 2>/dev/null; then
  UPSTREAM=$(git rev-parse --abbrev-ref '@{u}' 2>/dev/null || echo "")
  LOCAL_AHEAD=0
  if [ -n "$UPSTREAM" ]; then
    LOCAL_AHEAD=$(git rev-list --count "$UPSTREAM..HEAD" 2>/dev/null || echo 0)
  fi
  DIRTY=0
  git status --porcelain | grep -q . && DIRTY=1

  if [ "$LOCAL_AHEAD" = "0" ] && [ "$DIRTY" = "0" ]; then
    if git merge --ff-only origin/main >/dev/null 2>&1; then
      echo "✓ origin/main으로 자동 fast-forward ($AHEAD commit)"
    fi
  else
    echo "⚠ origin/main이 $AHEAD commit 앞섬 (본인 commit $LOCAL_AHEAD, dirty=$DIRTY) — 자동 sync skip"
    if [ "$DIRTY" = "1" ]; then
      echo "    먼저 commit/stash 후 재시도"
    elif [ "$LOCAL_AHEAD" != "0" ]; then
      echo "    추천: git merge origin/main"
    fi
  fi
fi
./tools/refresh_state.sh >/dev/null

MAIN_SHA="$(jq -r .main_sha state/state.json 2>/dev/null || echo unknown)"
CURRENT_BRANCH="$(jq -r .current_branch state/state.json 2>/dev/null || echo unknown)"
HEAD_SHA="$(git rev-parse --short HEAD)"
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 2. 다음 Agent ID 발번 (가변, 제한 없음)
#    memory/sessions/agents/*.jsonl에 이미 기록된 번호와 git common dir의
#    local atomic counter를 함께 본다. 같은 clone의 여러 worktree에서 동시에
#    start해도 같은 ID를 받지 않게 하는 최소 예약 장치다.
LATEST_ID=0
if [ -d memory/sessions/agents ]; then
  LATEST_ID=$(ls memory/sessions/agents/A*.jsonl 2>/dev/null \
              | sed -E 's|.*/A([0-9]+)\.jsonl|\1|' \
              | sort -n | tail -1 || echo 0)
fi
LATEST_ID=${LATEST_ID:-0}
GIT_COMMON_DIR="$(git rev-parse --git-common-dir)"
AGENT_STATE_DIR="$GIT_COMMON_DIR/agent-os"
FALLBACK_AGENT_STATE_DIR="$REPO_ROOT/memory/.memkraft/agents"
mkdir -p "$AGENT_STATE_DIR" 2>/dev/null || true

PROBE_DIR="$AGENT_STATE_DIR/.write-probe.$$.$RANDOM"
if mkdir "$PROBE_DIR" 2>/dev/null; then
  rmdir "$PROBE_DIR" 2>/dev/null || true
else
  # Codex sandbox can read .git but reject new lock dirs inside it.
  AGENT_STATE_DIR="$FALLBACK_AGENT_STATE_DIR"
  mkdir -p "$AGENT_STATE_DIR"
fi

COUNTER_FILE="$AGENT_STATE_DIR/next_agent_number"
LOCK_DIR="$AGENT_STATE_DIR/agent-id.lock"

LOCK_ACQUIRED=0
for _ in $(seq 1 100); do
  if mkdir "$LOCK_DIR" 2>/dev/null; then
    LOCK_ACQUIRED=1
    trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
    break
  fi
  sleep 0.05
done

if [ "$LOCK_ACQUIRED" -ne 1 ]; then
  echo "✗ Could not reserve Agent ID lock: $LOCK_DIR" >&2
  exit 1
fi

NEXT_NUM=$((10#${LATEST_ID} + 1))
if [ -f "$COUNTER_FILE" ]; then
  COUNTER_NUM="$(cat "$COUNTER_FILE" 2>/dev/null || echo 0)"
  COUNTER_NUM="${COUNTER_NUM:-0}"
  case "$COUNTER_NUM" in
    ''|*[!0-9]*) COUNTER_NUM=0 ;;
  esac
  if [ "$COUNTER_NUM" -gt "$NEXT_NUM" ]; then
    NEXT_NUM="$COUNTER_NUM"
  fi
fi
NEXT_ID=$(printf "A%03d" "$NEXT_NUM")
echo "$((NEXT_NUM + 1))" > "$COUNTER_FILE"
rmdir "$LOCK_DIR" 2>/dev/null || true
trap - EXIT

echo "$NEXT_ID" > state/current_agent.txt
AGENT_FILE="memory/sessions/agents/${NEXT_ID}.jsonl"
mkdir -p memory/sessions/agents

# W-0272 Phase 2 — emit session start-span (best-effort, never blocks).
# Captured span_id is consumed by end.sh + save.sh via state/current_session_span.txt.
if command -v node >/dev/null 2>&1 && [ -f tools/trace-emit.mjs ]; then
  TRACE_OUT=$(node tools/trace-emit.mjs start-span session \
    --agent "$NEXT_ID" \
    --attr "branch=$CURRENT_BRANCH" \
    --attr "baseline=$MAIN_SHA" 2>/dev/null || true)
  if [ -n "$TRACE_OUT" ]; then
    SESSION_SPAN_ID=$(echo "$TRACE_OUT" | jq -r '.span_id // empty' 2>/dev/null || true)
    [ -n "$SESSION_SPAN_ID" ] && echo "$SESSION_SPAN_ID" > state/current_session_span.txt
  fi
fi

if [ ! -s "$AGENT_FILE" ]; then
  START_ENTRY=$(jq -nc \
    --arg ts "$TS" \
    --arg agent "$NEXT_ID" \
    --arg branch "$CURRENT_BRANCH" \
    --arg baseline "$MAIN_SHA" \
    --arg sha "$HEAD_SHA" \
    '{
      ts: $ts,
      id: $agent,
      event: "session started",
      tags: ["session", "start", $agent],
      importance: "normal",
      branch: $branch,
      baseline: $baseline,
      head_sha: $sha
    }')
  echo "$START_ENTRY" >> "$AGENT_FILE"

  if [ -x "$MK" ] && [ -d memory ]; then
    "$MK" log \
      --event "${NEXT_ID} session started | branch: ${CURRENT_BRANCH} | baseline: ${MAIN_SHA:0:8}" \
      --tags "session,start,${NEXT_ID}" \
      --importance normal >/dev/null 2>&1 || true
  fi
fi

# live heartbeat 파일 생성 (동시 실행 에이전트 가시성)
"$SCRIPT_DIR/live.sh" write 2>/dev/null || true

# Worktree registry 자동 등록 (SSOT — state/worktrees.json)
"$SCRIPT_DIR/worktree-registry.sh" register --agent "$NEXT_ID" --status active >/dev/null 2>&1 || true

# W-0275 soft guard: sweep expired capability tokens (non-blocking)
node "$SCRIPT_DIR/capability-issuer.mjs" sweep 2>/dev/null || true

if [ $QUIET -eq 1 ]; then
  echo "Agent: $NEXT_ID | main: ${MAIN_SHA:0:8} | branch: $CURRENT_BRANCH"
  exit 0
fi

# 3. 브랜치 명명 정보 (auto-generated 이름은 정보용 — 차단하지 않음)
BRANCH_AUTO=0
if echo "$CURRENT_BRANCH" | grep -qE '^(claude/|codex/|worktree-agent-)'; then
  BRANCH_AUTO=1
fi

# Stale worktree check (G7 — 2026-04-28 W-0264 §Safety).
# Detects when this worktree's HEAD is far behind origin/main.  Stale
# worktrees cause /start auto-sync to encounter merge conflicts (e.g.
# 2026-04-27 A045/A051 sessions).  Threshold: ≥ 30 commits behind.
STALE_COMMITS=0
if [ -n "$MAIN_SHA" ]; then
  STALE_COMMITS=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
fi
STALE_WARN=""
if [ "$STALE_COMMITS" -ge 30 ]; then
  STALE_WARN=" ⚠️ STALE (${STALE_COMMITS} commits behind)"
elif [ "$STALE_COMMITS" -ge 10 ]; then
  STALE_WARN=" (${STALE_COMMITS} commits behind)"
fi

# 4. 부팅 출력 헤더
cat <<EOF
═══════════════════════════════════
You are Agent ${NEXT_ID}
═══════════════════════════════════
Baseline:    ${MAIN_SHA:0:8}  (origin/main)
Branch:      ${CURRENT_BRANCH}${STALE_WARN}

EOF

if [ "$STALE_COMMITS" -ge 30 ]; then
  cat <<EOF
🚨 STALE WORKTREE — DO NOT continue work here.

  This worktree is ${STALE_COMMITS} commits behind origin/main.  Continuing
  will produce merge conflicts (G7 sacrificed sessions on 2026-04-27).

  Recommended:
    1. cd to repo root and create a fresh worktree:
       git worktree add .claude/worktrees/feat-{Issue-ID} -b feat/{ID}-{desc} main
    2. Move your in-flight changes via PR (do not git pull this stale tree).
    3. After PR merge, retire this worktree:
       git worktree remove <this path>

EOF
fi

cat <<EOF
Open PRs:
EOF

jq -r '.open_prs[] | "  #\(.number) — \(.title) [\(.mergeable // "?")]"' state/state.json 2>/dev/null \
  | head -10 || echo "  (none or gh CLI unavailable)"

# ── 이 worktree의 registry 매핑 (재진입 시 진행 중 작업 자동 인식) ────────────
echo ""
echo "This worktree (registry):"
WT_INFO="$("$SCRIPT_DIR/worktree-registry.sh" get 2>/dev/null || echo 'null')"
if [ "$WT_INFO" != "null" ] && [ -n "$WT_INFO" ]; then
  echo "$WT_INFO" | jq -r '
    "  agent:     \(.agent_id // "-")",
    "  issue:     #\(.issue // "-")",
    "  work_item: \(.work_item // "-")",
    "  status:    \(.status // "-")",
    "  last_active: \(.last_active // "-")"
  ' 2>/dev/null
else
  echo "  (registry empty — /claim 또는 /save 시 매핑 자동 갱신)"
fi

# ── 브랜치 정보 출력 (자동 생성 이름은 정보일 뿐 — 차단 ❌) ───────────────────
# Claude Code SDK / codex CLI는 자동 worktree 생성 시 무작위 이름을 만든다.
# 이중 worktree 생성을 피하려면 `git branch -m` 으로 의미있는 이름으로 rename 권장.
if [ "$BRANCH_AUTO" -eq 1 ]; then
  echo ""
  echo "ℹ️  Auto-generated branch: '$CURRENT_BRANCH'"
  echo "   PR 시점 전에 의미있는 이름으로 rename 권장:"
  echo "     git branch -m feat/{Issue-ID}-{slug}     # 또는 feat/{W-NNNN}-{slug}"
  echo "   worktree는 그대로 유지됨 — 이중 생성 회피."
  echo ""
fi

# ── Stale 가드: 진짜 위험할 때만 차단 ────────────────────────────────────────
# 위험 = origin/main 대비 매우 뒤처짐 + dirty/local-ahead 충돌 위험
# 안전한 경우(clean worktree)는 단계 1의 자동 fast-forward가 처리한 상태.
if [ "${AHEAD:-0}" -gt 200 ] 2>/dev/null; then
  echo "⚠️  Worktree behind origin/main by ${AHEAD} commits — 'git merge origin/main' 또는 폐기 권장"
fi

echo ""
echo "Live agents (now):"
"$SCRIPT_DIR/live.sh" show 2>/dev/null || echo "  (none)"

# GitHub Issue = 진행 중 + 다음 P0 한눈에 (mutex + pick-up 동시)
echo ""
echo "🔴 IN PROGRESS (claimed — 건드리지 말 것):"
if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
  ASSIGNED=$(gh issue list --state open --assignee "*" \
    --json number,title,assignees,labels --limit 20 2>/dev/null \
    | jq -r '.[] | "  #\(.number) ✋\((.assignees | map(.login) | join(",")))"
              + " [\((.labels | map(.name) | join(",")))]"
              + " \(.title[:55])"' 2>/dev/null)
  if [ -n "$ASSIGNED" ]; then
    echo "$ASSIGNED"
  else
    echo "  (없음)"
  fi

  echo ""
  echo "🟢 AVAILABLE P0 (미배정 — 픽업 가능):"
  AVAIL_P0=$(gh issue list --state open --search "no:assignee label:P0" \
    --json number,title,labels --limit 10 2>/dev/null \
    | jq -r '.[] | "  #\(.number) [\((.labels | map(.name) | join(",")))] \(.title[:60])"' 2>/dev/null)
  if [ -n "$AVAIL_P0" ]; then
    echo "$AVAIL_P0"
  else
    echo "  (없음 — P1 확인: gh issue list --search \"no:assignee label:P1\")"
  fi

  echo ""
  echo "  → 픽업: gh issue edit N --add-assignee @me  &&  git checkout -b feat/issue-N-slug"
else
  echo "  (gh CLI 미인증 — \`gh auth login\` 후 활성화)"
fi

echo ""
echo "Active locks (legacy CONTRACTS.md — DEPRECATED):"
if [ -f spec/CONTRACTS.md ]; then
  grep -E "^\| A[0-9]+" spec/CONTRACTS.md 2>/dev/null \
    | sed 's/^/  /' \
    | head -10 || echo "  (none)"
else
  echo "  (none)"
fi

echo ""
echo "🎯 Core (spec/CHARTER.md §In-Scope):"
if [ -f spec/CHARTER.md ]; then
  awk '/^## ✅ In-Scope/,/^---/' spec/CHARTER.md \
    | grep -E "^\| L[0-9]|^- " | head -8 | sed 's/^/  /'
else
  echo "  (spec/CHARTER.md not yet created)"
fi

echo ""
echo "🧊 Frozen / Non-Goals (CHARTER §Frozen):"
if [ -f spec/CHARTER.md ]; then
  awk '/^## 🚫 Frozen/,/^## 🛡/' spec/CHARTER.md \
    | grep -E "^- ❌" | head -6 | sed 's/^/  /'
fi

echo ""
echo "Priorities (P0/P1):"
if [ -f spec/PRIORITIES.md ]; then
  { grep -E "^## P[0-9]|^## ✅" spec/PRIORITIES.md || true; } | head -6 | sed 's/^/  /'
else
  echo "  (spec/PRIORITIES.md not yet created)"
fi

# ── 필수 문서 강제 안내 ────────────────────────────────────────────────────────
echo ""
echo "📋 MANDATORY READS (구현 전 반드시 확인):"
echo "  1. docs/live/W-0220-product-prd-master.md   ← PRD v2.2 (D1~D15 결정·갭·로드맵)"
echo "  2. docs/live/W-0220-status-checklist.md     ← Feature 체크리스트 (작업 단위)"
echo ""
echo "  🔴 P0 미완료 항목:"
if [ -f docs/live/W-0220-status-checklist.md ]; then
  grep -E "^- \[ \]" docs/live/W-0220-status-checklist.md \
    | head -8 | sed 's/^/    /' || echo "    (없음 또는 파싱 실패)"
else
  echo "    (docs/live/W-0220-status-checklist.md 없음)"
fi

# 4. design verification summary
if [ -x "$SCRIPT_DIR/verify_design.sh" ]; then
  echo ""
  echo "Design status:"
  "$SCRIPT_DIR/verify_design.sh" --summary 2>/dev/null | sed 's/^/  /' \
    || echo "  DRIFT ⚠ run ./tools/verify_design.sh"
fi

# 5. memkraft 통합 — open loops + dream 시그널
if [ -x "$MK" ] && [ -d memory ]; then
  echo ""
  echo "Open loops (memkraft):"
  "$MK" open-loops --dry-run 2>/dev/null | head -8 | sed 's/^/  /' || echo "  (none)"

  echo ""
  echo "Memory health (memkraft dream):"
  "$MK" dream --dry-run 2>/dev/null | head -5 | sed 's/^/  /' || true
fi

# 6. 최근 5개 에이전트 (per-agent jsonl 기준)
echo ""
echo "Recent agents (last 5):"
LATEST_AGENTS=$(ls -t memory/sessions/agents/A*.jsonl 2>/dev/null | head -5)
if [ -n "$LATEST_AGENTS" ]; then
  for f in $LATEST_AGENTS; do
    aid=$(basename "$f" .jsonl)
    last=$(tail -1 "$f" 2>/dev/null | jq -r '.event // "?"' 2>/dev/null | head -c 70)
    echo "  $aid — $last"
  done
else
  echo "  (no per-agent records yet)"
fi

# 7. 직전 에이전트 handoff
PREV_ID=$(printf "A%03d" $((10#${LATEST_ID:-0})))
PREV_FILE="memory/sessions/agents/${PREV_ID}.jsonl"
if [ -f "$PREV_FILE" ]; then
  echo ""
  echo "Previous agent ($PREV_ID) handoff:"
  tail -1 "$PREV_FILE" 2>/dev/null \
    | jq -r '"  shipped: \(.shipped // "?")\n  handoff: \(.handoff // .next // "?")"' 2>/dev/null \
    || true
fi

cat <<EOF

═══════════════════════════════════
🔒 Multi-Agent Orchestration — MANDATORY (CLAUDE.md §Multi-Agent Orchestration)

  병렬 sub-agent 띄울 때 반드시 isolation="worktree" 옵션을 준다.
  (빠뜨리면 같은 working directory + HEAD + stash 공유 → git 상태 섞임)

  ✅ Agent(subagent_type=..., isolation="worktree", run_in_background=true, prompt=...)
  ❌ Agent(subagent_type=..., run_in_background=true, prompt=...)

  병렬 launch 전 파일 충돌 매트릭스 확인:
   - 같은 파일 동시 수정 sub-agent는 띄우지 않는다 (axis 달라도 merge conflict)
   - main agent는 sub-agent 작업 중 코드 변경 금지 (오케스트레이터 역할만)

  사고 사례: 2026-04-27 A045 W-0259 background agent — 같은 worktree 공유로
            commit이 다른 branch에 쌓여 reset --hard + reflog 복구 필요.

═══════════════════════════════════
GitHub Issue mutex (primary — CHARTER §Coordination):
  gh issue list --search "no:assignee" --state open    비어있는 일감
  gh issue edit N --add-assignee @me                   mutex 획득
  git checkout -b feat/issue-N-slug                    branch ↔ Issue
  PR body에 "Closes #N"                                 머지 = 자동 해제
  세부: docs/runbooks/multi-agent-coordination.md

Slash commands (legacy/보조):
  /claim "<file-domain>"      file-domain lock (CONTRACTS.md, deprecated)
  /save "<다음에 할 일>"       세션 중간 체크포인트
  /end "shipped" "handoff"    세션 종료
  /agent-status               현재 상태 한눈에

MemKraft direct:
  ./tools/mk.sh retro              일일 회고 (Well/Bad/Next 자동 추출)
  ./tools/mk.sh search "query"     메모리 검색
  ./tools/mk.sh lookup "query"     entity/decision/incident 조회
═══════════════════════════════════
EOF
