#!/bin/bash
# live.sh — Agent heartbeat file manager
#
# state/agents/A###.live.json 을 write/update/delete/show 한다.
# 동시에 실행 중인 에이전트를 실시간으로 볼 수 있게 해준다.
#
# 사용:
#   tools/live.sh write            현재 에이전트 live 파일 생성
#   tools/live.sh update [claimed] [next]   갱신
#   tools/live.sh delete           세션 종료 시 삭제
#   tools/live.sh show             살아있는 에이전트 목록 출력

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LIVE_DIR="$REPO_ROOT/state/agents"
STALE_SECONDS=7200   # 2시간

_now_epoch() {
  date -u +%s
}

_iso_to_epoch() {
  local ts="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" "+%s" 2>/dev/null || _now_epoch
  else
    date -u -d "$ts" +%s 2>/dev/null || _now_epoch
  fi
}

_live_write() {
  local agent="$1" branch="$2" claimed="${3:-}" next="${4:-}"
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$LIVE_DIR"
  jq -nc \
    --arg id "$agent" --arg ts "$ts" --arg branch "$branch" \
    --arg claimed "$claimed" --arg next "$next" \
    '{id:$id, started:$ts, updated:$ts, branch:$branch, claimed:$claimed, next:$next}' \
    > "$LIVE_DIR/${agent}.live.json"
}

_live_update() {
  local agent="$1" claimed="${2:-}" next="${3:-}"
  local file="$LIVE_DIR/${agent}.live.json"
  [ -f "$file" ] || return 0
  local ts; ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local tmp; tmp="$(mktemp)"
  jq \
    --arg ts "$ts" --arg claimed "$claimed" --arg next "$next" \
    '.updated = $ts
     | if $claimed != "" then .claimed = $claimed else . end
     | if $next != "" then .next = $next else . end' \
    "$file" > "$tmp" && mv "$tmp" "$file"
}

_live_delete() {
  rm -f "$LIVE_DIR/${1}.live.json"
}

_live_show() {
  local my_agent="${1:-}"
  local now; now="$(_now_epoch)"
  local found=0

  if [ ! -d "$LIVE_DIR" ]; then echo "  (none)"; return; fi

  for f in "$LIVE_DIR"/A*.live.json; do
    [ -f "$f" ] || continue
    local id branch claimed next updated started stale_flag marker
    id="$(jq -r '.id' "$f" 2>/dev/null || echo '?')"
    branch="$(jq -r '.branch' "$f" 2>/dev/null || echo '?')"
    claimed="$(jq -r '.claimed // ""' "$f" 2>/dev/null)"
    next="$(jq -r '.next // ""' "$f" 2>/dev/null)"
    updated="$(jq -r '.updated' "$f" 2>/dev/null || echo '')"
    started="$(jq -r '.started' "$f" 2>/dev/null || echo '')"

    stale_flag=""
    if [ -n "$updated" ]; then
      local updated_epoch; updated_epoch="$(_iso_to_epoch "$updated")"
      local age=$(( now - updated_epoch ))
      [ "$age" -gt "$STALE_SECONDS" ] && stale_flag=" ⚠ stale(${age}s)"
    fi

    marker=""; [ "$id" = "$my_agent" ] && marker=" ← me"

    echo "  $id${marker}${stale_flag}"
    echo "    branch:  $branch"
    [ -n "$claimed" ] && echo "    claimed: $claimed"
    [ -n "$next" ]    && echo "    next:    $next"
    [ -n "$started" ] && echo "    since:   $started"
    found=1
  done

  if [ "$found" -eq 0 ]; then echo "  (none)"; fi
}

CMD="${1:-}"
case "$CMD" in
  write)
    AGENT="$(cat "$REPO_ROOT/state/current_agent.txt" 2>/dev/null || echo unknown)"
    BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
    _live_write "$AGENT" "$BRANCH"
    ;;
  update)
    AGENT="$(cat "$REPO_ROOT/state/current_agent.txt" 2>/dev/null || echo unknown)"
    _live_update "$AGENT" "${2:-}" "${3:-}"
    ;;
  delete)
    AGENT="$(cat "$REPO_ROOT/state/current_agent.txt" 2>/dev/null || echo unknown)"
    _live_delete "$AGENT"
    ;;
  show)
    MY="$(cat "$REPO_ROOT/state/current_agent.txt" 2>/dev/null || echo '')"
    _live_show "$MY"
    ;;
  *)
    echo "Usage: $0 {write|update|delete|show}"
    exit 1
    ;;
esac
