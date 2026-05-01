# W-0372 — IA Consolidation: 전체 페이지 통합 + 네비 재설계 + Terminal 이식

> Wave: 5 | Priority: P1 | Effort: L (4 phases, 14-18일)
> Charter: §In-Scope (UI/UX 통합은 Frozen 아님)
> Status: 🟡 Phase C PR #830 open — Phase D (★★★ Terminal 이식) 대기
> Created: 2026-05-01
> Issue: #825

---

## Goal

`/cogochi` AppShell을 핵심 작업공간으로 확정하고, `/terminal`(2003줄)의 핵심 차트·결정 컴포넌트들을 이식한다.
15개 라우트 / 7개 nav 항목을 5-Hub 구조로 통합한다 (desktop + mobile 전면 개편).
**삭제 없이 — 기능은 살리고, 라우트는 redirect로 통합**.

핵심 한 줄: `/cogochi`가 껍데기, `/terminal`이 내장 → 내장을 꺼내서 껍데기에 이식.

---

## 현황 진단 (실측)

### 라우트 × 상태 매트릭스

| 라우트 | Lines | Nav | 상태 | 핵심 기능 |
|---|---|---|---|---|
| `/cogochi` | 466 (AppShell) | ✅ "Terminal" 라벨 | **핵심 껍데기** | WatchlistRail + TabBar + AIPanel + CommandBar + TradeMode/TrainMode + Splitter |
| `/terminal` | 2003 | ❌ Hidden | **컴포넌트 소스 보존** → 301 redirect | DecisionHUD + SplitPaneLayout + MultiPaneChart + PatternLibraryPanel + VerdictInboxPanel + JudgePanel + ScanGrid + NewsFlashBar + ResearchPanel + WhaleWatchCard + PineScriptGenerator + DrawingCanvas/Toolbar + F60GateBar |
| `/dashboard` | 1061 | ✅ Home 재목적 ✅ | 풀빌드 | 지갑 + Passport 요약 + WATCHING captures + KimchiPremiumBadge + OpportunityScore |
| `/lab` | 751 | ✅ | 풀빌드 | StrategyBuilder + Backtest + LabChart + RefinementPanel + PatternRunPanel |
| `/settings` | 655 | ✅ | 풀빌드 | 사용자 설정 전체 |
| `/patterns` | 612 | ✅ | 풀빌드 | 52 PatternObjects + `[slug]/lifecycle/search` |
| `/analyze` | 566 | ❌ → `/lab/analyze` redirect ✅ | 풀빌드 | 텍스트 → Groq/Gemini/Cerebras 병렬 LLM building block 추출 |
| `/passport` | 294 | ❌ → `/settings/passport` redirect ✅ | 풀빌드 | 사용자 ID/Level/LP/Tier/Track Record |
| `/verdict` | 243 | ❌ | 풀빌드, 변경 없음 | Telegram 딥링크 전용 판정 폼 (`?token=`) |
| `/benchmark` | 241 | ❌ → `/patterns/benchmark` redirect ✅ | 풀빌드 | 패턴 equity curve 비교 (BTC 대비) |
| `/strategies` | 202 | ❌ → `/patterns/strategies` redirect ✅ | 풀빌드 | PatternStrategyCard 그리드 (52 패턴 백테스트) |
| `/status` | 152 | ❌ → `/settings/status` redirect ✅ | 풀빌드 | 시스템 상태 |
| `/market` | — | — | **삭제 완료** ✅ | — |
| `/agent` | 7 | — | redirect→/lab (유지) | — |
| `/scanner` | — | — | redirect→/cogochi (유지) | — |

### Nav 모순 (초기 진단)

| 문제 | 건수 | 해결 상태 |
|---|---|---|
| Nav 클릭 → 빈페이지 또는 강제 redirect (dead-click) | 2건 (`/agent`→lab, `/market`→빈페이지) | ✅ Phase A에서 해결 |
| 풀빌드인데 Nav에서 도달 불가 | 6건 (`/terminal`, `/settings`, `/passport`, `/analyze`, `/benchmark`, `/status`) | ✅ Phase B에서 해결 (hub tabs) |
| Nav 라벨 "Terminal" 클릭 → 부분빌드 `/cogochi` | 1건 | 🟡 Phase D에서 해결 (이식 완료 후) |

---

## 5-Hub 구조 (확정)

### Hub 1 — **Home** (`/dashboard` 재목적) ✅
앱 진입점, "내 현황" 한눈에.

