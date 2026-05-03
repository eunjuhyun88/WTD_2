#!/usr/bin/env bash
# agent-message.sh — inter-agent inbox (W-1004 PR3)
# Usage:
#   agent-message.sh send <to_agent> <subject> <body>
#   agent-message.sh list [--unread] [--to <agent>]
#   agent-message.sh read <msg_id>
#   agent-message.sh mark-read <msg_id>
#   agent-message.sh count --unread

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

INBOX_DIR="state/agent-inbox"
AGENT_FILE="state/current_agent.txt"
RATE_FILE="state/agent-inbox/.rate-limit.jsonl"

# Rate limits
RATE_PER_HOUR=5
RATE_PER_DAY=50

AGENT="$(cat "$AGENT_FILE" 2>/dev/null | tr -d '[:space:]' || echo 'unknown')"
if [ "$AGENT" = "unknown" ] || [ -z "$AGENT" ]; then
  echo "❌ Agent ID 없음. ./tools/start.sh를 먼저 실행하세요." >&2
  exit 1
fi

mkdir -p "$INBOX_DIR"

CMD="${1:-list}"
shift || true
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

_check_rate() {
  local to="$1"
  [ ! -f "$RATE_FILE" ] && return 0
  node --input-type=module <<EOF 2>/dev/null
import { readFileSync } from 'fs';
const lines = readFileSync('$RATE_FILE','utf8').trim().split('\n').filter(Boolean);
const now = Date.now();
const hourMs = 3600000;
const dayMs = 86400000;
let hourCount = 0, dayCount = 0;
for (const l of lines) {
  try {
    const e = JSON.parse(l);
    if (e.from !== '$AGENT' || e.to !== '$to') continue;
    const age = now - new Date(e.ts).getTime();
    if (age < hourMs) hourCount++;
    if (age < dayMs) dayCount++;
  } catch {}
}
if (hourCount >= $RATE_PER_HOUR) {
  process.stderr.write('❌ rate limit: $RATE_PER_HOUR/hour exceeded for $AGENT→$to\n');
  process.exit(1);
}
if (dayCount >= $RATE_PER_DAY) {
  process.stderr.write('❌ rate limit: $RATE_PER_DAY/day exceeded for $AGENT→$to\n');
  process.exit(1);
}
EOF
}

_inbox_file() { echo "$INBOX_DIR/${1}.jsonl"; }

case "$CMD" in
  send)
    if [ $# -lt 3 ]; then
      echo "Usage: agent-message.sh send <to> <subject> <body>" >&2; exit 1
    fi
    TO="$1"; SUBJECT="$2"; BODY="$3"
    _check_rate "$TO"

    MSG_ID="msg-$(date -u +%Y%m%dT%H%M%S)-${AGENT}-${RANDOM}"
    INBOX="$(_inbox_file "$TO")"
    MSG="{\"id\":\"$MSG_ID\",\"ts\":\"$TS\",\"from\":\"$AGENT\",\"to\":\"$TO\",\"subject\":\"$SUBJECT\",\"body\":\"$BODY\",\"status\":\"unread\"}"

    # CAS append (portable atomic via temp file + mv)
    LOCK="$INBOX.lock"
    FLOCK_BIN="$(command -v flock 2>/dev/null || ls /usr/local/bin/flock /opt/homebrew/bin/flock /Users/ej/.homebrew/bin/flock 2>/dev/null | head -1 || echo '')"
    if [ -n "$FLOCK_BIN" ]; then
      ("$FLOCK_BIN" -x 200; echo "$MSG" >> "$INBOX") 200>"$LOCK"
    else
      # fallback: mkdir lock (atomic on most filesystems)
      LOCK_DIR="$INBOX.lockdir"
      for _ in $(seq 1 20); do
        mkdir "$LOCK_DIR" 2>/dev/null && break || sleep 0.05
      done
      echo "$MSG" >> "$INBOX"
      rmdir "$LOCK_DIR" 2>/dev/null || true
    fi

    # Record rate limit
    echo "{\"ts\":\"$TS\",\"from\":\"$AGENT\",\"to\":\"$TO\"}" >> "$RATE_FILE"

    echo "📨 sent: $MSG_ID → $TO"
    echo "   subject: $SUBJECT"
    ;;

  list)
    UNREAD_ONLY=false
    TO_AGENT="$AGENT"
    while [ $# -gt 0 ]; do
      case "$1" in
        --unread) UNREAD_ONLY=true ;;
        --to) shift; TO_AGENT="${1:-$AGENT}" ;;
      esac
      shift
    done
    INBOX="$(_inbox_file "$TO_AGENT")"
    [ ! -f "$INBOX" ] && echo "(no messages)" && exit 0
    node --input-type=module <<EOF 2>/dev/null
