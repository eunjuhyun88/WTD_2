# W-0395-Ph6 — /lab Hub Shell + 6→3탭 + SendToTerminal

> Wave: 6 | Priority: P0 | Effort: L
> Parent Issue: #955
> Status: 🟡 Design Draft
> Created: 2026-05-04

## Goal
/lab가 5-Hub 표준 shell로 리팩토링되고, 백테스트 결과를 1클릭으로 cogochi Terminal에 전달한다.

## Owner
app

## Scope
- LabHub shell (L1 Desktop/Mobile/Tablet)
- 6탭 → 3탭 축소 (Build / Result / Trades)
- StrategyBuilder 좌측 collapsible fold
- HoldTimeStrip (lib/components/shared 재사용)
- SendToTerminal button → WatchlistRail candidate 등록

## Non-Goals
- lab 컴포넌트 파일 이동 (components/lab/ 유지) — PR1은 구조만
- 자동 실행 (AC10)

## CTO 관점
### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| PR1 시각 회귀 | 중 | 고 | Playwright snapshot 머지 전 캡처 필수 |
| PR2 6탭 URL deep-link 깨짐 | 중 | 중 | redirect map vitest 6 케이스 |
| W-0382-B 충돌 | 중 | 고 | CURRENT.md 락 테이블 선확인 |

### Decisions
- [D-0003] PR1에서 components/lab/ 파일 이동 안 함. LabHub.svelte가 $lib/components/lab/* import. 이동은 별도 cleanup PR.
- [D-0004] 6탭→3탭 축소 전 1주 telemetry 수집 필수 (PR1 머지 후 대기)

## PR 분해 계획

### PR 1 — LabShell 구조 리팩토링 (Effort: L, 시각 변화 0)
신규: `lib/hubs/lab/LabHub.svelte`, `lib/hubs/lab/L1/DesktopShell.svelte`, `lib/hubs/lab/L1/MobileShell.svelte`, `lib/hubs/lab/L1/TabletShell.svelte`
수정: `lib/hubs/lab/index.ts` (TBD 제거 → LabHub export), `routes/lab/+page.svelte` (80줄 → 3줄)
Exit Criteria:
- AC1: Playwright snapshot 회귀 0건 (6탭 비교)
- AC2: hub-boundary ESLint 0 violations
- AC3: svelte-check 0

### PR 2 — 6탭→3탭 + StrategyBuilder fold (Effort: M, PR1 후 1주 대기)
신규: `lib/hubs/lab/panels/LeftFold.svelte`
3탭: Build(=strategy+chart) / Result(=result+order+equity) / Trades(=trades+refinement+pattern-run accordion)
기존 6탭 URL redirect map 유지 (?tab=order → ?tab=build)
Exit Criteria:
- AC1: 3탭 전환 ≤80ms
- AC2: 6탭 URL redirect vitest 6 케이스
- AC3: LeftFold collapsed 상태 localStorage 영속

### PR 3 — HoldTimeStrip ResultPanel 상단 (Effort: S)
신규: `lib/hubs/lab/panels/LabHoldTimeAdapter.svelte` (백테스트 결과 → HoldTimeStrip props 변환)
공용: `lib/components/shared/HoldTimeStrip.svelte` (Ph1 PR5에서 생성, 재사용)
Exit Criteria:
- AC1: 0 trade 시 "—" no error
- AC2: mount ≤50ms

### PR 4 — SendToTerminal + cogochi 연결 (Effort: M, Ph1 PR1 WatchlistRail 선행 필수)
신규: `lib/hubs/lab/panels/SendToTerminalButton.svelte`, `routes/api/lab/send-to-terminal/+server.ts`, migration 053_terminal_candidates.sql
Exit Criteria:
- AC1: 클릭 → cogochi WatchlistRail candidate 노출 ≤500ms
- AC2: 중복 send dedup (1건)

## Open Questions
- [ ] [Q-2] PR2 1주 telemetry 기준 tab 사용률 threshold (현재 가정: order/refinement < 10%)

## Handoff Checklist
- [ ] W-0382-B 충돌 없음 확인 (CURRENT.md 락 테이블)
- [ ] PR4는 Ph1 PR1 WatchlistRail merge 후 시작
