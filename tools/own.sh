#!/usr/bin/env bash
# own.sh — file ownership claim/release/list/share (W-1004 PR1)
# Usage:
#   own.sh claim <files...>
#   own.sh release <files...>
#   own.sh list [--mine]
#   own.sh share <file> <agent>

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

OWNERSHIP_FILE="state/file-ownership.jsonl"
AGENT_FILE="state/current_agent.txt"
TTL_H=24

AGENT="$(cat "$AGENT_FILE" 2>/dev/null | tr -d '[:space:]' || echo 'unknown')"
if [ "$AGENT" = "unknown" ] || [ -z "$AGENT" ]; then
  echo "❌ Agent ID 없음. ./tools/start.sh를 먼저 실행하세요." >&2
  exit 1
fi

CMD="${1:-list}"
shift || true
TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

_active_owner() {
  local file="$1"
  [ -f "$OWNERSHIP_FILE" ] || { echo ""; return; }
  node --input-type=module <<EOF 2>/dev/null
import { readFileSync } from 'fs';
const lines = readFileSync('$OWNERSHIP_FILE','utf8').trim().split('\n').filter(Boolean);
const now = Date.now();
const TTL = ${TTL_H} * 3600 * 1000;
const claims = new Map();
for (const l of lines) {
  try {
    const e = JSON.parse(l);
    if (e.action === 'claim' && now - new Date(e.ts).getTime() < TTL) claims.set(e.file, e.agent);
    else if (e.action === 'release') claims.delete(e.file);
    else if (e.action === 'share' && e.share_with) {
      const cur = claims.get(e.file);
      if (cur) process.stdout.write('');
    }
  } catch {}
}
const owner = claims.get('$file');
if (owner && owner !== '$AGENT') process.stdout.write(owner);
EOF
}

case "$CMD" in
  claim)
    if [ $# -eq 0 ]; then echo "Usage: own.sh claim <files...>" >&2; exit 1; fi
    for f in "$@"; do
      existing="$(_active_owner "$f")"
      if [ -n "$existing" ]; then
        echo "⚠️  $f already owned by $existing" >&2
        continue
      fi
      echo "{\"ts\":\"$TS\",\"agent\":\"$AGENT\",\"file\":\"$f\",\"action\":\"claim\",\"ttl_h\":$TTL_H}" >> "$OWNERSHIP_FILE"
      echo "✅ claimed: $f"
    done
    ;;

  release)
    if [ $# -eq 0 ]; then echo "Usage: own.sh release <files...>" >&2; exit 1; fi
    for f in "$@"; do
      echo "{\"ts\":\"$TS\",\"agent\":\"$AGENT\",\"file\":\"$f\",\"action\":\"release\"}" >> "$OWNERSHIP_FILE"
      echo "🔓 released: $f"
    done
    ;;

  list)
    MINE_FLAG="${1:---all}"
    [ ! -f "$OWNERSHIP_FILE" ] && echo "(no claims)" && exit 0
    node --input-type=module <<EOF 2>/dev/null
import { readFileSync } from 'fs';
const lines = readFileSync('$OWNERSHIP_FILE','utf8').trim().split('\n').filter(Boolean);
const now = Date.now();
const TTL = ${TTL_H} * 3600 * 1000;
const claims = new Map();
for (const l of lines) {
  try {
    const e = JSON.parse(l);
    if (e.action === 'claim') {
      const age = now - new Date(e.ts).getTime();
      if (age < TTL) claims.set(e.file, { ...e, age });
      else claims.delete(e.file);
    } else if (e.action === 'release') claims.delete(e.file);
  } catch {}
}
const mine = '$MINE_FLAG' === '--mine';
let count = 0;
for (const [file, c] of claims) {
  if (!mine || c.agent === '$AGENT') {
    const expH = Math.round((TTL - c.age) / 3600000);
    const icon = c.agent === '$AGENT' ? '🟢' : '🔴';
    console.log(\`\${icon} \${file}  [\${c.agent}] expires ~\${expH}h\`);
    count++;
  }
}
if (count === 0) console.log('(no active claims)');
EOF
    ;;

  share)
    if [ $# -lt 2 ]; then echo "Usage: own.sh share <file> <agent>" >&2; exit 1; fi
    FILE="$1"; SHARE_WITH="$2"
    echo "{\"ts\":\"$TS\",\"agent\":\"$AGENT\",\"file\":\"$FILE\",\"action\":\"share\",\"share_with\":\"$SHARE_WITH\"}" >> "$OWNERSHIP_FILE"
    echo "🤝 shared: $FILE with $SHARE_WITH"
    ;;

  *)
    echo "Usage: own.sh <claim|release|list|share> ..." >&2
    exit 1
    ;;
esac
