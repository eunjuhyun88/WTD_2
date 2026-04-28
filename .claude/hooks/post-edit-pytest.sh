#!/usr/bin/env bash
# PostToolUse hook: engine test_*.py 수정 시 pytest 자동 실행
# exit 0 → silent pass, exit 2 → 모델에 실패 결과 전달
set -eo pipefail

INPUT="$(cat)"

# Support both Claude hook payload shapes
FILE_PATH="$(printf '%s' "$INPUT" | python3 -c "
import sys, json
d = json.load(sys.stdin)
fp = d.get('tool_input', d.get('inputs', {})).get('file_path', '')
print(fp)
" 2>/dev/null || echo "")"

[ -z "$FILE_PATH" ] && exit 0

# Only engine files
case "$FILE_PATH" in */engine/*) : ;; *) exit 0 ;; esac

# Only test files
BASENAME="$(basename "$FILE_PATH")"
case "$BASENAME" in test_*.py) : ;; *) exit 0 ;; esac

# Find ENGINE_ROOT by walking up to pyproject.toml
ENGINE_ROOT=""
SEARCH="$(dirname "$FILE_PATH")"
for _ in 1 2 3 4 5; do
  if [ -f "$SEARCH/pyproject.toml" ]; then
    ENGINE_ROOT="$SEARCH"
    break
  fi
  SEARCH="$(dirname "$SEARCH")"
done
[ -z "$ENGINE_ROOT" ] && exit 0

UV="$(command -v uv 2>/dev/null || echo "")"
[ -z "$UV" ] && exit 0

REL="$(python3 -c "
import os, sys
print(os.path.relpath(sys.argv[1], sys.argv[2]))
" "$FILE_PATH" "$ENGINE_ROOT" 2>/dev/null || echo "$BASENAME")"

RESULT="$("$UV" run pytest "$REL" -q --tb=short 2>&1)" || {
  printf '[post-edit-pytest] FAIL: %s\n%s\n' "$REL" "$RESULT" >&2
  exit 2
}
exit 0
