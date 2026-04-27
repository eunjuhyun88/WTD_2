#!/bin/bash
# worktree-registry.sh — Worktree SSOT registry CLI (state/worktrees.json)
#
# 단일 진실: 각 worktree path → (agent_id, branch, issue, work_item, status, last_active).
# 다른 multi-agent 시스템(live.sh heartbeat, gh issue assignee)과 보완 관계.
#
# 사용:
#   tools/worktree-registry.sh register [--issue N] [--work-item W-NNNN] [--agent A###]
#       현재 worktree를 registry에 등록/업데이트. 호출자(start.sh, claim.sh)가 사용.
#   tools/worktree-registry.sh set <KEY> <VALUE>
#       현재 worktree의 임의 declared 필드 갱신 (issue|work_item|status|notes|agent_id).
#   tools/worktree-registry.sh get [--path P] [KEY]
#       현재(또는 path 지정) worktree의 entry를 jq로 출력.
#   tools/worktree-registry.sh list [--mine | --orphan | --stale | --all]
#       worktree 목록 표시.
#   tools/worktree-registry.sh sweep
#       heartbeat 24h+ idle → status=stale, 7d+ → notes에 폐기 추천.
#   tools/worktree-registry.sh remove [--path P]
#       registry entry만 삭제 (실제 worktree는 git worktree remove 별도).
#
# Atomic: 모든 쓰기는 mktemp + mv. flock 미사용 (jq는 빠름, race 창은 ms 단위).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

REG_FILE="state/worktrees.json"
STALE_HOURS_WARN=24
STALE_HOURS_PRUNE=168  # 7일

mkdir -p state

_now_iso() { date -u +%Y-%m-%dT%H:%M:%SZ; }
_now_epoch() { date -u +%s; }

_iso_to_epoch() {
  local ts="$1"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" "+%s" 2>/dev/null || echo 0
  else
    date -u -d "$ts" +%s 2>/dev/null || echo 0
  fi
}

_inode_of() {
  stat -f %i "$1" 2>/dev/null || stat -c %i "$1" 2>/dev/null || echo ""
}

_current_path() {
  # macOS case-insensitive FS: git worktree list의 path 중 같은 inode를 반환.
  # 그래야 registry(refresh_state가 작성)의 path와 일치한다.
  local our_root; our_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  local our_inode; our_inode="$(_inode_of "$our_root")"
  if [ -n "$our_inode" ]; then
    while IFS= read -r p; do
      [ -d "$p" ] || continue
      if [ "$(_inode_of "$p")" = "$our_inode" ]; then
        echo "$p"
        return
      fi
    done < <(git worktree list --porcelain | awk '/^worktree / {print $2}')
  fi
  echo "$our_root"
}

_ensure_registry() {
  if [ ! -f "$REG_FILE" ] || ! jq -e 'type=="array"' "$REG_FILE" >/dev/null 2>&1; then
    "$SCRIPT_DIR/refresh_state.sh" >/dev/null
  fi
}

_atomic_write() {
  local payload="$1"
  local tmp; tmp="$(mktemp)"
  echo "$payload" | jq '.' > "$tmp"
  mv "$tmp" "$REG_FILE"
}

