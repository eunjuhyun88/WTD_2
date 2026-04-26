---
description: 세션 시작 — Agent ID 발번 + memkraft brief + state + P0/P1 + 직전 handoff (auto-bootstrap)
---

## Bootstrap (자동 실행)

다음 bash를 먼저 실행하세요. `tools/start.sh` 부재 시 자동 sync:

```bash
# Step 0 — Auto-sync main if tools/ missing
if [ ! -f tools/start.sh ] || [ ! -f spec/PRIORITIES.md ]; then
  echo "🔄 tools/ or spec/ missing — auto-syncing main..."
  git fetch origin main
  CURRENT_BRANCH=$(git branch --show-current)

  # 충돌 회피: untracked .claude/commands/는 stash
  git stash push -u -m "auto-sync-untracked-$(date +%s)" >/dev/null 2>&1 || true

  git merge origin/main --no-edit
  MERGE_STATUS=$?

  # stash pop (있으면)
  git stash list | grep -q "auto-sync-untracked-" && git stash pop >/dev/null 2>&1 || true

  if [ $MERGE_STATUS -ne 0 ]; then
    echo "❌ merge conflict — manual resolution needed"
    echo "   다음 명령어로 해결:"
    echo "   git status"
    echo "   # conflict 해결 후"
    echo "   git commit"
    echo "   ./tools/start.sh"
    exit 1
  fi

  echo "✅ synced. tools/ + spec/ 사용 가능"
  echo ""
fi

# Step 1 — 표준 start
./tools/start.sh
```

## start.sh가 자동 수행

1. `state/`를 git/gh CLI로부터 갱신 (main SHA, open PRs, worktrees)
2. memory/sessions/agents/ 기준 다음 Agent ID 발번 (자동, 가변)
3. **memkraft 통합 출력**:
   - `memkraft open-loops --dry-run` — 미해결 항목
   - `memkraft dream --dry-run` — 메모리 건강
4. 활성 file-domain locks (`spec/CONTRACTS.md`)
5. P0/P1/P2 우선순위 (`spec/PRIORITIES.md`)
6. 최근 5개 에이전트 + 직전 handoff

## 실행 후 안내

다음 슬래시 커맨드 사용법 안내:
- `/claim "engine/X, app/Y"` — 작업 영역 lock
- `/save "다음에 할 일"` — 세션 중간 체크포인트 (memkraft log 자동)
- `/end "shipped" "handoff" [lesson]` — 세션 종료 + memkraft retro
- `/agent-status` — 현재 상태 한눈에

내 Agent ID와 직전 에이전트의 handoff를 명확히 표시하세요.

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `tools/start.sh: No such file or directory` | worktree가 옛 main 기준 | bootstrap이 자동 sync (위 Step 0) |
| `merge conflict` | main과 worktree 양쪽 동일 파일 수정 | 수동 resolve → `git commit` → `./tools/start.sh` 재실행 |
| `permission denied` | tools/*.sh 실행권한 없음 | `chmod +x tools/*.sh` |
| `gh: not found` | GitHub CLI 미설치 | `brew install gh` (mac) |
