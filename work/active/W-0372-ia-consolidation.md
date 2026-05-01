# W-0372 — IA Consolidation: 전체 페이지 통합 + 네비 재설계 + Terminal 이식

> Wave: 5 | Priority: P1 | Effort: L (3 phases, 10-14일)
> Charter: §In-Scope (UI/UX 통합은 Frozen 아님)
> Status: 🟡 Design Draft
> Created: 2026-05-01
> Issue: #825

---

## Goal

`/cogochi` AppShell을 핵심 작업공간으로 확정하고, `/terminal`(2003줄)의 좋은 차트 컴포넌트들을 이식한다.
15개 라우트 / 7개 nav 항목을 5-Hub 구조로 통합한다 (desktop + mobile 전면 개편).
**삭제 없이 — 기능은 살리고, 라우트는 redirect로 통합**.

핵심 한 줄: `/cogochi`가 껍데기, `/terminal`이 내장 → 내장을 꺼내서 껍데기에 이식.

---

## 현황 진단 (실측)

### 라우트 × 상태 매트릭스

| 라우트 | Lines | Nav | 상태 | 핵심 기능 |
|---|---|---|---|---|
| `/cogochi` | 106 (AppShell) | ✅ "Terminal" 라벨 | **핵심 껍데기** | WatchlistRail + TabBar + AIPanel + CommandBar + TradeMode/TrainMode + Splitter |
| `/terminal` | 2003 | ❌ Hidden | **내장 보고** | DecisionHUD + SplitPaneLayout + MultiPaneChart + PatternLibraryPanel + VerdictInboxPanel + JudgePanel + ScanGrid + NewsFlashBar + ResearchPanel + WhaleWatchCard + PineScriptGenerator + DrawingCanvas/Toolbar + F60GateBar |
| `/dashboard` | 1061 | ✅ | 풀빌드 | WATCHING captures + KimchiPremiumBadge + OpportunityScore + AdapterDiffPanel |
| `/lab` | 751 | ✅ | 풀빌드 | StrategyBuilder + Backtest + LabChart + RefinementPanel + PatternRunPanel |
| `/settings` | 655 | ❌ | 풀빌드 | 사용자 설정 전체 |
| `/patterns` | 612 | ✅ | 풀빌드 | 52 PatternObjects + `[slug]/lifecycle/search` |
| `/analyze` | 566 | ❌ | 풀빌드 | 텍스트 → Groq/Gemini/Cerebras 병렬 LLM building block 추출 |
| `/passport` | 294 | ❌ | 풀빌드 | 사용자 ID/Level/LP/Tier/Track Record |
| `/verdict` | 243 | ❌ | 풀빌드 | Telegram 딥링크 전용 판정 폼 (`?token=`) |
| `/benchmark` | 241 | ❌ | W-0369 | 패턴 equity curve 비교 (BTC 대비) |
| `/strategies` | 202 | ✅ | W-0369 | PatternStrategyCard 그리드 (52 패턴 백테스트) |
| `/status` | 152 | ❌ | 풀빌드 | 시스템 상태 |
| `/market` | 9 | ✅ 🚨 | 빈페이지 | "준비 중" placeholder |
| `/agent` | 7 | ✅ 🚨 | redirect→/lab | 메뉴 중복 |
| `/scanner` | — | ❌ | redirect→/cogochi | — |

### Nav 모순 3가지

| 문제 | 건수 |
|---|---|
| Nav 클릭 → 빈페이지 또는 강제 redirect (dead-click) | **2건** (`/agent`→lab, `/market`→빈페이지) |
| 풀빌드인데 Nav에서 도달 불가 (5건) | `/terminal`(2003L), `/settings`(655L), `/passport`(294L), `/analyze`(566L), `/benchmark`(241L), `/status`(152L) — **6건** |
| Nav 라벨 "Terminal" 클릭 → 부분빌드 `/cogochi`(106L). 진짜 풀빌드 `/terminal`(2003L)은 숨겨짐 | **1건** (라벨/실제 불일치) |

