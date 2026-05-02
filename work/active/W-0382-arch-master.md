# W-0382 — App 5-Hub Module Architecture & Refactor

> Wave: 6 | Priority: P1 | Effort: L
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 Design Draft
> Created: 2026-05-02
> Issue: #879
> Sub-tickets: W-0382-A (트리 통합), W-0382-B (Monolithic Split), W-0382-C (Store 정리), W-0382-D (Legacy Route 정리)

---

## Goal

`/cogochi` · `/dashboard` · `/patterns` · `/lab` · `/settings` 각 Hub가 독립 모듈로 동작하고,
Bloomberg L1/L2/L3 tier가 디렉토리 구조에 1:1 반영되어, 에이전트가 Hub 경계를 벗어난 수정 없이
각 허브를 독립적으로 개발할 수 있게 만든다.

## Why Now

| 문제 | 비용 |
|---|---|
| `routes/terminal` ↔ `routes/cogochi` 이중 터미널 (2003 + 3233 LOC) | 기능 추가 시 두 곳 동시 수정, 동기화 오류 반복 |
| `lib/cogochi/` + `components/terminal/workspace/` 두 트리 (총 ~25k LOC) | import 경로 불일치, 에이전트가 컴포넌트 위치 추론 불가 |
| 38개 stores 중 14개 dead | bundle 크기 + 신규 에이전트 혼란 |
| `TradeMode.svelte` 3233줄 | 수정 = 전체 파일 컨텍스트 소비, PR diff 검토 불가 |

---

## Architecture Decisions

### D-1: 이중 터미널 통합 방향

**선택: `components/terminal/workspace/` 를 정식 구현으로 채택, `lib/cogochi/modes/TradeMode` 흡수**

이유:
- `components/terminal/workspace/` 가 실제 `/routes/terminal` 에서 라이브 운영 중
- 구조가 더 세분화되어 있음 (50+ 파일, 각 역할 분리)
- `lib/cogochi/` 의 AppShell/TabBar/WatchlistRail 등은 유지하되 `workspace/` 체계로 편입

거절 옵션:
- A: `lib/cogochi/` 골격 유지 → `workspace/` 이주: TradeMode 3233이 Shell 역할 수행하는 구조 유지 필요, 분리 비용 ↑
- B: 양쪽 유지: 사용자 5-Goal 위배, 이중화 영구화

### D-2: Hub 독립 강제 메커니즘

**선택: ESLint `no-restricted-imports` + CI gate**

```js
// .eslintrc 추가
"no-restricted-imports": ["error", {
  "patterns": [
    { "group": ["**/hubs/terminal/**"], "message": "terminal hub 직접 import 금지 — shared/ 경유" },
    // 각 hub별
  ]
}]
```

거절: 문서만 — 위반 누적 시 복구 비용 ↑

### D-3: 컴포넌트 분할 기준 (LOC 아님)

**선택: 단일 책임 + Props ≤8 + 독립 테스트 가능**

LOC는 결과 지표. 판단 기준:
1. "이 컴포넌트가 하는 일을 한 문장으로 설명 가능한가?" → NO면 분할
2. Props > 8개 → group object로 묶거나 분할
3. 격리 테스트 시 mock이 5개 이상 필요 → 책임 분리 필요

### D-4: Store 소유권 모델

**선택: 2-tier (hub-local + shared)**

- `lib/stores/shared/` — cross-hub: viewportTier, walletStore, douniRuntime, priceStore, notificationStore (5개 이하)
- `lib/hubs/{hub}/stores/` — hub 전용: 해당 hub만 사용
- Dead store (usage 0 확인 후) — 삭제

거절: 모두 shared → coupling 증가 / 모두 hub-local → priceStore 중복

### D-5: `routes/cogochi` vs `routes/terminal`

**선택: `/cogochi` 가 5-Hub 공식. `/terminal` 은 301 redirect → `/cogochi`**

