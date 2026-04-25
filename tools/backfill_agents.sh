#!/bin/bash
# backfill_agents.sh — Agent 1-6 기록을 memory/sessions/에 backfill
# 한 번만 실행. 이미 한 번 실행됐으면 다시 추가하지 않음 (idempotent).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

mkdir -p memory/sessions

# Idempotent — A001이 이미 있으면 skip
if grep -q '"id":"A001"' memory/sessions/*.jsonl 2>/dev/null; then
  echo "✓ Agents already backfilled (A001 found)"
  exit 0
fi

# Agent 1-6 기록을 historical session jsonl에 추가
TARGET="memory/sessions/2026-04-26-agent-backfill.jsonl"

cat >> "$TARGET" <<'EOF'
{"ts":"2026-04-25T03:00:00Z","id":"A001","event":"P0-P2 engine infra 5 modules (PR #281)","tags":["session","end","A001"],"importance":"high","branch":"feat/agent-execution-protocol","end_sha":"61e7ce11","shipped":"PR #281","handoff":"GCP redeploy + corpus populate"}
{"ts":"2026-04-25T08:00:00Z","id":"A002","event":"CI recovery 39→0 failures","tags":["session","end","A002"],"importance":"high","branch":"feat/agent-execution-protocol","end_sha":"65765205","shipped":"in-branch","handoff":"branch batch merge needed"}
{"ts":"2026-04-25T12:00:00Z","id":"A003","event":"branch batch merge PR #259-#274 + CI repair PR #286","tags":["session","end","A003"],"importance":"high","branch":"various","end_sha":"c5e606f9","shipped":"15 PRs","handoff":"4 conflict PRs need rebase"}
{"ts":"2026-04-25T16:00:00Z","id":"A004","event":"PR #287-#290 rebase + W-0210 4-layer viz (PR #283)","tags":["session","end","A004"],"importance":"high","branch":"feat/agent-execution-protocol","end_sha":"38ce46a8","shipped":"PR #283 #287 #288 #289 #290","handoff":"worktree 50 cleanup needed"}
{"ts":"2026-04-26T15:00:00Z","id":"A005","event":"branch cleanup 53→0 + design doc PR #311","tags":["session","end","A005"],"importance":"high","branch":"various","end_sha":"b942f346","shipped":"PR #311","handoff":"W-0132 P0 ready, worktrees still 50"}
{"ts":"2026-04-26T17:00:00Z","id":"A006","event":"worktree 50→5 + W-0211 PR #308 + agent docs PR #320","tags":["session","end","A006"],"importance":"high","branch":"claude/funny-goldstine + docs/*","end_sha":"51ea37cf","shipped":"PR #308 #314 #316 #320","handoff":"Multi-Agent OS v2 design saved → A007 implements"}
EOF

echo "✓ Backfilled A001-A006 to $TARGET"
