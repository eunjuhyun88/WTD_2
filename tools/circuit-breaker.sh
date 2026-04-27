#!/usr/bin/env bash
# W-0273 Phase 3 — Circuit Breaker
#
# Tracks sub-agent failure counts and enforces automatic open/half-open/closed
# state transitions (Nygard 2007 / Hystrix pattern).
#
# State machine:
#   CLOSED   → normal operation (failure_count < threshold)
#   OPEN     → blocked: fail-fast, no new spans allowed
#   HALF-OPEN → probe: one attempt allowed; success → CLOSED, failure → OPEN
#
# State file:
#   state/circuit-breaker.json
#   {
#     "breakers": {
#       "<key>": {
#         "state": "CLOSED|OPEN|HALF-OPEN",
#         "failure_count": 0,
#         "last_failure_ts": null,
#         "last_state_change_ts": "...",
#         "half_open_attempt": false
#       }
#     },
#     "defaults": { "threshold": 3, "timeout_sec": 1800, "half_open_probe_sec": 300 }
#   }
#
# Usage:
#   ./tools/circuit-breaker.sh status [<key>]
#         — show state of all breakers or a specific one
#
#   ./tools/circuit-breaker.sh check <key>
#         — exit 0 if CLOSED/HALF-OPEN (proceed), exit 1 if OPEN (blocked)
#         — auto-transitions OPEN→HALF-OPEN if timeout elapsed
#
#   ./tools/circuit-breaker.sh success <key>
#         — record success: HALF-OPEN → CLOSED, reset failure_count
#
#   ./tools/circuit-breaker.sh failure <key> [--msg "reason"]
#         — record failure: increment count; if >= threshold → OPEN
#
#   ./tools/circuit-breaker.sh reset <key>
#         — force CLOSED + zero failure_count (manual override)
#
#   ./tools/circuit-breaker.sh timeout-check
#         — scan all OPEN breakers and transition to HALF-OPEN if timeout elapsed
#         — safe to call from start.sh or a cron
#
# Key convention:  agent:<A###>   or   task:<work-item>   or   tool:<bash|git|...>
#
# Integration hooks:
#   In start.sh — call: ./tools/circuit-breaker.sh check "agent:$NEXT_ID"
#   In agent definitions — wrap sub-agent launch with check + success/failure

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_FILE="$REPO_ROOT/state/circuit-breaker.json"
STATE_DIR="$REPO_ROOT/state"
LOCK_FILE="$STATE_DIR/.cb.lock"

# Default thresholds
DEFAULT_THRESHOLD=3        # failures before OPEN
DEFAULT_TIMEOUT_SEC=1800   # 30 min — OPEN→HALF-OPEN auto transition
DEFAULT_HALF_OPEN_PROBE_SEC=300  # 5 min — HALF-OPEN probe window

TS_NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---------------------------------------------------------------------------
# Lock helpers (simple mkdir lock)
# ---------------------------------------------------------------------------
_acquire_lock() {
  local retries=20
  while ! mkdir "$LOCK_FILE" 2>/dev/null; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      echo "✗ circuit-breaker: could not acquire lock" >&2
      exit 1
    fi
    sleep 0.1
  done
  trap 'rmdir "$LOCK_FILE" 2>/dev/null || true' EXIT
}

_release_lock() {
  rmdir "$LOCK_FILE" 2>/dev/null || true
  trap - EXIT
}

# ---------------------------------------------------------------------------
# JSON helpers (using python3 if jq not available)
# ---------------------------------------------------------------------------
_jq() {
  if command -v jq >/dev/null 2>&1; then
    jq "$@"
  else
    python3 -c "
import sys, json
data = json.load(sys.stdin)
# minimal jq -r '.<path>' replacement
path = sys.argv[1].lstrip('.')
for part in path.split('.'):
    if part:
        data = data.get(part, None) if isinstance(data, dict) else None
print(data if data is not None else 'null')
" "$@"
  fi
}

_init_state() {
  mkdir -p "$STATE_DIR"
  if [ ! -f "$STATE_FILE" ]; then
    cat > "$STATE_FILE" <<'INITJSON'
{
  "breakers": {},
  "defaults": {
    "threshold": 3,
    "timeout_sec": 1800,
    "half_open_probe_sec": 300
  }
}
INITJSON
  fi
}