### 사용자 페르소나 진입 흐름 (Jin)
1. 첫 진입 → 내 현황 파악 (지갑 / level / track record / 활성 watching)
2. 차트 작업 → 패턴 캡처 → 결정 (Decision HUD)
3. 패턴 라이브러리 → 백테스트 / 비교
4. 실험 / AI 분석
5. 설정 / 시스템 상태

---

## 제안: 5-Hub 구조 (확정)

### Hub 1 — **Home** (`/dashboard` 재목적)
앱 진입점, "내 현황" 한눈에.

```
/dashboard (재목적)
├── 지갑 섹션 (연결 상태 + balance)
├── Passport 요약 (Level / LP / Tier / Win Rate / 7일 성과)
├── WATCHING 섹션 (fold 가능, active captures)
└── 빠른 stats (KimchiPremium / OpportunityScore / 최근 시그널 3개)
```

기존 `/dashboard` 컴포넌트 (WATCHING captures, KimchiPremiumBadge, OpportunityScore, AdapterDiffPanel) **모두 유지**, 상단에 지갑 + Passport 요약 섹션만 추가.

### Hub 2 — **Terminal** (`/cogochi` AppShell 강화)
핵심 작업공간. `/terminal`의 컴포넌트 이식.

#### 이식 우선순위 매트릭스

| 컴포넌트 | 출처 파일 | 이식 위치 (cogochi 내) | 우선순위 | Phase |
|---|---|---|---|---|
| `DecisionHUD` | `lib/components/terminal/hud/DecisionHUD.svelte` | AppShell 우측 패널 / 새 모드 | ★★★ | B |
| `PatternLibraryPanel` | `components/terminal/workspace/PatternLibraryPanel.svelte` | LibrarySection 교체 | ★★★ | B |
| `VerdictInboxPanel` | `components/terminal/peek/VerdictInboxPanel.svelte` | VerdictsSection 강화 | ★★★ | B |
| `MultiPaneChart` / `ChartPane` | `components/terminal/workspace/MultiPaneChart.svelte` | WorkspaceStage 차트 교체 | ★★★ | B |
| `NewsFlashBar` | `components/terminal/workspace/NewsFlashBar.svelte` | CommandBar 상단 | ★★ | C |
| `JudgePanel` | `components/terminal/peek/JudgePanel.svelte` | TradeMode 내부 | ★★ | C |
| `ScanGrid` | `components/terminal/peek/ScanGrid.svelte` | 새 ScanMode 탭 | ★★ | C |
| `ResearchPanel` | `components/terminal/workspace/ResearchPanel.svelte` | AIPanel 강화 | ★★ | C |
| `DrawingCanvas` / `DrawingToolbar` | `components/terminal/workspace/Drawing*.svelte` | WorkspaceStage | ★ | 후속 |
| `WhaleWatchCard` | `components/terminal/workspace/WhaleWatchCard.svelte` | WatchlistRail 하단 | ★ | 후속 |
| `PineScriptGenerator` | `components/terminal/workspace/PineScriptGenerator.svelte` | **Lab hub로 이동** | ★ | C |
| `F60GateBar` | `components/terminal/workspace/F60GateBar.svelte` | StatusBar 통합 | ★ | 후속 |

#### WatchlistRail 신규 기능
현재: 7개 심볼 하드코딩 (BTC/ETH/SOL/BNB/XRP/AVAX/DOGE) + 내 패턴 섹션

목표:
- **Fold/unfold 토글** — 좌측 rail 접기 (작은 화면 작업공간 확보)
- **심볼 추가** — 검색 → 추가 (CoinGecko/Binance 심볼 제안)
- **심볼 삭제** — × 버튼
- **저장** — Phase B: localStorage / Phase C: Supabase `user_watchlist` 테이블
- **제한** — 최대 20개 심볼