# ── register: 현재 worktree를 등록/업데이트 ──────────────────────────────────
cmd_register() {
  local agent="" issue="" work_item="" status="active"
  while [ $# -gt 0 ]; do
    case "$1" in
      --agent)     agent="$2"; shift 2 ;;
      --issue)     issue="$2"; shift 2 ;;
      --work-item) work_item="$2"; shift 2 ;;
      --status)    status="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  _ensure_registry

  local path; path="$(_current_path)"
  local now; now="$(_now_iso)"
  [ -z "$agent" ] && agent="$(cat state/current_agent.txt 2>/dev/null || echo '')"

  local merged
  merged="$(jq \
    --arg path "$path" \
    --arg now "$now" \
    --arg agent "$agent" \
    --arg issue "$issue" \
    --arg work_item "$work_item" \
    --arg status "$status" '
    map(if .path == $path then
          . + {
            last_active: $now,
            agent_id:  (if $agent     != "" then $agent          else .agent_id  end),
            issue:     (if $issue     != "" then ($issue | tonumber? // $issue) else .issue end),
            work_item: (if $work_item != "" then $work_item      else .work_item end),
            status:    (if $status    != "" then $status         else (.status // "active") end),
            claimed_at: (.claimed_at // (if $issue != "" or $work_item != "" then $now else null end))
          }
        else . end)
  ' "$REG_FILE")"
  _atomic_write "$merged"
  echo "✓ registry register: $path (agent=$agent issue=$issue work_item=$work_item status=$status)"
}

# ── set <KEY> <VALUE> ────────────────────────────────────────────────────────
cmd_set() {
  local key="$1" value="$2"
  case "$key" in
    agent_id|issue|work_item|status|notes|claimed_at) ;;
    *) echo "✗ unknown key: $key (allowed: agent_id|issue|work_item|status|notes|claimed_at)" >&2; exit 1 ;;
  esac
  _ensure_registry
  local path; path="$(_current_path)"
  local now; now="$(_now_iso)"
  local merged
  merged="$(jq \
    --arg path "$path" \
    --arg key "$key" \
    --arg val "$value" \
    --arg now "$now" '
    map(if .path == $path then
          .[$key] = (if $key == "issue" then ($val | tonumber? // $val) else $val end)
          | .last_active = $now
        else . end)
  ' "$REG_FILE")"
  _atomic_write "$merged"
  echo "✓ registry set: $path .$key = $value"
}

# ── get [--path P] [KEY] ─────────────────────────────────────────────────────
cmd_get() {
  local target_path key=""
  target_path="$(_current_path)"
  while [ $# -gt 0 ]; do
    case "$1" in
      --path) target_path="$2"; shift 2 ;;
      *) key="$1"; shift ;;
    esac
  done
  _ensure_registry
  if [ -n "$key" ]; then
    jq -r --arg path "$target_path" --arg key "$key" \
      'map(select(.path == $path)) | first | .[$key] // ""' "$REG_FILE"
  else
    jq --arg path "$target_path" 'map(select(.path == $path)) | first' "$REG_FILE"
  fi
}

# ── list ─────────────────────────────────────────────────────────────────────
cmd_list() {
  local mode="all"
  case "${1:-}" in
    --mine)   mode="mine" ;;
    --orphan) mode="orphan" ;;
    --stale)  mode="stale" ;;
    --all|"") mode="all" ;;
  esac
  _ensure_registry
  local me; me="$(cat state/current_agent.txt 2>/dev/null || echo '')"

  jq -r --arg me "$me" --arg mode "$mode" '
    map(. + {_age_h: (if .last_active then ((now - (.last_active | fromdateiso8601)) / 3600 | floor) else null end)})
    | map(select(
        $mode == "all"
        or ($mode == "mine"   and .agent_id == $me)
        or ($mode == "orphan" and (.exists == false or .status == "orphan"))
        or ($mode == "stale"  and .status == "stale")
      ))
    | .[]
    | "\(.path)\n  branch=\(.branch // "?")  agent=\(.agent_id // "-")  issue=\(.issue // "-")  work_item=\(.work_item // "-")  status=\(.status // "-")\n  ahead=\(.ahead // 0)  modified=\(.modified // 0)  age_h=\(._age_h // "-")"
  ' "$REG_FILE"
}

# ── sweep: stale 표식 ─────────────────────────────────────────────────────────
cmd_sweep() {
  _ensure_registry
  local now_e; now_e="$(_now_epoch)"
  local merged
  merged="$(jq \
    --argjson now "$now_e" \
    --argjson warn_s $((STALE_HOURS_WARN * 3600)) \
    --argjson prune_s $((STALE_HOURS_PRUNE * 3600)) '
    def age_seconds(w):
      if (w.last_active // null) == null then 0
      else ($now - (w.last_active | fromdateiso8601))
      end;
    map(
      . as $w |
      (age_seconds($w)) as $age |
      if $age > $prune_s and (($w.status // "active") != "done") then
        ($age / 3600 | floor) as $age_h |
        . + {status: "stale", notes: ((.notes // "") + " [sweep: " + ($age_h|tostring) + "h idle, 폐기 권장]")}
      elif $age > $warn_s and (($w.status // "active") == "active") then
        . + {status: "stale"}
      else .
      end
    )
  ' "$REG_FILE")"
  _atomic_write "$merged"
  echo "✓ sweep done. stale: $(jq '[.[] | select(.status=="stale")] | length' "$REG_FILE")"
}

# ── remove ───────────────────────────────────────────────────────────────────
cmd_remove() {
  local target_path
  target_path="$(_current_path)"
  while [ $# -gt 0 ]; do
    case "$1" in
      --path) target_path="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  _ensure_registry
  local merged
  merged="$(jq --arg path "$target_path" 'map(select(.path != $path))' "$REG_FILE")"
  _atomic_write "$merged"
  echo "✓ registry remove: $target_path"
}

# ── dispatch ─────────────────────────────────────────────────────────────────
CMD="${1:-}"
shift || true
case "$CMD" in
  register) cmd_register "$@" ;;
  set)      cmd_set "$@" ;;
  get)      cmd_get "$@" ;;
  list)     cmd_list "$@" ;;
  sweep)    cmd_sweep ;;
  remove)   cmd_remove "$@" ;;
  *)
    cat <<EOF
Usage:
  $0 register [--agent A###] [--issue N] [--work-item W-NNNN] [--status active|done|stale]
  $0 set <key> <value>      # key: agent_id|issue|work_item|status|notes|claimed_at
  $0 get [--path P] [key]
  $0 list [--mine|--orphan|--stale|--all]
  $0 sweep                  # 24h+ idle → stale, 7d+ → 폐기 권장 noted
  $0 remove [--path P]
EOF
    exit 1
    ;;
esac
