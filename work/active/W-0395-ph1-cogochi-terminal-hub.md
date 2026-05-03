# W-0395-Ph1 — /cogochi Terminal Hub: TRAIN + FLYWHEEL mode + WatchlistRail

> Wave: 6 | Priority: P0 | Effort: L
> Parent Issue: #955
> Status: 🟡 Design Draft
> Created: 2026-05-04

## Goal
사용자가 TRADE / TRAIN / FLYWHEEL 3 mode를 전환하며 패턴 연습 → verdict 루프를 60초 안에 완주할 수 있다.

## Owner
app

## Scope
- modePill (TRADE/TRAIN/FLYWHEEL) + workMode.store
- WatchlistRail (peek/WatchlistRail.svelte) — watch_hits 20건 SWR
- TRAIN mode: QuizStage (차트 1/3 마스킹 + UP/DOWN/SKIP + train_answers 테이블)
- FLYWHEEL mode: FlywheelStage (Layer C 진행률 + verdict 20건 + countdown)
- HoldTimeStrip: lib/components/shared/HoldTimeStrip.svelte (공용 컴포넌트 — D-0001 참조)
- GTM: workmode_switch / train_session_complete / rightpanel_tab_switch

## Non-Goals
- TRAIN 자동매매 연동 (AC10 위반)
- FLYWHEEL leaderboard (Frozen)

## CTO 관점
### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| train_answers migration 번호 충돌 | 중 | 중 | PR2 진입 전 `ls migrations/ \| tail -3` 확인 |
| WatchlistRail 모바일 미처리 | 중 | 중 | PR1에서 MobileShell PeekDrawer 분기 필수 |
| workMode URL param 미반영 | 저 | 저 | ?mode=train deep-link는 PR3 이후 |

### Decisions
- [D-0001] HoldTimeStrip = `lib/components/shared/HoldTimeStrip.svelte` (공용). Props: `{ p50: number|null, p90: number|null }`. 각 hub panel이 자체 데이터 계산 후 주입. hub-boundary ESLint는 cross-hub 금지지 components/shared 허용. 거절: 각 hub별 별도 구현 — DRY 심각.
- [D-0002] TRAIN 정답 라벨 = PatternOutcome verdict 누적치 (Layer C top-conf는 verdicts 50+ 후에만 유효, 현재 cold start 구간)

## PR 분해 계획

### PR 1 — WatchlistRail + modePill shell (Effort: M)
목적: WatchlistRail에서 watch 항목을 보고 modePill로 mode 선택 (TRAIN/FLYWHEEL disabled)
신규: `lib/hubs/terminal/peek/WatchlistRail.svelte`, `peek/ModePill.svelte`, `lib/hubs/terminal/workMode.store.ts`
수정: `lib/hubs/terminal/L1/TerminalShell.svelte` (ModePill + WatchlistRail 주입)
Exit Criteria:
- AC1: WatchlistRail 초기 렌더 ≤200ms (20행 fixture)
- AC2: workMode store localStorage 영속 (vitest)
- AC3: hub-boundary ESLint 0 violations
- AC4: svelte-check 0 / CI green

### PR 2 — TRAIN mode QuizStage (Effort: L)
신규: `panels/TrainStage.svelte`, `panels/QuizCard.svelte`, `routes/api/terminal/train/quiz/+server.ts`, `routes/api/terminal/train/answer/+server.ts`, migration 052_train_answers.sql
Exit Criteria:
- AC1: 10문제 세션 평균 응답 ≤8s
- AC2: 정답률 세션 종료 후 요약 카드 노출
- AC3: quiz API p50 ≤300ms

### PR 3 — GTM events (Effort: S)
신규: `lib/hubs/terminal/telemetry.ts`
이벤트: workmode_switch / train_session_complete / rightpanel_tab_switch (zod schema 필수)
Exit Criteria:
- AC1: 3 이벤트 vitest 6 케이스 PASS
- AC2: 0 PII (user_id 미포함)

### PR 4 — FLYWHEEL mode (Effort: L)
신규: `panels/FlywheelStage.svelte`, `panels/RetrainCountdown.svelte`, `routes/api/terminal/flywheel/status/+server.ts`
W-0400 Layer C 스케줄러 hook 재활용
Exit Criteria:
- AC1: status API p50 ≤400ms
- AC2: countdown drift ≤2s/min
- AC3: 3 mode 전환 ≤100ms (no remount)

### PR 5 — HoldTimeStrip StatusBar (Effort: S)
신규: `lib/components/shared/HoldTimeStrip.svelte` (공용), `lib/hubs/terminal/panels/TerminalHoldTimeStrip.svelte` (데이터 계산 후 공용 컴포넌트 주입)
수정: `StatusBar.svelte`
Exit Criteria:
- AC1: 0 watch 시 "—" 표시
- AC2: 색상 임계 vitest 3 케이스 (< 50% g4 / 50-80% amb / >80% neg)
- AC3: bundle delta ≤4KB

## Open Questions
- [ ] [Q-1] TRAIN 20문항 vs 10문항 — 세션 완주율 실측 후 PR2 머지 2주 후 결정

## Handoff Checklist
- [ ] PR1 WatchlistRail 모바일 MobileShell PeekDrawer 분기 확인
- [ ] PR2 migration 번호 충돌 없음 확인
- [ ] PR3 gtag wrapper dev/prod 분기