```
/cogochi (강화된 AppShell)
[fold ▶] WatchlistRail        TabBar [+]      AIPanel [▼]
  BTC ─── $xxx  +1.2%  ███     ─────────────   ┌─────────┐
  ETH ─── $xxx  -0.3%  ▄▄▄                     │ Decision │
  [내 심볼] [+추가] [×삭제]    WorkspaceStage  │   HUD    │
  ─────────                    (MultiPaneChart) │ (이식)  │
  내 패턴 (PatternLibraryPanel ←이식)          └─────────┘
                                                VerdictInbox
                                                (이식)
                               StatusBar
```

### Hub 3 — **Patterns** (`/patterns` + 탭 통합)

```
/patterns/+layout.svelte (탭 layout 신규)
├── Library     ← 기존 /patterns (52 PatternObjects 그리드)
├── Strategies  ← /strategies → /patterns/strategies 이동
├── Benchmark   ← /benchmark → /patterns/benchmark 이동
├── Lifecycle   ← /patterns/lifecycle (기존)
└── Search      ← /patterns/search (기존)
```

Redirect:
- `/strategies` → `/patterns/strategies` (301)
- `/benchmark` → `/patterns/benchmark` (301)

### Hub 4 — **Lab** (`/lab` + `/analyze` 흡수)

```
/lab/+layout.svelte (탭 layout 신규)
├── Backtest      ← 기존 /lab (StrategyBuilder + LabChart + RefinementPanel)
├── AI Analysis   ← /analyze → /lab/analyze 이동 (LLM building block 추출)
└── PineScript    ← /terminal에서 PineScriptGenerator 이식
```

Redirect:
- `/analyze` → `/lab/analyze` (301)

### Hub 5 — **Settings** (`/settings` + `/status` + `/passport` 상세)

```
/settings/+layout.svelte (탭 layout 신규)
├── Settings    ← 기존 /settings (사용자 설정 전체)
├── Passport    ← /passport → /settings/passport 이동 (상세 track record)
└── Status      ← /status → /settings/status 이동 (시스템 상태)
```

Home hub에는 Passport **요약**만 (Level/LP/Tier/Win Rate). 상세 track record는 Settings hub의 Passport 탭.

Redirect:
- `/passport` → `/settings/passport` (301)
- `/status` → `/settings/status` (301)

### 외부 링크 전용 (Hub 밖)
- `/verdict?token=xxx` — Telegram 딥링크 전용, **변경 없음**, hub에 안 들어감

### 삭제/Redirect 정리
- `/market` — **삭제** (Charter Frozen "TradingView 대체" 위반 위험 + "준비 중" 신뢰도 손상)
- `/agent` — Nav 메뉴 제거 + redirect 유지 (`→ /lab`)
- `/scanner` — redirect 유지 (`→ /cogochi`)
- `/terminal` — Nav 메뉴 안 들어감 + redirect 유지 (`→ /cogochi`). **컴포넌트 소스는 보존**.

---

## Before / After

### Desktop AppNavRail (좌측 세로 rail)

**Before (7개, dead-click 2건):**
```
[Terminal→/cogochi] [Dashboard] [Lab] [Patterns] [Strategies] [Agent🚨] [Market🚨]
숨겨진 풀빌드 6개: /terminal /settings /passport /analyze /benchmark /status
```

**After (5개, dead-click 0건):**
```
[Home]      → /dashboard (재목적)
[Terminal]  → /cogochi (강화된 AppShell)
[Patterns]  → /patterns (5탭)
[Lab]       → /lab (3탭)
[Settings]  → /settings (3탭)
```
모든 풀빌드 페이지 Nav→탭 2hop 안에 도달.

### Mobile Bottom Nav (하단 가로 5칸)

**Before:**
```
[Home] [Terminal→/cogochi🚨] [Dashboard] [Lab] [Market🚨]
```

