---
name: Branch Merges Session 3 — 2026-04-13
description: All Claude worktree branches merged into main in session 3; branch status table; pending wonderful-benz
type: project
---

All pending Claude worktree branches merged into `origin/main` as of 2026-04-13.

**Why:** Multiple parallel feature branches had accumulated since PR #13. User requested full sync.

**How to apply:** `main` is the canonical source of truth. All listed branches are merged and can be deleted.

## 머지 완료

| 브랜치 | 내용 | 결과 커밋 |
|--------|------|-----------|
| `claude/funny-roentgen` | Bloomberg UI 디자인 복구 (settings/dashboard/passport/lab, app.css, tokens.css) | `49e59e3` |
| `claude/tender-spence` | Executor-Advisor agent setup | `2772599` |
| `claude/cool-wilson` | Ensemble ML score panel + P0/P1 critical bug fixes | `d3179ec` |
| `claude/heuristic-tesla` | /deep pipeline + CoinMarketCap token universe | `f4e7e07` |
| `claude/recursing-chandrasekhar` | auth fix — already in main, cherry-pick skipped | — |

## 미머지 (의도적)

- `claude/wonderful-benz` — UI overhaul, 충돌 위험으로 보류

## 최종 main HEAD

`79f6e69` — chore: stage mobile terminal + launch.json unstaged changes

## 알려진 미해결 이슈

- `ensemble: null` — BTC 1D/4H에서 `ensemble_triggered: false`. API 정상 응답, snapshot 있음, 트리거 조건 미충족
- 서버 포트 좀비: 5173/5174 zombie. 실제 서버 5175에서 구동
