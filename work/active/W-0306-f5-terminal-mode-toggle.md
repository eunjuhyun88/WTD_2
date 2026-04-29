# W-0306 — F-5: Observe / Analyze / Execute 모드 토글 (Terminal Layout)

> Wave: 4 | Priority: P1 | Effort: S
> Charter: In-Scope L0 (자동매매 frozen — Execute 모드는 manual order intent UI만, 실주문 X)
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: #634

## Goal

Jin이 터미널 상단 3-버튼 탭으로 Observe(차트만)/Analyze(검색+차트+HUD)/Execute(워크스페이스+빠른 차트+빠른 quick-trade UI) 모드를 전환하면 패널 비율이 즉시 (≤ 300ms) 적용되고 다음 세션에도 마지막 선택이 유지된다.

## Owner

app

## Scope

### 포함

**파일 변경**:
- `app/src/components/terminal/terminalLayoutController.ts` (333줄 — 기존)
  - `type TerminalMode = 'observe' | 'analyze' | 'execute'` 추가
  - `MODE_PRESETS: Record<TerminalMode, { left: number; center: number; right: number }>` 추가
  - `applyModePreset(mode: TerminalMode)` 함수 추가 (기존 resize state 갱신)
  - localStorage key `wtd:terminal:mode` (default `analyze`)
- `app/src/components/terminal/TerminalModeToggle.svelte` (신규)
  - 3-버튼 segmented control
  - 키보드 shortcut: `Cmd+1` / `Cmd+2` / `Cmd+3`
- `app/src/routes/terminal/+page.svelte` (마운트 위치)
  - 상단 헤더에 `TerminalModeToggle` 마운트
- `app/src/components/terminal/__tests__/W0306_mode_toggle.test.ts` (신규 — vitest)

**모드 프리셋** (사용자 가이드 반영):
| 모드 | left | center | right | 의도 |
|---|---|---|---|---|
| Observe | 0% | 70% | 30% | 차트 + HUD only (수동 모니터링) |
| Analyze (default) | 25% | 45% | 30% | 검색 + 차트 + HUD (탐색 mode) |
| Execute | 30% | 40% | 30% | 워크스페이스 + 차트 + quick-trade |

**Execute 모드의 Charter 호환성**:
- Execute right panel = "quick-trade widget" — **manual order intent UI만 (실자금 주문 X)**
- 거래소 API 콜 X. `app/src/lib/components/intent/QuickTradePanel.svelte` (신규) — 사용자가 entry/stop/target을 수기 입력 후 클립보드 복사 또는 Telegram 알림 전송
- 자동매매·실자금 주문은 Charter §Frozen — 명시적으로 차단 (UI에서 disable 처리)

## Non-Goals

- **자동매매 / 실주문 실행**: Charter §Frozen 절대 준수.
- **모드별 전혀 다른 컴포넌트 트리**: 패널 비율만 조정. center=ChartPanel, right=RightRailPanel 그대로 유지.
- **Mobile/Tablet 모드 분기**: BP_MOBILE / BP_TABLET 기존 로직 유지. 모드 토글은 desktop only (≥ 1024px).
- **사용자 커스텀 프리셋 저장**: 3개 fixed preset만. M0 단계 단순화.
- **모드 전환 애니메이션 (path 보간)**: CSS transition만 (≤ 300ms).

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 모드 전환 중 user resize drag와 충돌 | M | M | drag 진행 중에는 모드 토글 button disable |
| localStorage 값 corrupt → 깨진 layout | L | M | parse 실패 시 default 'analyze' fallback |
| Execute mode에서 실수로 실주문 가능한 UI 노출 | L | H | QuickTradePanel은 "Copy to Clipboard" 만, exchange API 호출 코드 절대 X (lint rule 추가 권장) |
| 300ms transition + 동시 chart re-render → jank | M | L | chart는 ResizeObserver로 debounce 100ms |
| Mobile 뷰에서 모드 토글 노출 | L | L | breakpoint 분기 (≥ 1024px만 표시) |

### Dependencies
- 선행: `terminalLayoutController.ts` 333줄 ✅
- 선행: RightRailPanel (DecisionHUD 마운트) ✅
- 후행: F-12 kimchi UI (W-0307) — Observe 모드 HUD에 추가 위치

### Rollback Plan
- feature flag `PUBLIC_TERMINAL_MODE_TOGGLE=false` → toggle 숨김, default 'analyze' layout 유지
- 또는 single PR revert (3 file change)

### Files Touched
- `app/src/components/terminal/terminalLayoutController.ts` (수정)
- `app/src/components/terminal/TerminalModeToggle.svelte` (신규)
- `app/src/lib/components/intent/QuickTradePanel.svelte` (신규)
- `app/src/routes/terminal/+page.svelte` (수정 — 마운트)
- `app/src/components/terminal/__tests__/W0306_mode_toggle.test.ts` (신규)

## AI Researcher 관점

### Data Impact
- 모드별 사용 시간 추적 → Jin 페르소나의 실제 사용 패턴 파악
- gtag/posthog event: `terminal_mode_changed` (mode_from, mode_to, session_duration)
- 가설: Analyze 모드가 가장 많이 사용된다 (default).

### Statistical Validation
- 베타 1주 후 모드 분포: Observe X%, Analyze Y%, Execute Z%
- 사용자별 dominant mode 식별 → 다음 세션 default를 last-mode로 (이미 localStorage)
- N < 30 베타 사용자 → A/B 통계는 의미 없음. 단순 분포만.