**After (전면 개편):**
```
[Home] [Terminal] [Patterns] [Lab] [Settings]
```
Desktop 5-hub와 완전 정합. safe-area-inset 처리 유지.

---

## Scope

### 포함
- `app/src/components/layout/AppNavRail.svelte` 7→5 항목
- `app/src/components/layout/MobileBottomNav.svelte` 전면 개편 (5-hub 매핑)
- `/cogochi` AppShell에 `/terminal` ★★★ 4개 컴포넌트 이식 (Phase B)
- `/cogochi` AppShell에 ★★ 4개 추가 이식 (Phase C)
- WatchlistRail fold 토글 + add/delete UI
- 신규: `app/src/routes/patterns/+layout.svelte` (탭)
- 신규: `app/src/routes/lab/+layout.svelte` (탭)
- 신규: `app/src/routes/settings/+layout.svelte` (탭)
- `/dashboard` 재목적 (지갑 + Passport 요약 + WATCHING)
- 기존 URL redirect 매트릭스 (모든 이동된 라우트 301)
- Supabase migration: `user_watchlist` 테이블 (Phase C)

### 제외 (Non-Goals)
- 페이지 내부 상세 디자인 변경 — 컴포넌트 이식은 포함, 내부 CSS 리디자인은 제외
- `/verdict` 변경 — Telegram 딥링크 전용, 건드리지 않음
- 신규 기능 추가 — WatchlistRail add/delete 외에는 기존 기능 재배치만
- `/terminal` 라우트 코드 삭제 — 컴포넌트 소스는 유지, 라우트만 redirect
- Charter Frozen 영역 (copy_trading, leaderboard, AI 차트분석, 자동매매)

### Files Touched (실측 추정)

```
수정:
  app/src/components/layout/AppNavRail.svelte
  app/src/components/layout/MobileBottomNav.svelte
  app/src/lib/cogochi/AppShell.svelte
  app/src/lib/cogochi/WatchlistRail.svelte
  app/src/lib/cogochi/WorkspaceStage.svelte
  app/src/lib/cogochi/sections/LibrarySection.svelte
  app/src/lib/cogochi/sections/VerdictsSection.svelte
  app/src/lib/cogochi/shell.store.ts
  app/src/routes/dashboard/+page.svelte (지갑+Passport 요약 추가)
  app/src/routes/dashboard/+page.server.ts (passport summary fetch)

신규 layouts:
  app/src/routes/patterns/+layout.svelte
  app/src/routes/lab/+layout.svelte
  app/src/routes/settings/+layout.svelte

라우트 이동:
  routes/strategies/* → routes/patterns/strategies/*
  routes/benchmark/*  → routes/patterns/benchmark/*
  routes/analyze/*    → routes/lab/analyze/*
  routes/passport/*   → routes/settings/passport/*
  routes/status/*     → routes/settings/status/*

Redirect 신규/유지:
  /strategies → /patterns/strategies (301, 신규)
  /benchmark  → /patterns/benchmark  (301, 신규)
  /analyze    → /lab/analyze         (301, 신규)
  /passport   → /settings/passport   (301, 신규)
  /status     → /settings/status     (301, 신규)
  /terminal   → /cogochi             (301, 신규 — 컴포넌트 이식 후)
  /agent      → /lab                 (기존 유지)
  /scanner    → /cogochi             (기존 유지)

삭제:
  routes/market/* (디렉토리 통째로)

Supabase:
  app/supabase/migrations/040_user_watchlist.sql (신규 — Phase C)
```

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `/terminal` 컴포넌트 이식 시 store 충돌 (terminal store ↔ shell store) | 중 | 중 | Phase B에서 atomic 이식 (1 컴포넌트 = 1 PR), shell.store 확장으로 어댑팅 |
| WatchlistRail add/delete Supabase 스키마 필요 | 중 | 낮음 | Phase B는 localStorage 먼저, Phase C에서 Supabase migration |
| 기존 URL 북마크 깨짐 | 높음 | 중 | 모든 이동에 SvelteKit `redirect(301)`, PR test plan에 redirect 매트릭스 |
| Phase B 도중 두 라우트 동시 존재 (예: `/strategies`와 `/patterns/strategies`) | 중 | 낮음 | redirect를 라우트 이동과 같은 PR에 포함, dual-route 단계 없음 |
| `/dashboard` 재목적 시 기존 컴포넌트 충돌 | 낮음 | 중 | 기존 섹션 유지 + 상단에 지갑/Passport 요약 섹션만 추가 (additive) |
| `/cogochi`에 4개 풀 컴포넌트 추가로 모바일 성능 저하 | 중 | 중 | mobileMode 분기 유지, 무거운 컴포넌트는 desktop only |
| `/terminal` 라우트 죽이면 외부 링크/문서가 가리키던 게 깨짐 | 중 | 중 | redirect 영구 유지 (Phase C 후에도 삭제 안 함) |
| MultiPaneChart 이식 시 차트 라이브러리 의존성 충돌 | 낮음 | 중 | lightweight-charts 버전 동일 확인, 의존성 lock |