이유: 5-Hub 정의(W-0372)에서 `/cogochi` 가 공식 터미널 허브로 확정.
단, 내부 구현 컴포넌트는 `components/terminal/workspace/` 를 정식으로 채택.

---

## Final Directory Structure (after W-0382 완료)

```
app/src/
├── routes/                          # SvelteKit pages (얇은 entry ≤100 LOC)
│   ├── +layout.svelte               # 전역 layout (유지)
│   ├── +page.svelte                 # → /cogochi redirect
│   ├── cogochi/+page.svelte         # TerminalHub entry (≤100 LOC)
│   ├── dashboard/+page.svelte       # DashboardHub entry
│   ├── patterns/+page.svelte        # PatternsHub entry
│   ├── lab/+page.svelte             # LabHub entry
│   ├── settings/+page.svelte        # SettingsHub entry
│   ├── api/                         # SvelteKit API routes (변경 없음)
│   ├── research/                    # deep-link 보존 (redirect to lab tabs)
│   ├── agent/, passport/, status/   # ops/auth (변경 없음)
│   ├── healthz/, readyz/            # infra (변경 없음)
│   └── _redirects/                  # terminal→cogochi, analyze→lab, scanner→patterns 등
│
└── lib/
    ├── hubs/                        # 5-Hub 독립 모듈
    │   ├── terminal/                # /cogochi 허브 (공식 터미널)
    │   │   ├── index.ts             # 단일 entry (named exports만)
    │   │   ├── TerminalHub.svelte   # Hub root shell
    │   │   ├── L1/                  # 항상 표시 (TopBar, StatusBar, ChartCore)
    │   │   │   ├── TerminalTopBar.svelte
    │   │   │   ├── TerminalStatusBar.svelte
    │   │   │   └── ChartCoreAdapter.svelte
    │   │   ├── panels/              # L2 주변부 (rail, dock)
    │   │   │   ├── WatchlistRail/   # 현 701 LOC → 분할
    │   │   │   │   ├── WatchlistRail.svelte     # shell (~150)
    │   │   │   │   ├── WatchlistRow.svelte      # 행 렌더 (~100)
    │   │   │   │   ├── WhaleAlertStrip.svelte   # 고래 알림 (~120)
    │   │   │   │   └── WatchlistFilters.svelte  # 필터 (~80)
    │   │   │   ├── AIAgentPanel/    # 현 AIPanel 803 + AIAgentPanel 628 통합
    │   │   │   │   ├── AIAgentPanel.svelte      # 5-tab shell (~200)
    │   │   │   │   ├── AIChatTab.svelte         # 채팅 스트림 (~250)
    │   │   │   │   ├── AIInsightTab.svelte      # 인사이트 (~200)
    │   │   │   │   ├── AIPromptComposer.svelte  # 입력 (~150)
    │   │   │   │   └── AIToolbar.svelte         # 도구 (~100)
    │   │   │   ├── TerminalLeftRail.svelte      # 현 workspace/ 그대로 이주
    │   │   │   ├── TerminalRightRail.svelte
    │   │   │   └── TerminalBottomDock.svelte
    │   │   ├── sheets/              # L3 on-demand (lazy-load)
    │   │   │   ├── IndicatorLibrary.svelte  # 현 두 곳 병합 → 단일
    │   │   │   ├── ModeSheet.svelte
    │   │   │   ├── AIParserModal.svelte
    │   │   │   ├── CommandPalette.svelte
    │   │   │   └── DrawingToolbar.svelte
    │   │   ├── workspace/           # 현 components/terminal/workspace/ 이주
    │   │   │   ├── ChartBoard/      # 현 2588 LOC → 분할 (W-0382-B)
    │   │   │   ├── ResearchPanel/   # 현 1051 LOC → 분할
    │   │   │   ├── MultiPaneChart.svelte
    │   │   │   └── ... (기타 workspace 파일)
    │   │   ├── peek/                # 현 components/terminal/peek/ 이주
    │   │   └── stores/              # hub-local stores
    │   │       ├── terminalState.ts
    │   │       ├── terminalMode.ts
    │   │       ├── terminalLayout.ts
    │   │       ├── chartSaveMode.ts
    │   │       ├── chartIndicators.ts
    │   │       ├── chartAIOverlay.ts
    │   │       └── chartFreshness.ts
    │   │
    │   ├── dashboard/
    │   │   ├── index.ts
    │   │   ├── DashboardHub.svelte
    │   │   ├── L1/                  # DashTopStrip, MoversHeader
    │   │   ├── panels/              # DashActivityGrid (이미 추출됨), DashRecentRuns
    │   │   ├── sheets/              # (없음 또는 미래 확장)
    │   │   └── stores/              # (없음 — 모두 서버 load)
    │   │
    │   ├── patterns/
    │   │   ├── index.ts
    │   │   ├── PatternsHub.svelte
    │   │   ├── L1/                  # PatternsSearchBar, PatternsModeToggle
    │   │   ├── panels/              # PatternsLibraryGrid, PatternsScanResults
    │   │   ├── sheets/              # PatternsDetailDrawer, PatternsFilterSheet
    │   │   └── stores/              # strategyStore (현재 여기 전용)
    │   │
    │   ├── lab/
    │   │   ├── index.ts
    │   │   ├── LabHub.svelte
    │   │   ├── L1/                  # LabRunHeader, LabStatusBar
    │   │   ├── panels/              # LabRunPicker, LabResultsPanel, LabComparePanel
    │   │   │   ├── research/        # 현 components/terminal/research/ 이주
    │   │   │   └── verdict/         # VerdictInboxPanel, JudgePanel 이주
    │   │   ├── sheets/              # LabExportSheet, LabDetailDrawer
    │   │   └── stores/              # (없음 — 서버 load 위주)
    │   │
    │   └── settings/
    │       ├── index.ts
    │       ├── SettingsHub.svelte
    │       └── sections/            # 현 706 LOC page → 섹션별 분리
    │           ├── ProfileSection.svelte
    │           ├── SubscriptionSection.svelte
    │           ├── NotificationsSection.svelte
    │           ├── AISection.svelte
    │           ├── ConnectorsSection.svelte
    │           └── SecuritySection.svelte
    │
    ├── shared/                      # Cross-hub 공용
    │   ├── chart/                   # 차트 원시 컴포넌트 (현 workspace/chart/ 이주)
    │   │   ├── ChartCanvas.svelte   # raw canvas
    │   │   ├── ChartPane.svelte
    │   │   ├── primitives/          # axis, candle, line, gridline
    │   │   └── overlays/            # AI overlay, drawing, annotation
    │   ├── panels/                  # Cross-hub 재사용 UI
    │   │   ├── StrategyCard.svelte
    │   │   ├── VerdictCard.svelte
    │   │   ├── VerdictBanner.svelte
    │   │   ├── DirectionBadge.svelte
    │   │   ├── KpiCard.svelte
    │   │   ├── peek/                # PeekDrawer, CenterPanel
    │   │   └── mobile/              # MobileFooter, MobileTopBar
    │   ├── primitives/              # Atom UI (Button, Chip, Modal — 현 surface-* 확장)
    │   └── stores/                  # Shared global stores (≤8개)
    │       ├── viewportTier.ts
    │       ├── walletStore.ts
    │       ├── douniRuntime.ts
    │       ├── priceStore.ts
    │       ├── whaleStore.ts
    │       ├── newsStore.ts
    │       └── crosshairBus.ts
    │
    ├── cogochi/                     # 이주 완료 후 삭제 (W-0382-A에서 처리)
    ├── components/terminal/         # 이주 완료 후 삭제 (W-0382-A에서 처리)
    └── stores/                      # 이주 완료 후 삭제 (W-0382-C에서 처리)
```