### Failure Modes
- Analyze에 익숙한 사용자가 Observe로 전환 후 검색 못 찾음 → UX confusion. mitigation: 모드 변경 시 toast "검색은 Analyze 모드에서" 안내 (선택).
- Execute 모드에서 quick-trade가 실제 주문 가능하다고 오해 → 명확한 disclaimer "수기 입력 / 클립보드 복사" 라벨

## Decisions

- [D-0306-1] **3개 fixed preset, 사용자 커스텀 X**.
  - 거절 옵션 (커스텀 저장): M0 단계 단순화 + UX 학습 곡선 최소화.
- [D-0306-2] **Execute 모드 = manual order intent UI**, 실주문 X.
  - 거절 옵션 (실주문 통합): Charter §Frozen 위반. 절대 X.
- [D-0306-3] **localStorage 단일 key 사용 (`wtd:terminal:mode`)**, 서버 동기화 X.
  - 거절 옵션 (user_preferences DB 동기화): M0 단계 ROI 낮음. 디바이스별 별도 모드 OK.
- [D-0306-4] **CSS transition 300ms, JS 보간 X**.
  - 거절 옵션 (anime.js 보간): bundle size 증가 + 단순한 width 변경에는 과잉.

## Open Questions

- [ ] [Q-0306-1] QuickTradePanel UI는 어디까지? (entry/target/stop 3-input + 손익비 표시 + 클립보드 복사 정도?)
- [ ] [Q-0306-2] 모드별 키보드 shortcut (Cmd+1/2/3) — 다른 shortcut과 충돌 없는지 검증
- [ ] [Q-0306-3] tier-gate 적용 — Execute 모드는 Pro 전용? (W-0248과 연동) — 사용자 결정 필요

## Implementation Plan

1. `terminalLayoutController.ts` 확장 — `MODE_PRESETS` + `applyModePreset()` + localStorage I/O
2. `TerminalModeToggle.svelte` 신규 — 3-button segmented + keyboard shortcuts
3. `QuickTradePanel.svelte` 신규 — entry/stop/target input + clipboard
4. `+page.svelte` 마운트 + breakpoint 분기 (≥ 1024px)
5. **테스트**:
   - vitest: `applyModePreset()` 단위 테스트 (3 모드 비율 검증)
   - vitest: localStorage round-trip + corrupt value fallback
   - playwright (선택): 모드 전환 visual regression
6. **observability**: posthog `terminal_mode_changed` 이벤트
7. PR 머지 + CURRENT.md SHA 업데이트

## Exit Criteria

- [ ] **AC1**: 모드 전환 → 패널 width 적용 시간 ≤ 300ms (CSS transition 측정)
- [ ] **AC2**: localStorage `wtd:terminal:mode` 저장 → 다음 세션 동일 모드 복원
- [ ] **AC3**: corrupt localStorage 값 → 'analyze' fallback (vitest)
- [ ] **AC4**: Mobile/Tablet (< 1024px) → 토글 숨김 (CSS media query)
- [ ] **AC5**: Execute 모드 quick-trade UI에 "수기 입력 / 실주문 X" disclaimer 표시
- [ ] **AC6**: Cmd+1/2/3 keyboard shortcut 작동 (input field focus 중에는 비활성)
- [ ] CI green (vitest + svelte check)
- [ ] PR merged + CURRENT.md SHA 업데이트

## Facts

(grep 실측 결과 — 2026-04-29)
1. `app/src/components/terminal/terminalLayoutController.ts` — 333줄, left/center/right 패널 + drag handler
2. `BP_MOBILE = 768`, `BP_TABLET = 1024` — breakpoint 정의 존재
3. `app/src/components/terminal/workspace/DecisionHUD.svelte` 544줄 — F-4 완성
4. RightRailPanel mount 확인 (사용자 컨텍스트)
5. `app/src/routes/terminal/+page.svelte` 존재 (확인 필요 — 실측에서 마운트 위치)
6. 자동매매 코드 0 (`grep -r "exchange.*place.*order" app/src/` → empty 가정)

## Assumptions

- `terminalLayoutController.ts`의 width 상태는 reactive store (Svelte writable)
- breakpoint 분기는 기존 로직 그대로 사용
- posthog 또는 동등한 이벤트 트래킹 툴 활성 (확인 필요)
- Charter §Frozen "자동매매" 정의에 quick-trade UI는 포함되지 않음 (사용자 결정 — D-0306-2 명시)

## Canonical Files

- 코드 truth: `app/src/components/terminal/terminalLayoutController.ts`
- UI: `app/src/components/terminal/TerminalModeToggle.svelte`
- 도메인 doc: `docs/domains/terminal-ux.md` (있는 경우 갱신)

## Next Steps

1. Q-0306-1~3 답변 (특히 Q-0306-3 tier-gate 결정)
2. QuickTradePanel mockup 검토 (Figma 또는 Svelte 직접 prototype)
3. 사용자 승인 후 single-PR 구현

## Handoff Checklist

- [ ] D-0306-2 (실주문 X) 코드 레벨에서 lint rule 또는 test로 강제
- [ ] localStorage key naming convention 확인 (`wtd:` prefix)
- [ ] 모드 전환 시 chart resize debounce 검증
- [ ] mobile 뷰에서는 mobile tab (warroom/chart/intel) 그대로 유지