### Dependencies
- W-0369 ✅ (`/strategies`, `/benchmark` 머지됨, PR #818, SHA `ee1c7f4d`)
- W-0307/W-0308 ✅ (lifecycle UI 머지됨)
- W-0304 (per-pane indicator) — Terminal 이식과 충돌 없음, 별개 파일
- W-0341 (hypothesis registry) — 독립
- W-0370 (Strategy Library Live Signals) — Patterns hub 탭에 영향, 흡수 가능

### Rollback
- Phase 별 atomic PR (A/B/C 각각 머지)
- Phase A: nav만 변경 (라우트 0개 이동) → 5분 안에 revert
- Phase B: 컴포넌트 이식 단위로 atomic, 1개 컴포넌트 revert 가능
- Phase C: redirect만 추가, 원본 라우트 디렉토리 삭제 안 함 → URL 즉시 복구 가능

---

## AI Researcher 관점

### Data Impact
- `/cogochi` 사용 패턴 변화: 기존 cogochi 사용자 → 강화된 AppShell 동일 진입점
- Watchlist 심볼 데이터: 기존 7개 하드코딩 → 사용자별 심볼 (가설: 평균 12-15개로 증가)
- DecisionHUD 노출 빈도 증가 → 결정 ledger 증가 예상
- PatternLibraryPanel cogochi 내장 → 패턴 검색 클릭률 증가 예상

### 분석 메트릭 (PR test plan에 포함)
- nav 클릭 → 유효 페이지 도달률: 현재 71% (5/7) → 목표 100%
- 풀빌드 페이지 도달률: 현재 60% (9/15 nav 또는 nav→탭) → 목표 100%
- 평균 클릭 깊이 (Jin journey 5 step): 현재 측정 안 됨 → baseline 측정 후 ≤ 2.5 hop
- WATCHING add/delete 작동률: 100% (Supabase write 성공)

### Failure Modes
- 사용자가 "Strategies"를 못 찾음 → Patterns hub hover 시 sub-label "Library · Strategies · Benchmark"
- 외부 링크가 옛 URL 가리킴 → redirect 영구 유지
- DecisionHUD가 cogochi에서 너무 큰 자리 차지 → fold 가능 토글 + 모바일에선 숨김
- WatchlistRail Supabase write 실패 → localStorage 폴백 (offline-first)
- `/dashboard` 재목적이 기존 사용자 혼란 → 상단 안내 banner (1회성, dismissible)

### Validation
- Phase A 후: 통계 dashboard에서 `/market` `/agent` 직접 hit 0건 확인 (1주)
- Phase B 후: cogochi 평균 세션 시간 측정 (DecisionHUD 효과)
- Phase C 후: redirect 301 hit 통계 (옛 URL 사용량)

---

## Decisions

- **[D-0372-1]** `/cogochi` AppShell을 **핵심 작업공간으로 확정**, `/terminal` 컴포넌트 이식
  - 거절: `/terminal`을 핵심으로 만들고 `/cogochi`는 redirect — 사용자가 명시적으로 "/cogochi 페이지가 일차핵심"이라고 함, AppShell 인프라(WatchlistRail/TabBar/AIPanel/Modes) 유지가 효율적
  - 거절: 두 페이지 모두 Nav 노출 — mental model 분열, 사용자 혼란
- **[D-0372-2]** **삭제 대신 redirect** 원칙
  - 거절: 옛 라우트 즉시 삭제 — 외부 링크/북마크 깨짐 + 코드 보존 가치 (`/terminal` 컴포넌트 소스)
  - 예외: `/market`만 삭제 (Charter Frozen 위반 위험)
- **[D-0372-3]** **5-Hub 구조** (Home / Terminal / Patterns / Lab / Settings)
  - 거절: 7-tab 유지 — 빈페이지 노출 + 발견 안 되는 페이지 6건 미해결
  - 거절: 6-hub (Signals 별도) — `/dashboard` 재목적으로 시그널 흐름 흡수 가능, hub 늘리면 모바일 5칸 한계 초과
- **[D-0372-4]** `/dashboard` **재목적: Home (지갑 + Passport 요약 + WATCHING)**
  - 거절: `/dashboard` 죽이고 `/signals`로 대체 — 이미 풀빌드(1061L) 컴포넌트 손실, 사용자가 "지갑이랑 프로필이랑 다같이 합쳐서" 명시
  - 거절: Passport 전체를 Home에 — 정보 과다, 요약만 노출하고 상세는 Settings hub
- **[D-0372-5]** `/analyze` → **Lab hub "AI Analysis" 탭**
  - 거절: Terminal에 흡수 — `/analyze`는 텍스트 LLM 분석으로 차트 작업과 다름, 사용자가 "ai agent로 흡수" 명시
  - 거절: 삭제 — 풀빌드(566L) Groq/Gemini/Cerebras 3-LLM 비교 도구 가치 있음
- **[D-0372-6]** **Mobile bottom nav 전면 개편** (5-hub 정합)
  - 거절: Mobile 그대로 두고 Desktop만 — 사용자가 "모바일도 전면 개편" 명시
  - 거절: 4 hub + More — 5칸 안에 5 hub 맞아 떨어짐, More는 추가 hop
- **[D-0372-7]** **3 Phase 분할 머지** (A: nav / B: hub layout + 이식 / C: cleanup + 추가 이식)
  - 거절: 한방 PR — 10-14일 작업, conflict 위험 지수적, 리뷰 부담 과다
- **[D-0372-8]** WatchlistRail **localStorage 먼저, Supabase 나중**
  - 거절: Supabase 즉시 — Phase B 범위 확장, migration 추가 필요
  - 거절: localStorage 영구 — 디바이스 간 동기 안 됨, Tier 사용자 가치 손실

---

## Open Questions

- [x] **[Q-0372-1]** `/verdict`는 어느 hub인가?
  → **답: Hub 밖, Telegram 딥링크 전용** (사용자 확인 완료)
- [x] **[Q-0372-2]** `/analyze`는 Terminal 흡수인가 별도인가?
  → **답: Lab hub "AI Analysis" 탭** (사용자 확인 완료)
- [x] **[Q-0372-3]** Mobile nav 5개 매핑인가 4+More인가?
  → **답: 5-hub 그대로, 모바일 전면 개편** (사용자 확인 완료)
- [x] **[Q-0372-4]** `/dashboard` URL 죽일지?
  → **답: 살리고 재목적 (지갑 + Passport 요약 + WATCHING)** (사용자 확인 완료)
- [ ] **[Q-0372-5]** `DecisionHUD`는 cogochi의 어디에? 우측 패널 / 새 모드 / TabBar 안 새 탭?
  → 임시 가정: 우측 패널 (AIPanel 옆), Phase B 구현 시 결정
- [ ] **[Q-0372-6]** WatchlistRail 심볼 추가는 어떤 source? Binance API / 내부 catalog / 텍스트 입력?
  → 임시 가정: Binance ticker API + 자동완성, Phase B 구현 시 검증
- [ ] **[Q-0372-7]** `MultiPaneChart` 이식 시 기존 `ChartSvg`와 공존? 교체?
  → 임시 가정: 교체, 기존 ChartSvg는 fallback으로 유지
- [ ] **[Q-0372-8]** Mobile에서 WatchlistRail은 어떻게 노출? 사이드 drawer / 상단 horizontal scroll / 숨김?
  → 임시 가정: 모바일에선 SymbolPickerSheet에 통합, rail 자체는 desktop only

---

## Implementation Plan

### Phase A — 네비 정리 + Dashboard 재목적 (3-4일)

**Goal:** Nav dead-click 0, 5-hub 구조 진입, Home 재목적

1. `routes/market/*` 삭제 (Charter Frozen 위반)
2. `AppNavRail.svelte` 7→5 변경:
   - `[Home][Terminal][Patterns][Lab][Settings]`
   - Home → `/dashboard`, Terminal → `/cogochi`
   - icon 5종 (기존 4 + Settings 1개 신규)
3. `MobileBottomNav.svelte` 전면 개편 (5-hub 매핑, safe-area 유지)
4. `/agent` `/cogochi` (라벨로서) `/scanner` Nav 메뉴 제거 (redirect는 유지)
5. `/dashboard` 재목적:
   - 상단에 지갑 섹션 추가 (WalletConnect 상태 + balance)
   - Passport 요약 섹션 추가 (Level/LP/Tier/WinRate — `/passport`에서 핵심 4 수치만 가져옴)
   - 기존 WATCHING + KimchiPremium + OpportunityScore + AdapterDiff 유지
6. WatchlistRail fold 토글 (Phase A 범위 — UI만)

**Phase A Exit Criteria:**
- Nav 항목 5개
- Nav 클릭 → 빈페이지/redirect 0건
- Mobile/Desktop 항목 정합 (5/5)
- `/dashboard` 상단에 지갑 + Passport 요약 표시
- WatchlistRail fold 작동

### Phase B — Hub Layout + Terminal 핵심 4개 이식 (4-5일)

**Goal:** 모든 풀빌드 페이지 hub 안에서 도달, cogochi 강화

1. **Patterns hub layout** 신규
   - `routes/patterns/+layout.svelte` 탭 (Library/Strategies/Benchmark/Lifecycle/Search)
   - `/strategies` → `/patterns/strategies` 이동 + redirect 301
   - `/benchmark` → `/patterns/benchmark` 이동 + redirect 301
2. **Lab hub layout** 신규
   - `routes/lab/+layout.svelte` 탭 (Backtest/AI Analysis)
   - `/analyze` → `/lab/analyze` 이동 + redirect 301
3. **Settings hub layout** 신규
   - `routes/settings/+layout.svelte` 탭 (Settings/Passport/Status)
   - `/passport` → `/settings/passport` 이동 + redirect 301
   - `/status` → `/settings/status` 이동 + redirect 301
4. **`/cogochi` AppShell에 ★★★ 4개 이식:**
   - **DecisionHUD** → 우측 패널 (Q-0372-5 결정)
   - **PatternLibraryPanel** → LibrarySection 교체
   - **VerdictInboxPanel** → VerdictsSection 강화
   - **MultiPaneChart** → WorkspaceStage 차트 교체
5. WatchlistRail add/delete UI + localStorage 저장 (최대 20개)

**Phase B Exit Criteria:**
- 모든 풀빌드 페이지 hub layout 안에 위치
- 5개 redirect 100% 작동 (`/strategies` `/benchmark` `/analyze` `/passport` `/status`)
- `/cogochi`에 4개 컴포넌트 이식 후 typecheck pass + 무한 렌더 없음
- WatchlistRail 심볼 add/delete 작동, localStorage 저장 확인

### Phase C — 추가 이식 + Cleanup + Supabase (3-5일)

**Goal:** 잔여 ★★ 컴포넌트 이식, Supabase migration, 라우트 cleanup

1. **★★ 추가 이식:**
   - NewsFlashBar → CommandBar 상단
   - JudgePanel → TradeMode
   - ScanGrid → 새 ScanMode 탭 (TabBar 모드 추가)
   - ResearchPanel → AIPanel 강화
2. **PineScriptGenerator** → Lab hub 신규 PineScript 탭
3. **WatchlistRail Supabase**
   - migration 040: `user_watchlist` 테이블 (`user_id`, `symbol`, `position`, `created_at`)
   - localStorage → Supabase 마이그레이션 로직
4. `/terminal` → `/cogochi` redirect 추가 (코드 보존)
5. Mobile 실기기 테스트 (safe-area-inset, tap target 44px)
6. SvelteKit redirect chain 통합 테스트

**Phase C Exit Criteria:**
- ★★ 4개 컴포넌트 이식 완료
- `user_watchlist` migration deploy + RLS policy
- `/terminal` redirect 작동 (컴포넌트 소스는 유지)
- 라우트 디렉토리 수 15→7 이하
- Mobile bottom nav 실기기에서 작동

---

## Exit Criteria

- [ ] **AC1** Nav 항목 데스크탑/모바일 5개 (현재 7/5)
- [ ] **AC2** Nav 클릭 시 빈페이지/redirect 도달 0건 (현재 2건: `/agent`, `/market`)
- [ ] **AC3** 풀빌드 페이지 중 Nav→탭 2hop 안에 도달 불가 0건 (현재 6건: `/terminal`, `/settings`, `/passport`, `/analyze`, `/benchmark`, `/status`)
- [ ] **AC4** 라우트 디렉토리 수 15→7 이하
- [ ] **AC5** 기존 URL redirect 100% (5개: `/strategies`, `/benchmark`, `/analyze`, `/passport`, `/status` + 유지 3개: `/terminal`, `/agent`, `/scanner`) — PR test plan에 redirect 매트릭스 첨부
- [ ] **AC6** `/cogochi` AppShell에 ★★★ 4개 컴포넌트 이식 완료 (DecisionHUD / PatternLibraryPanel / VerdictInboxPanel / MultiPaneChart)
- [ ] **AC7** `/cogochi` AppShell에 ★★ 4개 추가 이식 (NewsFlashBar / JudgePanel / ScanGrid / ResearchPanel)
- [ ] **AC8** WatchlistRail fold 토글 + add/delete 작동 (심볼 최대 20개, localStorage→Supabase)
- [ ] **AC9** Mobile Bottom Nav 5-hub 정합, safe-area-inset 처리, tap target ≥ 44px
- [ ] **AC10** `/dashboard` Home 재목적: 지갑 + Passport 요약 (Level/LP/Tier/WinRate) + WATCHING + 기존 stats
- [ ] **AC11** Patterns / Lab / Settings hub `+layout.svelte` 탭 신규 3개
- [ ] **AC12** Supabase migration 040 `user_watchlist` deploy + RLS
- [ ] **AC13** CI green / typecheck pass / vitest pass
- [ ] **AC14** PR 3개 atomic (Phase A / B / C 각각 별도 merge)
- [ ] **AC15** PR merged + CURRENT.md SHA 업데이트
