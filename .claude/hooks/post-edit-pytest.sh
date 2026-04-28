#!/usr/bin/env bash
# PostToolUse hook: engine test_*.py 수정 시 pytest 자동 실행
# exit 0 → silent (pass or 비대상)
# exit 2 → stderr를 모델에 표시 (pytest fail)
#
# stdin JSON: {"tool_input": {"file_path": "..."}}

set -uo pipefail

INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" \
  2>/dev/null || echo "")"

[ -z "$FILE_PATH" ] && exit 0

# 대상 조건: engine/ 하위 + basename이 test_*.py
case "$FILE_PATH" in
  */engine/*) : ;;
  *) exit 0 ;;
esac
BASENAME="$(basename "$FILE_PATH")"
case "$BASENAME" in
  test_*.py) : ;;
  *) exit 0 ;;
esac

# engine root 탐색 (pyproject.toml 기준, 최대 5단계)
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

REL="$(python3 -c "import os,sys; print(os.path.relpath(sys.argv[1],sys.argv[2]))" "$FILE_PATH" "$ENGINE_ROOT" 2>/dev/null || echo "$BASENAME")"
RESULT="$("$UV" run pytest "$REL" -q --tb=short 2>&1)" || {
  printf '[post-edit-pytest] FAIL: %s\n%s\n' "$REL" "$RESULT" >&2
  exit 2
}
exit 0
