# 세션 체크포인트 — 2026-04-26 worktree 정리 세션

## 완료된 것

### worktree 대규모 정리
- **Before**: 50개 (`.claude/` 46개 + `.codex/` 21개 + `/tmp/` 14개 + `.worktrees/` 5개)
- **After**: 5개 (`.claude/worktrees/` 기준)
- 방법: pre-W-0200 기준 모두 확인 → 전부 main에 이미 머지됨 → 삭제

### 남은 active worktrees
| worktree | 브랜치 | 상태 |
|---|---|---|
| `vibrant-tereshkova` | claude/vibrant-tereshkova | 현재 세션 |
| `funny-goldstine` | claude/funny-goldstine | PR #308 CI 진행중 |
| `gifted-shannon` | claude/gifted-shannon | ahead=0, 삭제 가능 |
| `w-0162-stability` | claude/w-0162-stability | ahead=0, 삭제 가능 |
| `w-0131-tablet-peek-drawer` | codex/w-0131 | ahead=0, 삭제 가능 |

### PR 현황
| PR | 내용 | 상태 |
|---|---|---|
| #308 | feat(W-0211): native multi-pane + Pine Script | App CI 재실행중 |
| #314 | chore(CURRENT.md): 세션 체크포인트 | CI 대기중 |
| #309 | docs: 설계문서 | 충돌 — #314로 대체 |

### PR #308 App CI 에러 (수정 완료)
1. `surfaceStyle="velo"` — TradeMode.svelte에서 제거 ✅
2. `{analysisData}` — CenterPanel.svelte에서 제거 ✅ (automation이 두 번 되돌렸음, 3번 수정)

## main SHA
`b942f346` — 2026-04-26

## 다음 실행

### P0 — W-0132 Copy Trading Phase 1
```bash
git checkout main && git pull
git checkout -b feat/w-0132-copy-trading-phase1
```
- Track A: migration 022 (`trader_profiles` + `copy_subscriptions`)
- Track B: `engine/copy_trading/leader_score.py` + `leaderboard.py` + API route
- Track C: `CopyTradingLeaderboard.svelte` + 3 API proxy routes

### P1 — W-0145 Search Corpus 40+차원
```bash
git checkout -b feat/w-0145-search-corpus-40dim
```
- `engine/search/corpus_builder.py` 40차원 확장
- OI/funding 2× 가중치
- recall@10 >= 0.7

### 인프라 미완 (사람)
- [ ] GCP worker Cloud Build trigger
- [ ] Vercel `EXCHANGE_ENCRYPTION_KEY`

## 참고 파일
- 설계: `work/active/W-next-design-20260426.md`
- PRD: `memory/project_copy_trading_prd_2026_04_22.md`