# Read field from state (using python3 for robustness)
_get() {
  local key="$1" field="$2"
  python3 - "$STATE_FILE" "$key" "$field" <<'PY'
import sys, json
with open(sys.argv[1]) as f:
    state = json.load(f)
key = sys.argv[2]
field = sys.argv[3]
breaker = state.get("breakers", {}).get(key, {})
if field == "_all":
    print(json.dumps(breaker, indent=2))
elif field.startswith("defaults."):
    k = field.split(".", 1)[1]
    print(state.get("defaults", {}).get(k, "null"))
else:
    print(json.dumps(breaker.get(field, None)))
PY
}

# Atomic update of a breaker key
_update_breaker() {
  local key="$1"
  local updates="$2"  # python dict literal of fields to merge
  python3 - "$STATE_FILE" "$key" "$updates" <<'PY'
import sys, json, os
path = sys.argv[1]
key  = sys.argv[2]
upd  = eval(sys.argv[3])  # safe: script-controlled literals only
with open(path) as f:
    state = json.load(f)
if key not in state["breakers"]:
    state["breakers"][key] = {
        "state": "CLOSED",
        "failure_count": 0,
        "last_failure_ts": None,
        "last_state_change_ts": None,
        "half_open_attempt": False,
    }
state["breakers"][key].update(upd)
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(state, f, indent=2)
os.replace(tmp, path)
PY
}

# ---------------------------------------------------------------------------
# epoch helper (portable macOS + Linux)
# ---------------------------------------------------------------------------
_epoch() {
  date -u +%s 2>/dev/null || python3 -c "import time; print(int(time.time()))"
}

_epoch_from_iso() {
  local iso="$1"
  python3 -c "
from datetime import datetime, timezone
dt = datetime.fromisoformat('${iso}'.replace('Z', '+00:00'))
print(int(dt.timestamp()))
"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

cmd_status() {
  _init_state
  local key="${1:-}"
  if [ -n "$key" ]; then
    echo "=== Circuit Breaker: $key ==="
    _get "$key" "_all"
  else
    python3 - "$STATE_FILE" <<'PY'
import sys, json
with open(sys.argv[1]) as f:
    state = json.load(f)
breakers = state.get("breakers", {})
if not breakers:
    print("(no breakers registered)")
else:
    print(f"{'Key':<30} {'State':<12} {'Failures'}")
    print("─" * 60)
    for k, v in sorted(breakers.items()):
        st = v.get("state", "CLOSED")
        fc = v.get("failure_count", 0)
        print(f"{k:<30} {st:<12} {fc}")
PY
  fi
}

cmd_check() {
  local key="${1:-}"
  if [ -z "$key" ]; then echo "usage: check <key>"; exit 2; fi
  _init_state

  # auto-transition OPEN→HALF-OPEN if timeout elapsed
  cmd_timeout_check_key "$key" 2>/dev/null || true

  local state
  state="$(_get "$key" state | tr -d '"')"

  if [ -z "$state" ] || [ "$state" = "null" ] || [ "$state" = "CLOSED" ]; then
    exit 0  # proceed
  fi

  if [ "$state" = "HALF-OPEN" ]; then
    local attempt
    attempt="$(_get "$key" half_open_attempt | tr -d '"')"
    if [ "$attempt" = "false" ] || [ "$attempt" = "null" ]; then
      _acquire_lock
      _update_breaker "$key" "{'half_open_attempt': True}"
      _release_lock
      echo "HALF-OPEN probe allowed: $key" >&2
      exit 0  # one probe attempt
    else
      echo "HALF-OPEN: probe already in-flight for $key" >&2
      exit 1  # blocked until result
    fi
  fi

  if [ "$state" = "OPEN" ]; then
    echo "OPEN: circuit breaker blocking $key" >&2
    exit 1  # blocked
  fi

  exit 0
}

cmd_success() {
  local key="${1:-}"
  if [ -z "$key" ]; then echo "usage: success <key>"; exit 2; fi
  _init_state
  _acquire_lock
  _update_breaker "$key" "{'state': 'CLOSED', 'failure_count': 0, 'half_open_attempt': False, 'last_state_change_ts': '${TS_NOW}'}"
  _release_lock
  echo "✓ circuit breaker CLOSED: $key"
}

cmd_failure() {
  local key="${1:-}"
  if [ -z "$key" ]; then echo "usage: failure <key>"; exit 2; fi
  _init_state

  local msg=""
  shift || true
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --msg) msg="${2:-}"; shift 2 ;;
      *) shift ;;
    esac
  done

  local threshold
  threshold="$(_get "$key" "defaults.threshold" 2>/dev/null || echo "$DEFAULT_THRESHOLD")"
  [ "$threshold" = "null" ] && threshold="$DEFAULT_THRESHOLD"

  _acquire_lock
  python3 - "$STATE_FILE" "$key" "$threshold" "$TS_NOW" "$msg" <<'PY'