import { readFileSync } from 'fs';
const lines = readFileSync('$INBOX','utf8').trim().split('\n').filter(Boolean);
const unreadOnly = $UNREAD_ONLY;
let count = 0;
for (const l of lines) {
  try {
    const e = JSON.parse(l);
    if (unreadOnly && e.status !== 'unread') continue;
    const icon = e.status === 'unread' ? '📬' : '📭';
    console.log(\`\${icon} [\${e.id}] \${e.ts.slice(0,16)} from=\${e.from}\`);
    console.log(\`   \${e.subject}\`);
    count++;
  } catch {}
}
if (count === 0) console.log(unreadOnly ? '(no unread messages)' : '(no messages)');
EOF
    ;;

  read)
    if [ $# -eq 0 ]; then echo "Usage: agent-message.sh read <msg_id>" >&2; exit 1; fi
    MSG_ID="$1"
    INBOX="$(_inbox_file "$AGENT")"
    [ ! -f "$INBOX" ] && echo "❌ inbox empty" >&2 && exit 1
    node --input-type=module <<EOF 2>/dev/null
import { readFileSync, writeFileSync } from 'fs';
const lines = readFileSync('$INBOX','utf8').trim().split('\n').filter(Boolean);
let found = false;
const updated = lines.map(l => {
  try {
    const e = JSON.parse(l);
    if (e.id === '$MSG_ID') {
      found = true;
      console.log('📬 From: ' + e.from + '  ' + e.ts);
      console.log('   Subject: ' + e.subject);
      console.log('   Body: ' + e.body);
      e.status = 'read';
      e.read_at = new Date().toISOString();
      return JSON.stringify(e);
    }
    return l;
  } catch { return l; }
});
if (!found) { process.stderr.write('❌ message not found: $MSG_ID\n'); process.exit(1); }
writeFileSync('$INBOX', updated.join('\n') + '\n');
EOF
    ;;

  mark-read)
    if [ $# -eq 0 ]; then echo "Usage: agent-message.sh mark-read <msg_id>" >&2; exit 1; fi
    MSG_ID="$1"
    INBOX="$(_inbox_file "$AGENT")"
    [ ! -f "$INBOX" ] && echo "❌ inbox empty" >&2 && exit 1
    node --input-type=module <<EOF 2>/dev/null
import { readFileSync, writeFileSync } from 'fs';
const lines = readFileSync('$INBOX','utf8').trim().split('\n').filter(Boolean);
const updated = lines.map(l => {
  try {
    const e = JSON.parse(l);
    if (e.id === '$MSG_ID') { e.status = 'read'; e.read_at = new Date().toISOString(); return JSON.stringify(e); }
    return l;
  } catch { return l; }
});
writeFileSync('$INBOX', updated.join('\n') + '\n');
console.log('✅ marked read: $MSG_ID');
EOF
    ;;

  count)
    UNREAD_ONLY=false
    [ "${1:---unread}" = "--unread" ] && UNREAD_ONLY=true
    INBOX="$(_inbox_file "$AGENT")"
    [ ! -f "$INBOX" ] && echo "0" && exit 0
    node --input-type=module <<EOF 2>/dev/null
import { readFileSync } from 'fs';
const lines = readFileSync('$INBOX','utf8').trim().split('\n').filter(Boolean);
const count = lines.filter(l => {
  try { const e = JSON.parse(l); return !$UNREAD_ONLY || e.status === 'unread'; } catch { return false; }
}).length;
console.log(count);
EOF
    ;;

  *)
    echo "Usage: agent-message.sh <send|list|read|mark-read|count> ..." >&2
    exit 1
    ;;
esac