```
/dashboard (재목적 완료)
├── home-profile-strip (지갑 연결 상태 + address + balance + Tier badge + Win% + LP + Streak)
├── WATCHING 섹션 (active captures)
└── 빠른 stats (KimchiPremium / OpportunityScore / 최근 시그널)
```

### Hub 2 — **Terminal** (`/cogochi` AppShell 강화) 🟡

```
/cogochi (현재: 466줄 AppShell — Phase D에서 이식 후 ~900줄 예상)
[fold ▶] WatchlistRail        TabBar [+]      AIPanel [▼]
  BTC ─── $xxx  +1.2%  ███     ─────────────   ┌─────────────┐
  ETH ─── $xxx  -0.3%  ▄▄▄                     │ DecisionHUD  │ ← Phase D
  [+심볼 추가] [×삭제]         WorkspaceStage  │ (panelAdapter│
  ─────────                    (MultiPaneChart) │  기반 VM)   │
  내 패턴 (PatternLibraryPanel ← Phase D)      └─────────────┘
                                                VerdictInbox
                                                (Phase D)
                               StatusBar
```

#### 이식 우선순위 매트릭스

| 컴포넌트 | 출처 경로 | Lines | 이식 위치 | 의존성 | 우선순위 | Phase |
|---|---|---|---|---|---|---|
| `DecisionHUD` | `lib/terminal/panelAdapter` + `components/terminal/workspace/DecisionHUD.svelte` | 544L | AppShell AIPanel 우측 / 'decide' mode | `panelAdapter.PanelViewModel`, `TerminalDecisionBundle` | ★★★ | D |
| `MultiPaneChart` | `components/terminal/workspace/MultiPaneChart.svelte` | 548L | WorkspaceStage ChartSvg 교체 | `lightweight-charts`, `$lib/chart/paneIndicators`, `terminalBackend` | ★★★ | D |
| `PatternLibraryPanel` | `components/terminal/workspace/PatternLibraryPanel.svelte` | 100L | LibrarySection.svelte 교체 | `PatternCaptureRecord` from `terminalPersistence` | ★★★ | D |
| `VerdictInboxPanel` | `components/terminal/peek/VerdictInboxPanel.svelte` | 601L | VerdictsSection.svelte 강화 | watch-hit API, `PatternCaptureRecord` | ★★★ | D |
| `NewsFlashBar` | `components/terminal/workspace/NewsFlashBar.svelte` | — | CommandBar 상단 | 독립 (props만) | ★★ | D |
| `JudgePanel` | `components/terminal/peek/JudgePanel.svelte` | — | TradeMode 내부 | 독립 | ★★ | D |
| `ScanGrid` | `components/terminal/peek/ScanGrid.svelte` | — | 새 ScanMode 탭 | 독립 | ★★ | D |
| `ResearchPanel` | `components/terminal/workspace/ResearchPanel.svelte` | — | AIPanel 강화 | 독립 | ★★ | D |
| `DrawingCanvas` / `DrawingToolbar` | `components/terminal/workspace/Drawing*.svelte` | — | WorkspaceStage | lightweight-charts overlay | ★ | 후속 |
| `WhaleWatchCard` | `components/terminal/workspace/WhaleWatchCard.svelte` | — | WatchlistRail 하단 | 독립 | ★ | 후속 |
| `PineScriptGenerator` | `components/terminal/workspace/PineScriptGenerator.svelte` | — | Lab hub PineScript 탭 | 독립 | ★ | D |
| `F60GateBar` | `components/terminal/workspace/F60GateBar.svelte` | — | StatusBar 통합 | 독립 | ★ | 후속 |

### Hub 3 — **Patterns** (`/patterns` + 탭) ✅

```
/patterns/+layout.svelte (탭 완료)
├── Library     ← 기존 /patterns
├── Strategies  ← /strategies → /patterns/strategies ✅
├── Benchmark   ← /benchmark → /patterns/benchmark ✅
├── Lifecycle   ← /patterns/lifecycle (기존)
└── Search      ← /patterns/search (기존)
```

### Hub 4 — **Lab** (`/lab` + 탭) ✅

```
/lab/+layout.svelte (탭 완료)
├── Backtest      ← 기존 /lab
├── AI Analysis   ← /analyze → /lab/analyze ✅
└── PineScript    ← Phase D: PineScriptGenerator 이식
```

### Hub 5 — **Settings** (`/settings` + 탭) ✅

```
/settings/+layout.svelte (탭 완료)
├── Settings    ← 기존 /settings
├── Passport    ← /passport → /settings/passport ✅
└── Status      ← /status → /settings/status ✅
```