---

## Naming Conventions

| 항목 | 규칙 | 예시 |
|---|---|---|
| Hub shell | `{Hub}Hub.svelte` | `TerminalHub.svelte` |
| L1 컴포넌트 | `{Hub}{Role}.svelte` | `TerminalTopBar.svelte` |
| L2 panel (단일 파일) | `{Name}Panel.svelte` 또는 `{Name}Rail.svelte` | `AIAgentPanel.svelte` |
| L2 panel (폴더) | `{Name}/` + `{Name}.svelte` (index) | `WatchlistRail/WatchlistRail.svelte` |
| L3 sheet | `{Name}Sheet.svelte` 또는 `{Name}Modal.svelte` | `IndicatorLibrarySheet.svelte` |
| Hub store | camelCase, hub 이름 prefix 불필요 | `terminalState.ts` (hubs/terminal/stores/ 안에 있으니) |
| Shared store | 기능 명 | `priceStore.ts` |
| Hub entry | `index.ts` named exports | `export { TerminalHub } from './TerminalHub.svelte'` |

---

## Bloomberg L1/L2/L3 — 코드 매핑

| Tier | 정의 | 디렉토리 | 렌더 방식 | 예 |
|---|---|---|---|---|
| **L1** | 페이지 진입 즉시 표시. 항상 DOM에 존재 | `hubs/{h}/L1/` | SSR + 동기 | TopBar, ChartCore, StatusBar |
| **L2** | 주변부 패널. 기본 표시지만 collapse 가능 | `hubs/{h}/panels/` | CSR, 동기 | WatchlistRail, AIAgentPanel, BottomDock |
| **L3** | 사용자 액션으로만 표시 (modal/sheet/palette) | `hubs/{h}/sheets/` | `{#await import(...)}` lazy | IndicatorLibrary, ModeSheet, AIParserModal |