import sys, json, os
path, key, threshold, ts_now, msg = sys.argv[1:]
threshold = int(threshold)
with open(path) as f:
    state = json.load(f)
b = state["breakers"].setdefault(key, {
    "state": "CLOSED", "failure_count": 0,
    "last_failure_ts": None, "last_state_change_ts": None,
    "half_open_attempt": False,
})
b["failure_count"] = b.get("failure_count", 0) + 1
b["last_failure_ts"] = ts_now
if msg:
    b["last_failure_msg"] = msg
if b["failure_count"] >= threshold:
    prev = b.get("state")
    b["state"] = "OPEN"
    if prev != "OPEN":
        b["last_state_change_ts"] = ts_now
        print(f"⚡ OPEN: {key} (failures={b['failure_count']}, threshold={threshold})")
    else:
        print(f"✗ failure recorded: {key} (count={b['failure_count']}, already OPEN)")
elif b.get("state") == "HALF-OPEN":
    b["state"] = "OPEN"
    b["half_open_attempt"] = False
    b["last_state_change_ts"] = ts_now
    print(f"⚡ HALF-OPEN → OPEN: {key} (probe failed)")
else:
    print(f"✗ failure recorded: {key} (count={b['failure_count']}/{threshold})")
tmp = path + ".tmp"
with open(tmp, "w") as f:
    json.dump(state, f, indent=2)
os.replace(tmp, path)
PY
  _release_lock
}

cmd_reset() {
  local key="${1:-}"
  if [ -z "$key" ]; then echo "usage: reset <key>"; exit 2; fi
  _init_state
  _acquire_lock
  _update_breaker "$key" "{'state': 'CLOSED', 'failure_count': 0, 'half_open_attempt': False, 'last_state_change_ts': '${TS_NOW}'}"
  _release_lock
  echo "✓ circuit breaker reset: $key"
}

cmd_timeout_check_key() {
  local key="${1:-}"
  [ -z "$key" ] && return 0
  _init_state

  local state
  state="$(_get "$key" state | tr -d '"')"
  [ "$state" != "OPEN" ] && return 0

  local last_change_ts
  last_change_ts="$(_get "$key" last_state_change_ts | tr -d '"')"
  [ "$last_change_ts" = "null" ] || [ -z "$last_change_ts" ] && return 0

  local now elapsed
  now="$(_epoch)"
  elapsed="$(( now - $(_epoch_from_iso "$last_change_ts") ))"

  local timeout="$DEFAULT_TIMEOUT_SEC"

  if [ "$elapsed" -ge "$timeout" ]; then
    _acquire_lock
    _update_breaker "$key" "{'state': 'HALF-OPEN', 'half_open_attempt': False, 'last_state_change_ts': '${TS_NOW}'}"
    _release_lock
    echo "⟳ OPEN→HALF-OPEN (timeout): $key"
  fi
}

cmd_timeout_check() {
  _init_state
  local open_keys
  open_keys="$(python3 - "$STATE_FILE" <<'PY'
import sys, json
with open(sys.argv[1]) as f:
    state = json.load(f)
open_keys = [k for k, v in state.get("breakers", {}).items() if v.get("state") == "OPEN"]
for k in open_keys:
    print(k)
PY
)"
  while IFS= read -r key; do
    [ -n "$key" ] && cmd_timeout_check_key "$key"
  done <<< "$open_keys"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
CMD="${1:-status}"
shift || true

case "$CMD" in
  status)           cmd_status "${1:-}" ;;
  check)            cmd_check "${1:-}" ;;
  success)          cmd_success "${1:-}" ;;
  failure)          cmd_failure "${1:-}" "$@" ;;
  reset)            cmd_reset "${1:-}" ;;
  timeout-check)    cmd_timeout_check ;;
  *)
    echo "usage: circuit-breaker.sh <status|check|success|failure|reset|timeout-check> ..."
    exit 2
    ;;
esac