---

## Before / After

### Desktop AppNavRail

**Before (7개, dead-click 2건):**
```
[Terminal→/cogochi] [Dashboard] [Lab] [Patterns] [Strategies] [Agent🚨] [Market🚨]
```

**After (5개, dead-click 0건) ✅:**
```
[Home]      → /dashboard
[Terminal]  → /cogochi
[Patterns]  → /patterns (5탭)
[Lab]       → /lab (3탭)
[Settings]  → /settings (3탭)
```

### Mobile Bottom Nav ✅

```
[Home] [Terminal] [Patterns] [Lab] [Settings]
```

---

## Scope

### 포함
- `AppNavRail.svelte` 7→5 항목 ✅
- `MobileBottomNav.svelte` 전면 개편 ✅
- `/dashboard` 재목적 (지갑 + Passport 요약 + WATCHING) ✅
- `routes/patterns/+layout.svelte` 탭 ✅
- `routes/lab/+layout.svelte` 탭 ✅
- `routes/settings/+layout.svelte` 탭 ✅
- 5개 redirect 301 ✅
- WatchlistRail fold 토글 + add/delete + localStorage ✅
- `/market` 삭제 ✅
- `/terminal` → `/cogochi` 301 redirect ✅
- `/cogochi` AppShell에 ★★★ 4개 이식 (Phase D)
- `/cogochi` AppShell에 ★★ 4개 이식 (Phase D)
- Lab hub PineScript 탭 + PineScriptGenerator 이식 (Phase D)
- Supabase migration 041: `user_watchlist` 테이블 (Phase D)
- Mobile WatchlistRail drawer (Phase D)

### 제외 (Non-Goals)
- 페이지 내부 상세 디자인 변경 (컴포넌트 이식은 포함, CSS 리디자인은 제외)
- `/verdict` 변경 (Telegram 딥링크 전용 유지)
- WatchlistRail add/delete 이외의 신규 기능
- `/terminal` 라우트 코드 삭제 (컴포넌트 소스 보존)
- Charter Frozen 영역 (copy_trading, leaderboard, AI 차트분석, 자동매매)
- Drawing tools (DrawingCanvas/Toolbar) — Phase D 이후

### Files Touched (실측)

```
✅ 완료:
  app/src/components/layout/AppNavRail.svelte          (7→5)
  app/src/components/layout/MobileBottomNav.svelte     (전면 개편)
  app/src/routes/dashboard/+page.svelte                (Home profile strip 추가)
  app/src/routes/dashboard/+page.server.ts             (passport summary fetch)
  app/src/routes/patterns/+layout.svelte               (신규 탭 layout)
  app/src/routes/lab/+layout.svelte                    (신규 탭 layout)
  app/src/routes/settings/+layout.svelte               (신규 탭 layout)
  app/src/routes/patterns/strategies/+page.svelte      (이동)
  app/src/routes/patterns/benchmark/+page.svelte       (이동)
  app/src/routes/lab/analyze/+page.svelte              (이동)
  app/src/routes/settings/passport/+page.svelte        (이동)
  app/src/routes/settings/status/+page.svelte          (이동)
  app/src/routes/strategies/+page.ts                   (redirect 301)
  app/src/routes/benchmark/+page.ts                    (redirect 301)
  app/src/routes/analyze/+page.ts                      (redirect 301)
  app/src/routes/passport/+page.ts                     (redirect 301)
  app/src/routes/status/+page.ts                       (redirect 301)
  app/src/lib/cogochi/WatchlistRail.svelte             (fold+add/delete+localStorage)
  app/src/routes/terminal/+page.ts                     (307→301 redirect)
  app/src/routes/market/+page.svelte                   (삭제)

🟡 Phase D 예정:
  app/src/lib/cogochi/AppShell.svelte                  (DecisionHUD 연결 + 'decide' mode 추가)
  app/src/lib/cogochi/shell.store.ts                   (ShellWorkMode 확장: 'decide' 추가, decisionBundle state)
  app/src/lib/cogochi/WorkspaceStage.svelte            (ChartSvg → MultiPaneChart 교체)
  app/src/lib/cogochi/sections/LibrarySection.svelte   (PatternLibraryPanel 교체)
  app/src/lib/cogochi/sections/VerdictsSection.svelte  (VerdictInboxPanel 교체)
  app/src/lib/cogochi/modes/TradeMode.svelte           (JudgePanel 통합)
  app/src/routes/lab/+layout.svelte                    (PineScript 탭 추가)
  app/src/routes/lab/pinescript/+page.svelte           (신규)
  app/supabase/migrations/041_user_watchlist.sql       (신규)
```

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `DecisionHUD`의 `panelAdapter` 의존성 — `PanelViewModel` 빌더가 AppShell 컨텍스트에서 데이터 없을 때 | 중 | 중 | `shell.store.ts`에 `decisionBundle: TerminalDecisionBundle \| null` 추가. null이면 HUD placeholder 렌더 |
| `MultiPaneChart`의 `lightweight-charts` 의존성 — WorkspaceStage 기존 `ChartSvg`와 병행 기간 | 중 | 중 | WorkspaceStage에 `useMultiPane: boolean` prop 추가 → Phase D 완료 전까지 feature flag로 운영 |
| `VerdictInboxPanel`(601L) 이식 시 watch-hit API endpoint 재배선 필요 | 중 | 중 | props로 API URL 주입 (현재 하드코딩 확인 필요). cogochi의 기존 `/api/captures` 재사용 |
| WatchlistRail localStorage → Supabase 마이그레이션 중 기존 저장 데이터 손실 | 중 | 낮음 | 마이그레이션 로직: localStorage 읽기 → Supabase INSERT → localStorage 클리어 (원자적) |
| migration 041 번호 선점 가능성 (PR 머지 타이밍 충돌) | 낮음 | 중 | PR 머지 직전 `ls app/supabase/migrations/` 재확인 |
| Mobile WatchlistRail — rail 형태 그대로는 모바일 UX 불량 | 높음 | 중 | 모바일에서는 SymbolPickerSheet (bottom drawer)로 분기, rail 자체는 `hidden md:flex` |
| `PatternLibraryPanel` 이식 후 `LibrarySection` 제거 시 기존 데이터 바인딩 누락 | 낮음 | 중 | LibrarySection 일단 유지 (dead code), PatternLibraryPanel 검증 후 1주 후 제거 |