**L3 lazy-load 패턴:**
```svelte
{#if indicatorLibraryOpen}
  {#await import('./sheets/IndicatorLibrary.svelte') then { default: IndicatorLibrary }}
    <IndicatorLibrary on:close={() => indicatorLibraryOpen = false} />
  {/await}
{/if}
```

---

## Data Flow (케이스별)

| 데이터 종류 | 흐름 | 코드 위치 |
|---|---|---|
| 페이지 초기 데이터 | `+page.server.ts` load → props | `routes/{hub}/+page.server.ts` |
| 실시간 가격/tick | engine SSE → `shared/stores/priceStore` → hub subscribe | `lib/shared/stores/priceStore.ts` |
| 차트 데이터 | `+page.ts` load (client) → hub-local store → ChartBoard | `hubs/terminal/stores/` |
| AI 응답 스트림 | hub API → `hubs/terminal/panels/AIAgentPanel` local `$state` | 직접 props |
| Cross-hub 이벤트 | hub A → `shared/stores/crosshairBus` event → hub B | eventBus publish/subscribe |
| 사용자 입력 | local `$state` only, store에 저장 안 함 | 컴포넌트 내 |
| 인증/세션 | `shared/stores/walletStore` | 모든 hub |

---

## Component Boundary Rules

에이전트가 분할 여부를 판단할 때 사용하는 체크리스트:

```
1. "이 컴포넌트가 하는 일을 한 문장으로 말할 수 있나?" → NO → 분할
2. Props > 8개인가? → YES → group object 또는 분할
3. 격리 테스트 시 mock이 5개 이상 필요한가? → YES → 책임 분리 필요
4. 이 컴포넌트를 수정할 때 영향받는 다른 기능이 3개 이상인가? → YES → 분할 검토
```

예외: 차트 렌더링 코드처럼 순수 렌더링 로직만 있는 경우 단일 파일 500~700 LOC 허용.

---

## Sub-ticket 목록

| 티켓 | 작업 | 선행 조건 | 예상 파일 |
|---|---|---|---|
| **W-0382-A** | 디렉토리 구조 생성 + `lib/cogochi/` & `components/terminal/workspace,peek,shell/` 이주 | 없음 | ~120 |
| **W-0382-B** | Monolithic split (ChartBoard 2588 / TradeMode 3233 / ResearchPanel 1051 / WatchlistRail 701 / AIPanel+AIAgentPanel) | W-0382-A merged | ~60 |
| **W-0382-C** | Store 정리 (14개 dead 삭제, 24개 hub-local/shared 분류 이주) | W-0382-A merged | ~50 |
| **W-0382-D** | Legacy route 301 redirect + 6개 route 파일 정리 | W-0382-B, C merged | ~20 |

