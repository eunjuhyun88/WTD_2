# Session — Local Main Divergence Fix (2026-04-28)

## Type
Diagnostic + environment fix. **No code/PR changes.**

## Trigger
A052 시작 시 `/start` 자동 sync에서 merge conflict (160 commits behind).

## Root Cause Found
사용자가 PR 머지를 GitHub origin에서 다 했지만, **로컬 main 브랜치가 한 번도 fast-forward되지 않음**.
- 로컬 main HEAD: `7e9e68e0` (4-26)
- origin/main: `d6893cb8` (4-28)
- 로컬에만 있던 docs commit 2개: `7e9e68e0`, `366735df` (work/active 파일들 — 이미 다른 PR로 origin 정리됨)

**파급:** Claude Code가 새 worktree를 자동생성할 때 `git worktree add -b claude/<name>` (base 명시 X) → 로컬 main 기준 → stale 무한 상속. `claude/adoring-wiles-273103`, `claude/awesome-benz`, `claude/charming-satoshi`, `romantic-tesla` 등 10개 이상의 stale claude/* 브랜치가 모두 7e9e68e0 가리킴.

## Fix Applied
```bash
cd /Users/ej/Projects/wtd-v2/.codex/worktrees/pr-322-memory-consolidation  # main이 체크아웃된 worktree
git fetch origin
git branch local-main-backup-20260428 main   # 옛 main(7e9e68e0) 백업 — 두 docs commit 보존
git reset --hard origin/main                  # main = d6893cb8 (fresh)
```

## Aftermath
- 로컬 main = origin/main = d6893cb8 ✅
- 백업 브랜치 `local-main-backup-20260428 @ 7e9e68e0` 보존
- **이 세션의 stale worktree(`romantic-tesla`)는 폐기 대상** — 코드 작업 안 함

## Lesson
**근본 가드는 worktree 진입 단계가 아니라 "로컬 main 자동 fast-forward"여야 함.**
PR #498 (start.md stale guard) 한계: 가드 코드가 worktree 안 파일에 의존 → stale worktree에는 가드 자기 자신이 부재.

향후 후보:
- `~/.claude/CLAUDE.md` global hook으로 새 worktree 만들 때 `git fetch && git branch -f main origin/main` 강제
- post-checkout hook으로 main behind > N 검증
- 자동 cleanup cron — N일 이상 stale claude/* worktree 매일 prune
- 또는 운영 규칙: `EnterWorktree` 사용 금지, 수동 `git worktree add ... origin/main`만 허용

## Next Session First Move
```bash
cd /Users/ej/Projects/wtd-v2
git worktree add .claude/worktrees/W-0254-h07-h08 main -b feat/W-0254-h07-h08
cd .claude/worktrees/W-0254-h07-h08
# 새 채팅 → /start
```
P0 1순위: **W-0254 H-07 + H-08 레이블 + V-08 pipeline** (A035 V-track 머지 후속).