### Dependencies
- W-0369 ✅ (`/strategies`, `/benchmark` 머지됨, PR #818)
- W-0307/W-0308 ✅ (lifecycle UI 머지됨)
- W-0373 (wallet auth activation) — `/dashboard` Home profile strip 지갑 연결 상태와 관련, 독립 진행 가능
- W-0304 (per-pane indicator) — MultiPaneChart 이식과 `paneIndicators` 공유, 순서 조율 필요
- W-0341 (hypothesis registry) — 독립

### Rollback
- Phase A/B/C: 각각 atomic PR, 개별 revert 가능
- Phase D: 컴포넌트 이식은 각 컴포넌트 단위로 PR 분할 (DecisionHUD 1PR + MultiPaneChart 1PR + …) 또는 1개 통합 PR
- MultiPaneChart: `useMultiPane` feature flag로 ChartSvg 병행 → 문제 발생 시 flag OFF

---

## AI Researcher 관점

### Data Impact
- DecisionHUD 노출 빈도 증가 → decision ledger 증가 예상 (결정 데이터 품질 향상)
- PatternLibraryPanel cogochi 내장 → 패턴 검색 클릭률 증가 예상
- WatchlistRail 사용자 커스터마이징 → 평균 심볼 수 7→12개 예상, 관찰 빈도 증가
- `/dashboard` Home → 첫 진입 retention 개선 예상 (지갑 연결율 지표 측정 가능)

### 분석 메트릭
- Nav 클릭 → 유효 페이지 도달률: 전 71% → **100% (AC2)**
- 풀빌드 페이지 hub 2hop 도달률: 전 60% → **100% (AC3)**
- DecisionHUD 결정 완료율 (결정 생성 / 진입): baseline 측정 후 ≥ 30% 목표
- WatchlistRail add/delete 성공률: **100%** (Supabase write)
- 평균 세션 시간 (Terminal hub): Phase D 후 측정, baseline 대비 ≥ 20% 증가 목표

### Failure Modes
- 사용자가 "Strategies"를 못 찾음 → Patterns hub hover 시 sub-label "Library · Strategies · Benchmark"
- DecisionHUD 너무 넓음 → fold 가능 토글 + 모바일 숨김
- WatchlistRail Supabase write 실패 → localStorage 폴백 (offline-first)
- MultiPaneChart 이식 후 차트 깜빡임 → ChartSvg 병행 유지 1주 후 전환

### Validation
- Phase A 후: `/market` `/agent` 직접 hit 0건 (서버 로그, 1주)
- Phase B 후: hub tab 전환 오류율 0%
- Phase C 후: redirect 301 hit 통계 (옛 URL 사용량 측정)
- Phase D 후: DecisionHUD 세션 내 사용 건수 baseline

---

## Decisions

- **[D-0372-1]** `/cogochi` AppShell을 핵심으로, `/terminal` 컴포넌트 이식
  - 거절: `/terminal`을 핵심으로 — AppShell 인프라(WatchlistRail/TabBar/AIPanel/Modes) 유지가 효율적
  - 거절: 두 페이지 모두 Nav 노출 — mental model 분열
- **[D-0372-2]** 삭제 대신 redirect 원칙 (예외: `/market`만 삭제)
  - 거절: 즉시 삭제 — 외부 링크 깨짐 + 컴포넌트 소스 보존 가치
- **[D-0372-3]** 5-Hub 구조 (Home / Terminal / Patterns / Lab / Settings)
  - 거절: 7-tab 유지 — 빈페이지 2건 + 발견 불가 6건 미해결
- **[D-0372-4]** `/dashboard` 재목적: Home (지갑 + Passport 요약 + WATCHING)
  - 거절: `/signals`로 대체 — 이미 풀빌드(1061L) 컴포넌트 손실
- **[D-0372-5]** `/analyze` → Lab hub "AI Analysis" 탭
  - 거절: Terminal 흡수 — 텍스트 LLM 분석은 차트 작업과 다른 맥락
- **[D-0372-6]** Mobile bottom nav 전면 개편 (5-hub 정합)
  - 거절: 4 hub + More — 5칸에 5 hub 맞아 떨어짐
- **[D-0372-7]** 4 Phase 분할 머지 (A/B/C/D)
  - 거절: 한방 PR — 14-18일 작업, conflict 위험 지수적
- **[D-0372-8]** WatchlistRail localStorage 먼저 (Phase C), Supabase Phase D
  - 거절: Supabase 즉시 — Phase C 범위 확장, migration 추가 필요
- **[D-0372-9]** DecisionHUD에 `panelAdapter.buildTerminalDecisionBundle()` 연결 방식
  - 선택: shell.store에 `decisionBundle` state 추가 → AppShell이 분석 완료 시 dispatch → HUD reactive
  - 거절: 직접 props 드릴링 — AppShell 깊이가 깊어서 prop 전달 복잡도 큼
- **[D-0372-10]** MultiPaneChart 이식 시 ChartSvg 공존 전략
  - 선택: WorkspaceStage에 `useMultiPane` feature flag → Phase D 검증 후 ChartSvg 제거
  - 거절: 즉시 교체 — 회귀 위험, ChartSvg 의존 기능 확인 전
- **[D-0372-11]** WatchlistRail 심볼 추가 방식
  - 선택: USDT 페어 텍스트 입력 + 정규식 검증 (`/^[A-Z]{2,10}USDT$/`) — 구현 완료 ✅
  - 거절: Binance API 자동완성 — 외부 API 의존도 추가, Phase C 범위 초과

---

## Open Questions

- [x] **[Q-0372-1]** `/verdict`는 어느 hub인가?
  → **Hub 밖, Telegram 딥링크 전용** (사용자 확인 완료)
- [x] **[Q-0372-2]** `/analyze`는 Terminal 흡수인가 별도인가?
  → **Lab hub "AI Analysis" 탭** (사용자 확인 완료)
- [x] **[Q-0372-3]** Mobile nav 5개 매핑인가 4+More인가?
  → **5-hub 그대로, 모바일 전면 개편** (사용자 확인 완료)
- [x] **[Q-0372-4]** `/dashboard` URL 죽일지?
  → **살리고 재목적** (사용자 확인 완료)
- [x] **[Q-0372-6]** WatchlistRail 심볼 추가 source?
  → **USDT 페어 텍스트 입력** (Phase C 구현 완료, D-0372-11)
- [ ] **[Q-0372-5]** DecisionHUD는 cogochi 어디에? 우측 패널 / 새 모드 / TabBar 새 탭?
  → 임시 가정: AIPanel 영역 내 'decide' mode (shell.store ShellWorkMode 확장), Phase D 구현 시 확정
- [ ] **[Q-0372-7]** MultiPaneChart 이식 후 ChartSvg 삭제 타이밍?
  → 임시 가정: Phase D 머지 후 1주일 검증 → 별도 cleanup PR
- [ ] **[Q-0372-8]** Mobile에서 WatchlistRail 어떻게 노출?
  → 임시 가정: 모바일은 SymbolPickerSheet (bottom drawer), rail 자체는 `hidden md:flex`
- [ ] **[Q-0372-9]** VerdictInboxPanel의 watch-hit API가 cogochi에서 동일하게 작동하는가?
  → 확인 필요: `/api/captures` endpoint가 VerdictInboxPanel props 스펙과 맞는지 검증

---

## Implementation Plan

### Phase A — 네비 정리 ✅ (PR #826 머지 완료)

1. `AppNavRail.svelte` 7→5 항목 ✅
2. `MobileBottomNav.svelte` 전면 개편 ✅
3. `/market` route 삭제 (Phase C로 이동 후 완료) ✅

**Phase A Exit Criteria: PASS ✅**

---

### Phase B — Hub Layout + Home 재목적 ✅ (PR #829 머지 완료)

1. `/dashboard` Home 재목적 ✅ — home-profile-strip (지갑 + Passport 요약)
2. `routes/patterns/+layout.svelte` 탭 ✅ — Library/Strategies/Benchmark/Lifecycle/Search
3. `routes/lab/+layout.svelte` 탭 ✅ — Backtest/AI Analysis
4. `routes/settings/+layout.svelte` 탭 ✅ — Settings/Passport/Status
5. 5개 redirect 301 ✅ — strategies/benchmark/analyze/passport/status

**Phase B Exit Criteria: PASS ✅**

---

### Phase C — WatchlistRail + Cleanup 🟡 (PR #830 open)

1. WatchlistRail 전면 재작성 ✅
   - fold 토글 (‹/›)
   - 심볼 추가 (USDT 정규식 검증, 최대 20개)
   - 심볼 삭제 (hover × 버튼)
   - localStorage 저장 (`cogochi:watchlist:v1`)
   - `$effect` 기반 WS 재구독 (symbol list 변경 시 자동)
2. `/market` route 삭제 ✅
3. `/terminal` redirect 307→301 ✅

**Phase C Exit Criteria:**
- [ ] WatchlistRail fold/add/delete 브라우저 실기기 확인
- [ ] `/market` 404 응답
- [ ] `/terminal` → 301 → `/cogochi`
- [ ] typecheck pass
- [ ] CI green
- [ ] PR #830 merged + CURRENT.md SHA 업데이트

---

### Phase D — ★★★ Terminal 이식 + Supabase (예상 6-8일)

**Goal:** `/cogochi` AppShell을 진짜 작업공간으로 완성 — Terminal의 핵심 기능 4개 이식 + Supabase 동기화

#### D-1. shell.store 확장 (선행 작업)

```typescript
// shell.store.ts 변경
export type ShellWorkMode = 'observe' | 'analyze' | 'execute' | 'decide'; // 'decide' 추가

export interface ShellState {
  // ... 기존 ...
  decisionBundle: TerminalDecisionBundle | null;  // 신규
  hudVisible: boolean;                             // 신규
}
```

#### D-2. DecisionHUD 이식

- 이식 경로: `components/terminal/workspace/DecisionHUD.svelte` (544L)
- 의존성: `lib/terminal/panelAdapter.ts` — `buildTerminalDecisionBundle()`, `PanelViewModel` 이미 존재
- 연결 방식:
  1. shell.store에 `decisionBundle` state 추가
  2. AppShell AIPanel 영역에 `{#if $shellStore.hudVisible}<DecisionHUD bundle={$shellStore.decisionBundle} />{/if}` 추가
  3. WorkspaceStage에서 분석 완료 시 `shellStore.setDecisionBundle(bundle)` dispatch
- `lib/terminal/panelAdapter.ts` — 파일 이동 없음, import 경로 그대로 사용 가능

#### D-3. MultiPaneChart 이식

- 이식 경로: `components/terminal/workspace/MultiPaneChart.svelte` (548L)
- 의존성: `lightweight-charts` (이미 cogochi에서 사용 중), `$lib/chart/paneIndicators`, `$lib/api/terminalBackend`
- WorkspaceStage.svelte 변경:
  1. `useMultiPane` prop 추가 (default: false, Phase D 완료 후 true로 전환)
  2. `{#if useMultiPane}<MultiPaneChart .../>{:else}<ChartSvg .../>{/if}`
  3. `paneIndicators` — shell.store의 탭별 indicator 상태 전달

#### D-4. PatternLibraryPanel 이식

- 이식 경로: `components/terminal/workspace/PatternLibraryPanel.svelte` (100L)
- 의존성: `PatternCaptureRecord` from `$lib/contracts/terminalPersistence`
- LibrarySection.svelte 내부에서 import 교체 — 작은 컴포넌트라 직접 교체 가능

#### D-5. VerdictInboxPanel 이식

- 이식 경로: `components/terminal/peek/VerdictInboxPanel.svelte` (601L)
- 의존성: watch-hit API (`/api/captures?pending=true`), `PatternCaptureRecord`, `WatchToggle`, `AIParserModal`
- VerdictsSection.svelte 내부 교체 — Q-0372-9 확인 후 진행

#### D-6. ★★ 추가 이식 (NewsFlashBar / JudgePanel / ScanGrid / ResearchPanel)

- NewsFlashBar: CommandBar 상단 고정 배너 (props: 독립)
- JudgePanel: TradeMode.svelte 내부 삽입
- ScanGrid: TabBar에 'scan' 모드 탭 추가 → ScanMode.svelte 신규
- ResearchPanel: AIPanel 하단 섹션 추가

#### D-7. Lab hub PineScript 탭

- `routes/lab/+layout.svelte` 탭 추가: `{ href: '/lab/pinescript', label: 'PineScript' }`
- `routes/lab/pinescript/+page.svelte` 신규 — PineScriptGenerator 임포트

#### D-8. WatchlistRail Supabase 마이그레이션

```sql
-- 041_user_watchlist.sql (현재 다음 번호: 041, 040이 마지막)
create table user_watchlist (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  symbol      text not null check (symbol ~ '^[A-Z]{2,10}USDT$'),
  position    int  not null default 0,
  created_at  timestamptz not null default now(),
  unique(user_id, symbol)
);
create index user_watchlist_user_idx on user_watchlist(user_id, position);

alter table user_watchlist enable row level security;
create policy "users own watchlist" on user_watchlist
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

WatchlistRail.svelte 마이그레이션 로직:
1. 로그인 상태 확인
2. `GET /api/watchlist` → Supabase에서 읽기
3. 없으면 localStorage → Supabase UPSERT → localStorage 클리어
4. 변경 시 Supabase PATCH + localStorage 동기 (offline fallback)

**Phase D Exit Criteria:**
- [ ] **AC-D1** DecisionHUD cogochi에서 렌더, panelAdapter VM 데이터 연결
- [ ] **AC-D2** MultiPaneChart WorkspaceStage에서 렌더, 기존 ChartSvg 기능 동등 이상
- [ ] **AC-D3** PatternLibraryPanel LibrarySection 대체, 52 패턴 리스트 표시
- [ ] **AC-D4** VerdictInboxPanel watch-hit 섹션 렌더
- [ ] **AC-D5** ★★ 4개 이식 완료 (NewsFlashBar/JudgePanel/ScanGrid/ResearchPanel)
- [ ] **AC-D6** Lab hub PineScript 탭 + 페이지 작동
- [ ] **AC-D7** `user_watchlist` migration 041 deploy + RLS policy 적용
- [ ] **AC-D8** WatchlistRail Supabase sync — 로그인 후 디바이스 간 동기화 확인
- [ ] **AC-D9** Mobile: WatchlistRail SymbolPickerSheet 분기 작동
- [ ] **AC-D10** typecheck pass, vitest pass, CI green

---

## Exit Criteria (전체)

- [x] **AC1** Nav 항목 데스크탑/모바일 5개 (Phase A ✅)
- [x] **AC2** Nav 클릭 시 빈페이지/redirect 도달 0건 (Phase A ✅)
- [x] **AC3** 풀빌드 페이지 중 Nav→탭 2hop 안에 도달 불가 0건 (Phase B ✅)
- [ ] **AC4** 라우트 디렉토리 수 15→7 이하 (Phase C + D 완료 후)
- [x] **AC5** 기존 URL redirect 100% (Phase B/C ✅ — 5개 신규 + 3개 유지)
- [ ] **AC6** `/cogochi` AppShell에 ★★★ 4개 이식 (Phase D)
- [ ] **AC7** `/cogochi` AppShell에 ★★ 4개 이식 (Phase D)
- [x] **AC8-a** WatchlistRail fold 토글 작동 (Phase C ✅)
- [x] **AC8-b** WatchlistRail add/delete 작동, localStorage 저장 (Phase C ✅)
- [ ] **AC8-c** WatchlistRail Supabase 동기화 (Phase D)
- [x] **AC9** Mobile Bottom Nav 5-hub 정합, safe-area-inset (Phase A ✅)
- [x] **AC10** `/dashboard` Home: 지갑 + Passport 요약 + WATCHING (Phase B ✅)
- [x] **AC11** Patterns / Lab / Settings hub `+layout.svelte` 탭 3개 (Phase B ✅)
- [ ] **AC12** Supabase migration 041 `user_watchlist` deploy + RLS (Phase D)
- [ ] **AC13** CI green / typecheck pass (Phase C PR #830 대기)
- [x] **AC14** PR atomic 분할 머지 (A ✅ / B ✅ / C 🟡 / D 예정)
- [ ] **AC15** 모든 PR merged + CURRENT.md SHA 업데이트

---

## Owner

app

## Non-Goals

- 페이지 내부 상세 디자인 변경 (컴포넌트 이식은 포함, CSS 리디자인은 제외)
- `/verdict` 변경 (Telegram 딥링크 전용 유지)
- WatchlistRail add/delete 이외 신규 기능
- `/terminal` 라우트 코드 삭제 (컴포넌트 소스 보존)
- Charter Frozen 영역 (copy_trading, leaderboard, AI 차트분석, 자동매매)
- Drawing tools (DrawingCanvas/Toolbar) — Phase D 이후 별도 항목

## Facts (실측)

- AppShell.svelte: 466줄 (Phase D 이식 후 ~900줄 예상)
- WorkspaceStage.svelte: 415줄
- LibrarySection.svelte: 115줄 (PatternLibraryPanel 100줄로 교체)
- VerdictsSection.svelte: 140줄 (VerdictInboxPanel 601줄로 교체 — 기능 대폭 확장)
- shell.store.ts: 597줄 (ShellWorkMode 확장 필요)
- DecisionHUD.svelte: 544줄, 의존성: `lib/terminal/panelAdapter.ts`
- MultiPaneChart.svelte: 548줄, 의존성: `lightweight-charts`, `lib/chart/paneIndicators`
- PatternLibraryPanel.svelte: 100줄, 의존성: `lib/contracts/terminalPersistence`
- VerdictInboxPanel.svelte: 601줄, 의존성: watch-hit API, WatchToggle, AIParserModal
- migration 다음 번호: 041 (040_add_dlq_backtest_missing.sql이 마지막)
- nav dead-click: 전 2건 → 현재 0건 ✅

## Canonical Files

```
✅ 완료:
  app/src/components/layout/AppNavRail.svelte
  app/src/components/layout/MobileBottomNav.svelte
  app/src/routes/dashboard/+page.svelte
  app/src/routes/dashboard/+page.server.ts
  app/src/routes/patterns/+layout.svelte
  app/src/routes/lab/+layout.svelte
  app/src/routes/settings/+layout.svelte
  app/src/lib/cogochi/WatchlistRail.svelte

🟡 Phase D 예정:
  app/src/lib/cogochi/AppShell.svelte
  app/src/lib/cogochi/shell.store.ts
  app/src/lib/cogochi/WorkspaceStage.svelte
  app/src/lib/cogochi/sections/LibrarySection.svelte   (→ PatternLibraryPanel 교체)
  app/src/lib/cogochi/sections/VerdictsSection.svelte  (→ VerdictInboxPanel 교체)
  app/src/lib/cogochi/modes/TradeMode.svelte
  app/src/routes/lab/pinescript/+page.svelte           (신규)
  app/supabase/migrations/041_user_watchlist.sql       (신규)

소스 보존 (이식 완료 후에도 삭제 금지):
  app/src/routes/terminal/+page.svelte
  app/src/components/terminal/ (전체)
  app/src/lib/terminal/ (전체, panelAdapter 포함)
```

## Assumptions

- SvelteKit redirect(301) 사용 가능
- Supabase auth.uid() 사용 가능 (RLS)
- Phase D 시작 전 Phase C PR #830 머지 완료

## Handoff Checklist

- [x] Phase A PR #826 머지 — AppNavRail 7→5 + MobileBottomNav (2026-05-01)
- [x] Phase B PR #829 머지 — /dashboard Home + hub layouts + 5 redirects (2026-05-01)
- [ ] Phase C PR #830 머지 — WatchlistRail fold+add/delete + /market 삭제 + /terminal 301
- [ ] Phase D PR: ★★★ DecisionHUD + MultiPaneChart + PatternLibraryPanel + VerdictInboxPanel 이식 + ★★ 4개 + PineScript 탭 + Supabase watchlist 041
- [ ] Phase D 완료 후 CURRENT.md SHA 업데이트 + W-0372 completed 이동