W-0382-A 완료 후 B/C 병렬 실행 가능.

---

## CTO Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 이주 중 import path 누락 → svelte-check 에러 | H | M | Phase A: codemod + tsc 자동 체크. 에러 0 확인 후 merge |
| ChartBoard 분할 중 차트 회귀 | M | H | Phase B 시작 전 Playwright baseline 스크린샷 5개 |
| dead store 판정 오류 (실제 사용 중인데 삭제) | M | H | Phase C: 삭제 전 grep 0 확인 필수, 불확실 시 KEEP |
| 이중 터미널 통합 중 `/cogochi` 기능 손실 | M | H | Phase A에서 redirect 먼저, 통합은 Phase B로 |
| ESLint rule 추가 후 기존 코드 대량 에러 | H | L | Phase D: rule은 warn으로 시작, 수정 후 error로 올리기 |

---

## AI Researcher 관점

### 데이터 무결성 체크포인트
- **차트 데이터**: `ChartBoard` 분할 후 `ChartCanvas` ↔ `ChartPane` 간 props 타입이 동일한지 TypeScript strict 확인
- **AI 스트림**: `AIAgentPanel` 단일화 후 기존 5-tab 상태가 보존되는지 storybook 또는 Playwright 확인
- **크로스헤어 sync**: `crosshairBus` multi-pane 동기화가 이주 후도 동작하는지 확인 (현재 `shared/stores/crosshairBus.ts`)

### 마이그레이션 안전성 순서
1. Phase A (이주) → svelte-check 0 errors 확인
2. Phase B (분할) → 분할 전 Playwright baseline → 분할 후 visual diff
3. Phase C (store) → 삭제 전 grep 확인 → 이주 후 runtime 확인
4. Phase D (route) → 301 redirect 브라우저 테스트

---

## Open Questions — 전부 확정 (2026-05-02)

- [x] [Q-1] `/terminal` → `/cogochi` 유지. 나중에 이름 변경 시 폴더명만 바꿈.
- [x] [Q-2] AIPanel 흡수 확정. `AIPanel.svelte` 삭제 → `AIChatTab.svelte` 로 통합. W-0382-B 반영 완료.
- [x] [Q-3] `CopyTradingLeaderboard` → `/patterns` 산하. 추후 social hub 생기면 이동.
- [x] [Q-4] `/research` → 301 redirect to `/lab?tab=research` (외부 링크 보존).

---

## Exit Criteria (전체 W-0382)

- [ ] AC1: `lib/cogochi/` 디렉토리 삭제 완료 (이주 후)
- [ ] AC2: `components/terminal/` 디렉토리 삭제 완료 (이주 후)
- [ ] AC3: `pnpm svelte-check` 0 errors (baseline: 0 errors, warning ≤95)
- [ ] AC4: `grep -rn "from.*lib/cogochi" app/src` → 0건
- [ ] AC5: `grep -rn "from.*components/terminal" app/src` → 0건
- [ ] AC6: `lib/stores/` 파일 수 ≤8 (shared only; hub-local은 `lib/hubs/*/stores/`)
- [ ] AC7: Hub 간 직접 import 0건 (ESLint rule pass)
- [ ] AC8: 모든 `routes/+page.svelte` ≤100 LOC
- [ ] AC9: Playwright e2e: cogochi 차트 로드 / patterns 검색 / lab 실행 / dashboard 로드 / settings 저장 — 5개 시나리오 PASS
- [ ] AC10: 6개 legacy route (terminal/analyze/scanner/verdict/strategies/benchmark) 301 확인 (`curl -I`)
- [ ] CI green (lint + typecheck + test)
- [ ] `work/active/CURRENT.md` main SHA 업데이트
