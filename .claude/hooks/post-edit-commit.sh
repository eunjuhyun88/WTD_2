#!/usr/bin/env bash
# PostToolUse hook: 파일 1개당 즉시 commit — 롤백/중단 시 상태 보존
# 조건:
#   - git repo 안에 있을 것
#   - rebase/merge/cherry-pick 진행 중이 아닐 것
#   - 해당 파일에 실제 변경이 있을 것
#   - staging area에 다른 파일이 없을 것 (충돌 방지)
#
# stdin JSON: {"tool_input": {"file_path": "..."}, "tool_name": "..."}

set -uo pipefail

INPUT="$(cat)"
FILE_PATH="$(printf '%s' "$INPUT" | python3 -c \
  "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('file_path',''))" \
  2>/dev/null || echo "")"

[ -z "$FILE_PATH" ] && exit 0
[ -f "$FILE_PATH" ] || exit 0   # 삭제된 파일은 별도 처리 불필요

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
cd "$ROOT"

# rebase / merge / cherry-pick 중이면 자동 커밋 건너뜀
[ -f ".git/MERGE_HEAD" ]       && exit 0
[ -f ".git/CHERRY_PICK_HEAD" ] && exit 0
[ -d ".git/rebase-merge" ]     && exit 0
[ -d ".git/rebase-apply" ]     && exit 0

REL="$(python3 -c "import os,sys; print(os.path.relpath(sys.argv[1],sys.argv[2]))" "$FILE_PATH" "$ROOT" 2>/dev/null || echo "$FILE_PATH")"

# 이미 staged된 다른 파일이 있으면 target만 stage하고 커밋은 건너뜀 (충돌 방지)
OTHER_STAGED="$(git diff --cached --name-only 2>/dev/null | grep -v "^${REL}$" || true)"
if [ -n "$OTHER_STAGED" ]; then
  git add "$REL" 2>/dev/null || true
  exit 0
fi

# 파일을 stage
git add "$REL" 2>/dev/null || exit 0

# stage에 변경이 없으면 스킵 (이미 committed 상태)
git diff --cached --quiet 2>/dev/null && exit 0

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")"
git commit -m "wip: $REL" 2>/dev/null \
  && printf '[auto-commit] %s → %s\n' "$REL" "$BRANCH" \
  || true   # 커밋 실패해도 훅 전체는 성공 (모델 중단 방지)

exit 0
