# W-0374 Phase D-7 — AIAgentPanel 5탭 완성 + DrawerSlide + aiQueryRouter

> Wave: 5 | Priority: P1 | Effort: M (2일, D-4~D-7 단일 PR)
> Parent: W-0374-cogochi-bloomberg-ux-restructure.md
> Issue: #864
> PR: #865 (claude/elastic-chebyshev-88173a) — OPEN
> Status: 🟠 PR Review
> Created: 2026-05-02

## Goal

AIAgentPanel을 완성된 Bloomberg 우측 패널로 만들기 — 5탭 (DEC/PAT/VER/RES/JDG), ⌘L AI Search, DrawerSlide 카드 확장, aiQueryRouter 자연어→typed action 17-rule.

## 실제 구현 파일 (PR #865 기준)

```
app/src/lib/cogochi/
  AIAgentPanel.svelte          (수정 — 5탭 + ⌘L AI Search + DrawerSlide 배선)
  AppShell.svelte              (수정 — ⌘L 핸들러)
  aiQueryRouter.ts             (신규 — 17-rule router)
  aiQueryRouter.test.ts        (신규 — 21 test cases)
  shell.store.ts               (수정 — RightPanelTab 새 이름 + Timeframe/ChartActiveMode/DrawingTool 타입)
  components/
    DrawerSlide.svelte         (신규 — 320px/480px, Esc/backdrop close)
    IndicatorLibrary.svelte    (신규, D-4 — TV-style 70+ indicator)
  modes/
    TradeMode.svelte           (수정 — drawerTab 타입 업데이트)
app/src/components/terminal/workspace/
  ChartBoard.svelte            (수정 — handleAddIndicator + drag-to-save + setDrawingTool)
  ChartBoardHeader.svelte      (수정 — indicator button 배선)
  ChartToolbar.svelte          (수정 — drawingMode 상태 표시)
app/src/components/terminal/chart/overlay/
  RangeModeToast.svelte        (수정 — 4-action 토스트)
```

## Non-Goals

- Copy trading, leaderboard (Frozen)
- AI 자동매매 / 신규 메모리 stack (Frozen)
- D-8 이후 (PatternLibraryPanel, ScreenerPanel, VerdictInboxPanel) — 별도 Phase
- Supabase `ai_search_queries` 테이블 — D-7에서 미구현, D-8에서 추가

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| R1: shell.store `SHELL_KEY` v10 bump → 기존 localStorage 무효화 | 확정 | 낮 | 베타 기간, 사용자 설정 초기화 허용 |
| R2: aiQueryRouter fallback — 미매칭 query → `analyze` action (길이 > 3) | 중 | 낮 | 의도적 설계, 사용자 혼란 최소화 |
| R3: DrawerSlide backdrop click close — 실수 닫힘 | 중 | 낮 | Esc + backdrop 모두 close, 재열기 쉬움 |
| R4: RightPanelTab 타입 변경(`analyze`→`verdict`, `scan`→`research`) → 기존 코드 TS 에러 | 중 | 중 | TradeMode.svelte 수정 완료, AppShell 포함 확인 필요 |

### shell.store 변경 요약

```typescript
// 변경 전 (v4)
export type RightPanelTab = 'decision' | 'analyze' | 'scan' | 'judge' | 'pattern';
// 변경 후 (v10, D-7)
export type RightPanelTab = 'decision' | 'pattern' | 'verdict' | 'research' | 'judge';

// 신규 타입
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';
export type ChartActiveMode = 'idle' | 'drawing' | 'save-range';
export type DrawingTool = 'cursor' | 'trendLine' | 'horizontalLine' | 'verticalLine'
                        | 'extendedLine' | 'rectangle' | 'fibRetracement' | 'textLabel';
```

### Rollback

- PR revert → shell.store v10→v4 (localStorage 자동 초기화)

## AI Researcher 관점

### aiQueryRouter 17-rule 구조

```typescript
export type AIQueryAction =
  | { type: 'add-indicator'; indicatorId: string }
  | { type: 'set-timeframe'; tf: string }
  | { type: 'pattern-recall' }
  | { type: 'set-tab'; tab: RightPanelTab }
  | { type: 'ai-overlay'; overlayType: 'price-line' | 'range-box'; label: string }
  | { type: 'analyze' }
  | { type: 'toggle-drawing' }
  | { type: 'open-whale-data' }
  | { type: 'save-setup' };
```

**Rule 분류** (우선순위 순):
1. TF 변경 (`1h로 바꿔`, `change to 4h`)
2. OI indicator (`oi`, `open interest`)
3. RSI, Funding Rate, MACD indicator
4. 패턴 찾기 (`비슷한 패턴`, `find similar pattern`)
5. AI overlay — 저항/지지 가격선
6. 고래 데이터 (`whale`, `고래`)
7. 분석 요청 (`지금 롱 들어가`, `should I long`)
8. 탭 전환 5개 (decision/verdict/pattern/research/judge)
9. 드로잉 모드 (`그리기`, `drawing mode`)
10. 저장 (`세팅 저장`, `save setup`)

**Fallback**: 미매칭 + query.length > 3 → `{ type: 'analyze' }` (UX 무중단)

### Data Impact

- 현재 구현: query telemetry 미포함 (D-8에서 추가 예정)
- D-8 계획: `ai_search_queries` Supabase 테이블 + fire-and-forget insert

### Statistical Validation

- aiQueryRouter.test.ts: 21 test cases (실측)
- 목표: 21/21 pass CI

## Decisions

- **[D-1]** 탭 레이블: **DEC/PAT/VER/RES/JDG** (3자)
  - 설계 초안의 풀네임 제안을 elastic-chebyshev가 3자로 구현 — 우측 패널 너비상 합리적

- **[D-2]** PR: **단일 PR** D-4~D-7 통합 (#865)
  - 설계 초안의 2-PR 분리 제안 대비: D-4+D-6 단독 PR이 의미 없을 만큼 D-7이 shell.store 타입 의존

- **[D-3]** AI Search 트리거: **⌘L** (AppShell 핸들러)
  - `/` 슬래시 설계 대비: ⌘L이 명시적 의도 구분에 유리, input focus 충돌 없음

- **[D-4]** Query telemetry: **D-8으로 이연** (D-7에서 미구현)

- **[D-5]** Effort: **2일** (단일 PR, D-4~D-7 포함)

## Open Questions

- [ ] [Q-1] `RightPanelTab` 타입 변경(`analyze`→`verdict`, `scan`→`research`)으로 영향받는 파일 전수 확인 — TradeMode 외에 누락 없는지
- [ ] [Q-2] DrawerSlide 모바일(< 768px) 처리 — full-width? 현재 미정의
- [ ] [Q-3] D-8 `ai_search_queries` migration 번호 선점 필요

## Exit Criteria (PR #865)

- [ ] **AC-1**: AIAgentPanel 탭 5개 DEC/PAT/VER/RES/JDG 렌더링
- [ ] **AC-2**: DrawerSlide Esc + backdrop click 닫힘
- [ ] **AC-3**: aiQueryRouter 21-case vitest 21/21 pass
- [ ] **AC-4**: ⌘L → AI Search 활성화
- [ ] **AC-5**: RightPanelTab 타입 변경 후 svelte-check 0 errors
- [ ] **AC-6**: CI green, PR merged, CURRENT.md main SHA 업데이트
