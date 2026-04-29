#!/usr/bin/env bash
# PostToolUse hook: 파일 1개당 즉시 commit — 롤백/중단 시 상태 보존
set -uo pipefail
INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" \
  2>/dev/null || echo "")"
[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT"
[ -f ".git/MERGE_HEAD" ]       && exit 0
[ -f ".git/CHERRY_PICK_HEAD" ] && exit 0
[ -d ".git/rebase-merge" ]     && exit 0
[ -d ".git/rebase-apply" ]     && exit 0
REL="$(python3 -c "import os,sys; print(os.path.relpath(sys.argv[1],sys.argv[2]))" "$FILE_PATH" "$ROOT" 2>/dev/null || echo "$FILE_PATH")"
OTHER_STAGED="$(git diff --cached --name-only 2>/dev/null | grep -v "^${REL}$" || true)"
if [ -n "$OTHER_STAGED" ]; then git add "$REL" 2>/dev/null || true; exit 0; fi
git add "$REL" 2>/dev/null || exit 0
git diff --cached --quiet 2>/dev/null && exit 0
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
git commit -m "wip: $REL" 2>/dev/null \
  && printf '[auto-commit] %s → %s\n' "$REL" "$BRANCH" \
  || true
exit 0
