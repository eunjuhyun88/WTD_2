# W-0409 — Patterns 페이지 재설계 (Lab 흡수 포함)

## Status

- Phase: 설계 완료, 결정 락 완료, 구현 대기
- Owner: ej
- Priority: P1
- Created: 2026-05-05
- Updated: 2026-05-05 (Lab 흡수 통합)
- Depends on: W-0407 (Terminal — drill-through 목적지), W-0408 (Dashboard — 흡수/이동 협의)
- Subsumes: W-0410 (Lab 별도 work item) — Lab 은 본 W-0409 안에서 흡수
- Branch: TBD

## Why

`/patterns` 는 **5탭 중 4탭이 빈 placeholder 스텁**. 동시에
`/strategies`, `/benchmark`, `/lab`, `/lab/{counterfactual,analyze,ledger}` 가
**별개 route 로 풀구현됨**. 즉 같은 도메인(패턴 시뮬레이션·검증)이
6+ 곳으로 쪼개져 있음.

사용자 의도: **Patterns 페이지가 kieran.ai 처럼 "실제로 수익이 나는지
시뮬레이션 돌리는 곳"** — 즉 단순 카드 갤러리가 아니라 simulation
workshop. 따라서 `/lab/*` 전체를 `/patterns` 안으로 흡수하여 한 페이지에서
"발견 → 빌드 → 백테스트 → 검증 → 실거래(paper) → 비교 → 연구이력"이
끊김 없이 흐르도록 한다.

## Goals

1. **모든 탭 실제 기능** — 빈 스텁 0
2. **`/strategies`, `/benchmark` 흡수** — 별개 route → redirect
3. **`/lab/*` 전체 흡수** — Workshop/Live/Research 탭으로 통합, `/lab*` redirect
4. **`/formula` 통합** — `[slug]` 페이지의 한 섹션으로 흡수
5. **kieran.ai 스타일 시뮬레이션** — 슬라이더 → debounce → auto-rerun → live equity curve
6. **Universe + 기간 선택** — 단일 슬러그 백테스트가 아닌 멀티 심볼/기간 조합 시뮬
7. **Detail rail wiring** — 카드 클릭 → 우측 rail Detail (현재 dead)
8. **Orphan 처리** — 사용 안 되는 컴포넌트 mount or 삭제 (10+개)
9. **모바일 drawer** — display:none → slide-in drawer

## Non-Goals

- 신규 ML 학습 트리거 UI (engine 측 변경 없음)
- Pattern 정의(JSON spec) 편집 UI — 별도 W item
- copy-trading 풀 기능 — Leaderboard mount만, 구독/결제는 W-0411 Settings

---

## A. 현재 구조 audit (실측)

### A1. `/patterns` 탭 인벤토리

| 탭 | URL | 상태 | 비고 |
|----|-----|------|------|
| Library | `/patterns` (default) | ✅ 구현 | 후보/states/transitions/scan |
| Benchmark | `?tab=benchmark` | ❌ **빈 스텁** | 한편 `/benchmark` route 풀구현 |
| Lifecycle | `?tab=lifecycle` | ❌ **빈 스텁** | [slug] 의 PatternLifecycleCard 만 존재 |
| Search | `?tab=search` | ❌ **빈 스텁** | search infra 없음 |
| Strategies | `?tab=strategies` | ❌ **빈 스텁** | 한편 `/strategies` route 풀구현 |

### A2. Patterns 외부 — 흡수 대상 별개 route

| Route | 상태 | 처리 |
|-------|------|------|
| `/strategies` | StrategyGrid + parallel batch=8 백테스트 풀구현 | **Compare 탭 흡수** |
| `/benchmark` | BenchmarkChart + 멀티-슬러그 5개 + BTC curve | **Compare 탭 흡수** |
| `/patterns/formula` | formula dump + suspect → `/lab` 링크 | **`[slug]` 섹션 흡수** |
| `/lab` (LabHub) | auto/manual mode + 6 sub-tab + Strategy Builder + Backtest + Refinement + PatternRun | **Workshop + Live + Research 탭 흡수** |
| `/lab/counterfactual` | W-0383 분포 비교 + formula evidence | **Research 탭 흡수** |
| `/lab/analyze` | multi-LLM(Groq/Gemini/Cerebras) 트레이딩 분석 비교 | **Research 탭 흡수** |
| `/lab/ledger` | AutoResearch 사이클 히스토리 | **Research 탭 흡수** |
| `/lab/health` | 301 → /settings/status (이미 dead) | **삭제** |
| `/patterns/[slug]` | PatternLifecycleCard + Stats + EquityCurve + History | **유지** + Formula 섹션 추가 |

### A3. Lab 인벤토리 (실측)

**LabHub.svelte 구성:**
- Mode: `auto | manual` 토글
- Sub-tabs: `strategy | result | order | trades | refinement | pattern-run`
- 컴포넌트: `LabChart`, `LabToolbar`, `PositionBar`, `StrategyBuilder`,
  `ResultPanel`, `RefinementPanel`, `PatternRunPanel`, `BacktestSummaryStrip`,
  `EquityCurveChart`, `TradeLogTable`, `LabHoldTimeAdapter`
- Store: `strategyStore` (`createStrategy`, `createFromPreset`, `forkStrategy`,
  `revertToVersion` 등)
- 백테스트: `runMultiCycleBacktest` (클라이언트 TS 엔진, MARKET_CYCLES 10 사이클)
- Capture import: `buildLabDraftFromCapture` + `fetchPatternCaptureById`

**Strategy Builder (FACTOR_BLOCKS):** RSI / EMA / MACD / CVD / OBV / ATR / BB /
Price action — 블록을 조합해 entry/exit 룰 구성.

**API:**
- `/api/lab/counterfactual`, `/api/lab/autorun`, `/api/lab/forward-walk`,
  `/api/lab/send-to-terminal`
- `/api/refinement/leaderboard`, `/api/refinement/suggestions`
- `/api/research/ledger`, `/api/research/run-cycle`, `/api/research/formula-evidence`
- `/api/cycles/klines`

**Engine endpoints:** `POST /backtest`, `/patterns/{slug}/backtest`,
`/counterfactual`, `/research/formula-evidence`, `/research/strategies`,
`/research/cycle/{id}`, `engine/scoring/hill_climbing.py`

**Lab dead/half-built:**
- `ResultPanel` 부분 orphan (LabHub 안에서만 호출)
- `AdapterFingerprint` 미사용
- `CycleSelector` 미사용
- 매뉴얼 모드 trades 탭 stub
- `handleImport` 빈 stub
- `/lab?slug=&candidate=` 진입 경로 (formula 페이지에서만 링크) — 흡수 후 자동 정리
- `forkStrategy`, `revertToVersion` store action 만, UI 미노출

### A4. API/store 의존성 (Patterns + Lab 통합)

**Server-side (engineFetch via patterns):**
- `/patterns/candidates`, `/patterns/states`, `/patterns/stats/all`,
  `/patterns/transitions?limit=30`, `/patterns/{slug}/pnl-stats`

**Client-side (patterns):**
- `POST /api/patterns/scan`
- `GET /api/patterns`, `/api/patterns/states`, `/api/patterns/transitions`
- `POST /api/captures` (Save Setup)
- `GET /api/captures/outcomes` + `POST /api/captures/{id}/verdict`
- `GET /api/patterns/{slug}/formula`
- `PATCH /api/patterns/{slug}/lifecycle`
- `GET /api/research/indicator-features` (IndicatorFilterPanel)
- `GET /api/copy-trading/leaderboard?limit=20` + `POST/DELETE /api/copy-trading/subscribe`

**Strategy backend:** `fetchAllPatternObjects()`, `fetchPatternBacktest(slug)`

**Stores:**
- `patternCaptureContext` — orphan, 어디서도 import 안 됨 → 삭제
- `strategyStore` — Lab 흡수 후 patterns 안으로 재배치
- 신규: `selectedPatternStore` (Detail rail wiring), `simulationStore` (Workshop 파라미터/결과)

### A5. 발견된 이슈 (통합)

| # | 이슈 | 처리 |
|---|------|------|
| 1 | 4탭 빈 스텁 | Workshop/Live/Compare/Research/Lifecycle/Search 신설 |
| 2 | `/strategies`, `/benchmark` 분리 | Compare 탭 흡수 + 301 redirect |
| 3 | `/formula` tab nav 부재 | `[slug]` 섹션 통합 |
| 4 | `/lab/*` 전체가 별 route | Workshop/Live/Research 탭 흡수 + 301 redirect |
| 5 | PatternsRightRail "Detail" 탭 dead | 카드 클릭 → 선택 store wiring |
| 6 | `PatternCard` import 만, render X | render 활성화 |
| 7 | `CopyTradingLeaderboard` orphan | Compare 탭 하단 mount |
| 8 | `IndicatorFilterPanel` orphan | Library 좌측 필터 컬럼 mount |
| 9 | `patternCaptureContext` orphan | 삭제 |
| 10 | `ResultPanel`, `AdapterFingerprint`, `CycleSelector` orphan | Workshop 안 mount or 삭제 |
| 11 | `forkStrategy`, `revertToVersion` UI 없음 | Workshop 우측 버전 패널 신설 |
| 12 | 매뉴얼 모드 trades 탭 stub, `handleImport` 빈 stub | 삭제 (manual mode 자체 제거 — auto only) |
| 13 | 모바일 ≤1024px 필터/rail `display:none` | slide-in drawer |
| 14 | `hubs/patterns/index.ts` 빈 stub ("W-0382-B TBD") | W-0409 가 그 자리 |
| 15 | `/lab/health` 이미 dead redirect | 삭제 |
| 16 | kieran.ai 스타일 simulator 부재 | Workshop 탭 신설 (슬라이더+auto-rerun+universe+기간) |

### A6. Cross-page reuse

- `VerdictInboxSection` — `/dashboard` (W-0408 unmount) + `/patterns` rail. W-0409 후 patterns 단독 owner.
- `PatternLibraryPanel` — Terminal hub (`PatternLibraryPanelAdapter` 경유) **유지**
- `EquityCurveChart` — Lab + Patterns/[slug] 양쪽 — 단일 컴포넌트로 통합
- `LabHoldTimeAdapter` — patterns/Lab 공유 → 통합 후 patterns 단독 owner

### A7. 외부 링크

**Inbound:** `AppNavRail`, `MobileBottomNav`, `AppSurfaceHeader`, `SiteFooter`,
`appSurfaces.ts`, `/agent` "패턴 보기", `/dashboard` "전체보기 →",
`/patterns/formula` → `/lab?slug=&candidate=` (흡수 후 내부 탭 이동).

**Outbound (현재):** `/cogochi?symbol=X`, `/cogochi`, `/patterns/formula?slug=...`,
`/patterns?tab=lifecycle`, `/lab?slug=&candidate=`, `/patterns` (back).

---

## B. 재설계 IA — 단일 페이지 시뮬레이션 워크샵

### B1. 7탭 구조

```
┌────────────────── /patterns ──────────────────┐
│ Library | Search | Workshop | Live | Lifecycle | Compare | Research │
│                                                                     │
│ [좌 200px] 필터/네비  | [중앙] 탭 콘텐츠  | [우 320px] Right Rail   │
└─────────────────────────────────────────────────────────────────────┘
```

### B2. 탭별 contract

#### 1) Library (default — 발견)
- 현재 카드 그리드 + 카드 클릭 시 우측 Detail rail 활성화
- `IndicatorFilterPanel` 좌측 필터 컬럼에 mount
- `PatternCard` 실제 render
- **Workshop으로 보내기**: 카드의 "Workshop으로" 버튼 → `?tab=workshop&slug=X`

#### 2) Search (검색)
- 패턴 이름/슬러그/phase/indicator 풀텍스트 검색
- 데이터: `/api/patterns/states` + `/api/patterns/candidates` 클라이언트 필터
- 결과 = Library 카드 그리드 컴포넌트 재사용
- 별도 search infra X — 단순 검색창 + 좌 필터 강화

#### 3) Workshop (시뮬레이션 — kieran.ai 스타일) ★ 핵심
- **3단 레이아웃** — 좌: Strategy Builder, 중: 차트+EquityCurve, 우: 결과 통계
- **Strategy Builder** (Lab `StrategyBuilder` 흡수):
  - FACTOR_BLOCKS (RSI/EMA/MACD/CVD/OBV/ATR/BB/Price action)
  - 블록 추가/제거 → 슬라이더로 파라미터 조정
  - **debounce 300ms → auto-rerun** (kieran.ai 핵심 UX)
- **Universe 선택** (신규):
  - 멀티-심볼 선택 (BTCUSDT/ETHUSDT/SOLUSDT 등 N개)
  - 기본값: 사용자 watchlist + Top 10
- **기간 선택** (신규):
  - MARKET_CYCLES 10 사이클 토글 (2018-bear / 2020-covid / 2021-bull / 2023-recovery 등)
  - 또는 custom date range
- **차트 영역**: `LabChart` 흡수 → entry/exit 마커 + price 차트
- **EquityCurve**: `EquityCurveChart` 흡수 (단일 컴포넌트로 patterns/[slug] 와 통합)
- **결과 통계** (우측):
  - APR / Sharpe / MaxDD / WinRate / NumTrades / AvgHold
  - `BacktestSummaryStrip` 흡수
  - `LabHoldTimeAdapter` 흡수
- **버전 패널** (`forkStrategy`, `revertToVersion` UI 노출 — A5 #11 해결)
  - 좌측 하단 버전 히스토리 + Fork/Revert 버튼
- **Refinement** (`RefinementPanel` 흡수):
  - leaderboard + suggestions sub-section
  - "Apply suggestion" → 슬라이더 자동 조정 → auto-rerun
- **Counterfactual** (`/lab/counterfactual` 흡수, 우측 통계 패널 안 sub-section):
  - 분포 비교 + Welch t-test + bootstrap
  - formula evidence 노출
- **Send to Live** 버튼 → Live 탭 + paper trading 시작
- **Capture import** (`buildLabDraftFromCapture` 보존):
  - URL `?capture=<id>` 파라미터 진입 → 자동 import
- 진입 옵션:
  - URL: `?tab=workshop&slug=<x>` (Library 카드 → Workshop으로)
  - URL: `?tab=workshop&capture=<id>` (capture import)
  - URL: `?tab=workshop` (빈 슬레이트)

#### 4) Live (페이퍼 트레이딩)
- `PatternRunPanel` 흡수 (INTERNAL_RUN account)
- 현재 Workshop 의 전략을 실시간으로 페이퍼 거래
- `PositionBar` 흡수 (오픈 포지션)
- `TradeLogTable` 흡수 (체결 이력)
- "Send to Terminal" — `/api/lab/send-to-terminal` 호출 → Terminal 차트로 마커 전송
- 진입: `?tab=live`

#### 5) Lifecycle (전체 패턴 상태 보드)
- 모든 패턴의 lifecycle 상태 보드 (draft / candidate / object / archived)
- 컬럼별 패턴 카드 그리드 (Kanban 4컬럼, 드래그 X — 클릭 → `[slug]`)
- 데이터: `/api/patterns/states` + `/api/patterns/{slug}/lifecycle` (배치)
- Promote/Archive 액션은 `[slug]` 페이지에서만 (실수 방지)

#### 6) Compare (벤치마크 + 전략 비교)
- 상단: **Benchmark** (`/benchmark` 흡수)
  - `BenchmarkChart` + 멀티-슬러그 5개 + BTC curve
  - `fetchAllPatternObjects` + `fetchPatternBacktest`
- 하단: **Strategies grid** (`/strategies` 흡수)
  - `StrategyGrid` + parallel batch=8
  - 정렬 (sharpe / apr / win_rate / n_signals)
- 최하단: `CopyTradingLeaderboard` mount

#### 7) Research (이력 + 자동 연구)
- **Ledger** (`/lab/ledger` 흡수): AutoResearch 사이클 히스토리
- **AutoRun** (`/api/lab/autorun` 인터페이스): 자동 연구 트리거 + 진행상태
- **Forward-walk** (`/api/lab/forward-walk` 인터페이스): walk-forward 검증
- **Formula evidence** (`/api/research/formula-evidence` 인터페이스): suspect 패턴 분석
- **Multi-LLM Analyze** (`/lab/analyze` 흡수): Groq/Gemini/Cerebras 비교 — Research 안 sub-tab

### B3. `[slug]` 페이지 (별도 route 유지)

- 현재 8 섹션 유지 + **Formula 섹션 추가** (`/patterns/formula?slug=X` 흡수)
- "Open in Workshop" 버튼 → `/patterns?tab=workshop&slug=<slug>` (현 `/lab` 링크 대체)
- 현 `/patterns/formula` → `[slug]?section=formula#formula` redirect

### B4. 우측 rail (PatternsRightRail)

- **Detail 탭** — Library/Search 에서 카드 클릭 시 선택 패턴 store 업데이트 →
  rail Detail 탭이 mini stats + "Open in Workshop" + "전체보기 → /patterns/[slug]" 표시
- **Inbox 탭** — VerdictInboxSection 그대로

### B5. 모바일 (≤1024px)

- 좌측 필터 컬럼 → 슬라이드 drawer (햄버거)
- 우측 rail → 슬라이드 drawer (Inbox 아이콘)
- 탭 nav 가로 스크롤 유지
- Workshop 3단 → 세로 스택 + 섹션 collapsible

---

## C. 컴포넌트 disposition

### Patterns 측

| 현재 | 처리 |
|---|---|
| `routes/patterns/_tabs/Library.svelte` | **유지** + IndicatorFilterPanel mount + 카드 클릭 wiring + "Workshop으로" 버튼 |
| `routes/patterns/[slug]/+page.svelte` | **유지** + Formula 섹션 추가 + "Open in Workshop" 버튼 |
| `routes/patterns/formula/+page.svelte` | **삭제 + redirect** |
| `routes/strategies/+page.svelte` | **이동** → `_tabs/Compare.svelte` (StrategiesSection) |
| `routes/benchmark/+page.svelte` | **이동** → `_tabs/Compare.svelte` (BenchmarkSection) |
| `routes/strategies/+page.server.ts`, `routes/benchmark/+page.server.ts` | redirect 로 교체 |
| `components/patterns/PatternCard.svelte` | **render 활성화** |
| `components/patterns/IndicatorFilterPanel.svelte` | **mount** in Library |
| `components/patterns/VerdictInboxSection.svelte` | **유지** (rail Inbox) |
| `components/patterns/{Lifecycle,Stats,EquityCurve,TradeHistory,PhaseBadge,Promote,TransitionRow}` | **유지** |
| `hubs/patterns/panels/CopyTradingLeaderboard.svelte` | **mount** in Compare 탭 하단 |
| `hubs/patterns/index.ts` (빈 stub) | 신규 export 추가 |
| `lib/strategy/StrategyGrid.svelte` | **유지** (Compare 탭) |
| `lib/strategy/BenchmarkChart.svelte` | **유지** (Compare 탭) |
| `stores/patternCaptureContext.ts` | **삭제** |

### Lab 측 (흡수)

| 현재 | 처리 |
|---|---|
| `routes/lab/+page.svelte`, `LabHub.svelte` | **삭제** (하단 Workshop 탭으로 분해 흡수) |
| `routes/lab/+page.server.ts` | redirect 301 → `/patterns?tab=workshop` |
| `routes/lab/counterfactual/+page.svelte` | **이동** → Workshop 우측 통계 패널 안 sub-section |
| `routes/lab/counterfactual/+page.server.ts` | redirect 301 → `/patterns?tab=workshop&panel=counterfactual` |
| `routes/lab/analyze/+page.svelte` | **이동** → Research 탭 sub-section |
| `routes/lab/analyze/+page.server.ts` | redirect 301 → `/patterns?tab=research&section=analyze` |
| `routes/lab/ledger/+page.svelte` | **이동** → Research 탭 Ledger sub-section |
| `routes/lab/ledger/+page.server.ts` | redirect 301 → `/patterns?tab=research&section=ledger` |
| `routes/lab/health/+page.server.ts` | **삭제** (이미 dead redirect) |
| `hubs/lab/LabHub.svelte` | **분해** → Workshop 탭 컴포넌트로 재배치 |
| `hubs/lab/panels/StrategyBuilder.svelte` | **이동** → `hubs/patterns/workshop/StrategyBuilder.svelte` + 슬라이더 + debounce auto-rerun 추가 |
| `hubs/lab/panels/LabChart.svelte` | **이동** → `hubs/patterns/workshop/WorkshopChart.svelte` |
| `hubs/lab/panels/LabToolbar.svelte` | **분해** (Universe + 기간 선택은 Workshop 자체 UI 로 흡수) |
| `hubs/lab/panels/PositionBar.svelte` | **이동** → Live 탭 |
| `hubs/lab/panels/ResultPanel.svelte` | **이동** → Workshop 우측 통계 패널 (BacktestSummaryStrip 과 통합) |
| `hubs/lab/panels/RefinementPanel.svelte` | **이동** → Workshop Refinement sub-section |
| `hubs/lab/panels/PatternRunPanel.svelte` | **이동** → Live 탭 메인 |
| `hubs/lab/panels/BacktestSummaryStrip.svelte` | **이동** → Workshop 우측 통계 |
| `hubs/lab/panels/EquityCurveChart.svelte` | **통합** — Patterns/[slug] 의 EquityCurve 와 단일 컴포넌트로 dedupe |
| `hubs/lab/panels/TradeLogTable.svelte` | **이동** → Live 탭 하단 |
| `hubs/lab/panels/LabHoldTimeAdapter.svelte` | **이동** → Workshop 우측 통계 |
| `hubs/lab/panels/AdapterFingerprint.svelte` | **삭제** (orphan) |
| `hubs/lab/panels/CycleSelector.svelte` | **삭제** (Workshop 자체 기간 선택 UI 가 대체) |
| `stores/strategyStore.ts` | **이동** → `hubs/patterns/workshop/strategyStore.ts` + Fork/Revert UI 노출 |
| `lib/lab/runMultiCycleBacktest.ts` | **이동** → `hubs/patterns/workshop/backtest/` |
| `lib/lab/MARKET_CYCLES.ts` | **이동** → `hubs/patterns/workshop/cycles.ts` |
| `lib/lab/buildLabDraftFromCapture.ts` | **이동** → `hubs/patterns/workshop/capture.ts` |
| `lib/lab/fetchPatternCaptureById.ts` | **이동** → `hubs/patterns/workshop/capture.ts` |
| 매뉴얼 모드 trades 탭 stub, `handleImport` 빈 stub | **삭제** (manual mode 자체 제거) |

### 신규 컴포넌트

- `routes/patterns/_tabs/Workshop.svelte`
- `routes/patterns/_tabs/Live.svelte`
- `routes/patterns/_tabs/Lifecycle.svelte`
- `routes/patterns/_tabs/Compare.svelte`
- `routes/patterns/_tabs/Research.svelte`
- `routes/patterns/_tabs/Search.svelte`
- `hubs/patterns/workshop/UniverseSelector.svelte` (멀티 심볼)
- `hubs/patterns/workshop/PeriodSelector.svelte` (MARKET_CYCLES + custom range)
- `hubs/patterns/workshop/VersionPanel.svelte` (Fork/Revert UI)
- `hubs/patterns/workshop/CounterfactualSection.svelte`
- `hubs/patterns/research/AnalyzeSection.svelte` (multi-LLM)
- `hubs/patterns/research/LedgerSection.svelte`
- `hubs/patterns/research/AutoRunSection.svelte`
- `hubs/patterns/research/ForwardWalkSection.svelte`
- `hubs/patterns/research/FormulaEvidenceSection.svelte`
- `stores/selectedPatternStore.ts` (Detail rail wiring)
- `stores/simulationStore.ts` (Workshop 파라미터/결과/debounce)

---

## D. 결정 (락 — 사용자 위임)

| # | 결정 | 락 | 이유 |
|---|------|---|------|
| D1 | Lab 흡수 형태 | **단일 페이지 (`/patterns` 안 Workshop/Live/Research)** | 사용자 명시 ("그냥 한페이지로해버리자"), kieran.ai 모델 |
| D2 | `/strategies`, `/benchmark` 처리 | **Compare 탭 흡수 + 301 redirect** | 한 곳에서 비교 |
| D3 | `/patterns/formula` 처리 | **`[slug]` 섹션 통합 + redirect** | tertiary 링크보다 자연스러움 |
| D4 | `/lab/*` redirect 전략 | **각 sub-route → 해당 탭+섹션 query parameter 로 매핑** | 외부 링크/북마크 보존 |
| D5 | Workshop 핵심 UX | **kieran.ai 스타일 — 슬라이더 변경 → debounce 300ms → auto-rerun** | 사용자 명시 |
| D6 | Universe 선택 | **멀티 심볼 (watchlist + Top 10 기본) — 단일 슬러그 백테스트 X** | 시뮬레이션 워크샵 정체성 |
| D7 | 기간 선택 | **MARKET_CYCLES 10 사이클 토글 + custom range** | 다양한 시장 국면 검증 |
| D8 | Auto/Manual mode | **Auto only — manual mode 삭제** | manual trades 가 stub, 사용 흔적 X |
| D9 | Strategy 버전 관리 UI | **Workshop 좌측 하단 VersionPanel 신설** (Fork/Revert 노출) | store action 만 있고 UI 없는 11번 issue 해결 |
| D10 | EquityCurve 컴포넌트 | **Patterns/[slug] 와 Lab 의 EquityCurve 단일 컴포넌트 통합** | 중복 제거 |
| D11 | Research 탭 sub-section | **Ledger / AutoRun / Forward-walk / Formula evidence / Analyze 5개** | Lab 의 connected ops 모두 흡수 |
| D12 | Search 탭 구현 | **클라이언트 필터 (별도 search infra X)** | 패턴 수 적음 |
| D13 | Lifecycle 탭 형태 | **Kanban 4컬럼, 드래그 X** | 한눈에 + 실수 방지 |
| D14 | CopyTradingLeaderboard 위치 | **Compare 탭 최하단** | strategy 와 의미 인접 |
| D15 | IndicatorFilterPanel 위치 | **Library 좌측 필터 컬럼** | 원래 의도 |
| D16 | 모바일 drawer | **slide-in (좌 필터, 우 rail) + Workshop 세로 스택** | display:none → drawer 표준 |
| D17 | `PatternCard` import | **render 활성화** | 컴포넌트 재사용성 |
| D18 | `patternCaptureContext` store | **삭제** | 1년+ orphan |
| D19 | dead Lab 컴포넌트 | **AdapterFingerprint, CycleSelector, manual stub 모두 삭제** | orphan + 대체 UI 존재 |
| D20 | Library 카드 클릭 | **rail Detail 활성 + 더블클릭 시 [slug] + "Workshop으로" 버튼** | 정보 미리보기 → 진입 분기 |
| D21 | "Send to Terminal" 위치 | **Live 탭 안 (Workshop X)** | 실거래 관점에서만 의미 있음 |
| D22 | Workshop 진입 URL 파라미터 | **`?tab=workshop&slug=X`, `?tab=workshop&capture=Y`, `?tab=workshop`** | Library/Capture/blank 3 진입로 |

---

## E. 구현 PR 분기 (8 PR)

### PR1 — 탭 골격 + Compare 흡수
- `_tabs/Compare.svelte` 신규 (`/strategies`, `/benchmark` 코드 이동)
- `/strategies`, `/benchmark` route → 301 redirect
- AC: `/patterns?tab=compare` 가 Strategies grid + Benchmark 표시

### PR2 — Search + Lifecycle 탭
- `_tabs/Search.svelte` (검색창 + 클라이언트 필터)
- `_tabs/Lifecycle.svelte` (Kanban 4컬럼)
- AC: 빈 스텁 0

### PR3 — Detail rail wiring + IndicatorFilterPanel + PatternCard + orphan 정리
- `selectedPatternStore` 신규
- Library 카드 클릭 → rail Detail
- IndicatorFilterPanel mount, PatternCard render 활성화
- `patternCaptureContext` 삭제
- AC: A5 #5 #6 #8 #9 해결

### PR4 — `[slug]` Formula 통합 + CopyTradingLeaderboard
- `[slug]` Formula 섹션 추가
- `/patterns/formula` redirect
- CopyTradingLeaderboard Compare 탭 하단 mount
- AC: A5 #3 #7 해결

### PR5 — Workshop 골격 + Strategy Builder + Backtest 엔진 이동 (Lab 흡수 1차)
- `_tabs/Workshop.svelte` 3단 레이아웃
- `StrategyBuilder` 이동 + 슬라이더 + debounce 300ms auto-rerun
- `runMultiCycleBacktest`, `MARKET_CYCLES`, capture util 이동
- `WorkshopChart` (LabChart) + `EquityCurveChart` 통합 + `BacktestSummaryStrip` + `LabHoldTimeAdapter` 이동
- `simulationStore` 신규
- `UniverseSelector`, `PeriodSelector` 신규
- `/lab` route → 301 redirect to `/patterns?tab=workshop`
- AC: 슬라이더 조정 → 300ms 후 auto-rerun, equity curve 갱신, universe 멀티 선택 동작

### PR6 — Workshop Refinement + Counterfactual + VersionPanel + Live 탭
- `RefinementPanel` 이동 (leaderboard + suggestions, "Apply" → 슬라이더 자동 조정)
- `CounterfactualSection` 이동 (`/lab/counterfactual` 흡수)
- `VersionPanel` 신규 (Fork/Revert UI)
- `_tabs/Live.svelte` 신규 + `PatternRunPanel`, `PositionBar`, `TradeLogTable` 이동
- "Send to Terminal" Live 탭에 mount
- `/lab/counterfactual` → 301 redirect
- AC: A5 #11 #12 해결, paper trading 동작

### PR7 — Research 탭
- `_tabs/Research.svelte` 5 sub-section (Ledger / AutoRun / Forward-walk / Formula evidence / Analyze)
- `/lab/ledger`, `/lab/analyze` 이동 + 301 redirect
- `/lab/health` 삭제
- 기존 dead Lab 컴포넌트 (AdapterFingerprint, CycleSelector, manual stub) 삭제
- AC: 모든 `/lab/*` 외부 링크 정상 redirect

### PR8 — 모바일 drawer
- 좌 필터 drawer + 우 rail drawer (slide-in)
- Workshop 3단 → 세로 스택 + collapsible
- AC: ≤1024px 모든 탭 정상 동작

---

## F. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | 7탭 모두 실제 콘텐츠 (빈 스텁 0) |
| AC2 | `/strategies`, `/benchmark`, `/lab*` 모두 `/patterns?tab=...` 로 301 redirect |
| AC3 | `/patterns/formula?slug=X` → `[slug]?section=formula` redirect 정상 |
| AC4 | Workshop 슬라이더 → 300ms debounce → auto-rerun + EquityCurve 갱신 |
| AC5 | Workshop universe 멀티 심볼 + MARKET_CYCLES 토글 동작 |
| AC6 | Workshop VersionPanel 에서 Fork/Revert 가능 |
| AC7 | Live 탭 paper trading + Send to Terminal 동작 |
| AC8 | Research 탭 5 sub-section 모두 데이터 표시 |
| AC9 | Library 카드 클릭 → rail Detail 활성 + "Workshop으로" 버튼 동작 |
| AC10 | `IndicatorFilterPanel`, `CopyTradingLeaderboard`, `PatternCard` 모두 mount |
| AC11 | `patternCaptureContext`, `AdapterFingerprint`, `CycleSelector`, manual stub 모두 삭제 |
| AC12 | EquityCurveChart 단일 컴포넌트 (patterns/lab 중복 제거) |
| AC13 | ≤1024px 모바일 drawer + Workshop 세로 스택 정상 |
| AC14 | Contract CI 통과 (work item 등록) |

---

## G. 보존 필수

| # | 항목 | 이유 |
|---|------|------|
| P1 | `[slug]` 4 parallel `engineFetch` + AbortSignal.timeout | resilience |
| P2 | Strategies BATCH=8 parallel backtest fetch | proxy 보호 |
| P3 | Benchmark MAX_SELECT=5 슬러그 제한 | UI/perf |
| P4 | `lifecycleApi` PATCH 가드 (PromoteConfirmModal) | 실수 방지 |
| P5 | VerdictInboxSection (W-0408 unmount, patterns 단독 owner) | dashboard 후 patterns 만 사용 |
| P6 | `runMultiCycleBacktest` 클라이언트 엔진 (engine HTTP X) | 슬라이더 auto-rerun 성능 |
| P7 | MARKET_CYCLES 10 사이클 데이터 | 시뮬 정합성 |
| P8 | `buildLabDraftFromCapture` capture import 흐름 | Capture → Workshop 워크플로 |
| P9 | `strategyStore` Fork/Revert action | 버전관리 동작 (단 UI 추가) |
| P10 | PhaseBadge `components/patterns/` 와 `shared/chart/overlays/` 분리 | chart overlay 별개 |

---

## H. Risks

| Risk | 완화 |
|------|------|
| `/strategies`, `/benchmark`, `/lab*` 외부 링크 SEO 영향 | 301 redirect 보존 |
| `/patterns/formula?slug=X` 파라미터 매핑 | redirect 시 `?slug=` → path segment 매핑 |
| Workshop debounce auto-rerun 가 무거운 universe + 긴 기간에서 UI 블록 | Web Worker 격리 검토, 진행률 토스트 |
| Lifecycle Kanban 모바일 좁음 | 컬럼 가로 스크롤 |
| selectedPatternStore leak | scope 명확히 (patterns 범위만) |
| W-0408 의 VerdictInboxSection unmount → 머지 순서 의존 | W-0408 PR2 + W-0409 PR3 순서 (W-0409 가 늦게 머지) |
| Lab 사용자가 Workshop UX 변경에 적응 필요 | Workshop 첫 진입 시 1회 onboarding 토스트 |
| EquityCurveChart 단일 통합 시 Lab 과 patterns 양쪽 prop 차이 | 통합 시 props superset 정의 후 점진 통합 |
| `runMultiCycleBacktest` 가 universe 멀티 심볼 미지원이면 확장 필요 | PR5 안에서 단일→멀티 확장 (필요 시 별도 sub-PR) |

---

## I. 다음 단계

1. ~~결정 락~~ ✅ 완료 (D1~D22)
2. CURRENT.md 업데이트 (W-0410 별도 work item 취소, W-0409 가 흡수)
3. W-0411 (Settings) 설계
4. 5개 페이지 통합 검토 → 구현 시작 (Workshop 이 가장 큰 미지수)

---

## J. 누락 보강 (2026-05-05 실측 audit 후 추가)

### J1. Terminal/Dashboard → Lab 하드코딩 링크 (URL 교체 필수)

| 파일 | 현재 | 교체 |
|------|------|------|
| `hubs/terminal/workspace/ChartBoardHeader.svelte` | `/lab?captureId=...&autorun=1` | `/patterns?tab=workshop&capture=...&autorun=1` |
| `hubs/terminal/workspace/SaveStrip.svelte` (2곳: `window.location.href` + `<a>`) | `/lab?captureId=...` | `/patterns?tab=workshop&capture=...` |
| `hubs/terminal/workspace/ChartBoard.svelte` (toast) | `/lab?captureId=...&autorun=1` | `/patterns?tab=workshop&capture=...&autorun=1` |
| `lib/shared/panels/mobile/DetailMode.svelte` | `/lab?captureId=...` | `/patterns?tab=workshop&capture=...` |
| `lib/shared/panels/mobile/MobileFooter.svelte` | `{ href: '/lab', label: 'LAB' }` | **삭제** (Patterns 항목으로 통합) |
| `routes/dashboard/+page.svelte` | `goto('/lab')` + `href="/lab"` (Open Lab / more in Lab) | redirect 로 자동 작동, 단 버튼 라벨 "Open in Workshop" 으로 변경 |
| `lib/shared/panels/StrategyCard.svelte` | `goto('/lab')` + `forkStrategy` import | `goto('/patterns?tab=workshop')`, store 경로 갱신 |
| `lib/components/AppSurfaceHeader.svelte` | `href="/lab"` "Lab ★" | **삭제** (lab surface 자체 제거 — J2) |

→ **PR5 (Workshop 흡수) 안에서 일괄 처리**, redirect 로 외부 호환은 보장하지만 내부 링크는 직접 교체 (UX 텍스트/추적 일관성).

### J2. `appSurfaces.ts` Lab Surface 처리

- 현재: `AppSurfaceId = ... | 'lab' | ...` 독립 surface, NavRail/MobileBottomNav/SiteFooter 모두 노출
- 결정: **`lab` surface 자체 제거**, `patterns` surface 의 `activePaths` 에 `/lab`, `/strategies`, `/benchmark` 추가 (redirect 도착 후 patterns nav 가 active 표시되도록)
- PR7 (Research 흡수) 안에서 처리 — Lab 관련 모든 페이지 흡수 끝난 시점

### J3. `hubs/lab/panels/research/` 블록 렌더러 5개 (Research 탭 핵심)

| 파일 | 처리 |
|------|------|
| `DualPaneFlowChartBlock.svelte` | **이동** → `hubs/patterns/research/blocks/` |
| `HeatmapFlowChartBlock.svelte` | **이동** → `hubs/patterns/research/blocks/` |
| `InlinePriceChartBlock.svelte` | **이동** → `hubs/patterns/research/blocks/` |
| `MetricStripBlock.svelte` | **이동** → `hubs/patterns/research/blocks/` |
| `ResearchBlockRenderer.svelte` | **이동** → `hubs/patterns/research/ResearchBlockRenderer.svelte` |
| `lib/contracts/researchView.ts` (블록 스키마 contract) | **유지** (경로 그대로, 블록 렌더러 import 만 갱신) |

→ Research 탭(PR7)에서 Ledger/Analyze 모두 이 렌더러 의존 — 같이 이동.

### J4. Lab util 파일명 정정 + 누락 추가

| 실제 파일 | 처리 |
|----------|------|
| `lib/lab/backtest.ts` (← 설계 §C 의 `runMultiCycleBacktest.ts` 오기) | **이동** → `hubs/patterns/workshop/backtest/index.ts` |
| `lib/lab/equityCurve.ts` (`buildBtcHoldSeries`, `buildStrategySeries`, `buildEquitySeries`, `buildCycleMarkers`) | **이동** → `hubs/patterns/workshop/equityCurve.ts` |
| `lib/lab/counterfactualStats.ts` | **이동** → `hubs/patterns/workshop/counterfactualStats.ts` |
| `lib/lab/captureDraft.ts` (← 설계 §C 의 `buildLabDraftFromCapture.ts` 오기) | **이동** → `hubs/patterns/workshop/captureDraft.ts` |
| `lib/lab/captureDraft.test.ts` | **이동** (코드와 동반) |
| `lib/lab/counterfactualStats.test.ts` | **이동** (코드와 동반) |
| `lib/lab/backtest.test.ts` (있다면) | **이동** (코드와 동반) |

### J5. `hubs/lab/panels/SendToTerminalButton.svelte`

- **이동** → Live 탭 안 (`hubs/patterns/live/SendToTerminalButton.svelte`)
- `/api/lab/send-to-terminal` API endpoint 자체는 보존 (route 만 이동, endpoint 살아있음)

### J6. `lib/research/` 모듈 (별도 평가 인프라)

`lib/research/{baselines,evaluation,pipeline,source}/`, `stats.ts`, `weightSweep.ts`, `schedule.ts`

- **유지 (이동 X)** — Research 탭이 호출하는 백엔드 평가 라이브러리
- 단, Research 탭 sub-section 이 import 하는 entry point 만 명시
- Workshop/Live 와 분리되어 있으므로 이동 시 의존성 폭발 위험

### J7. Lab subroute load functions

| 파일 | 처리 |
|------|------|
| `routes/lab/+layout.svelte` (탭 nav) | **삭제** (Workshop/Research 탭이 patterns 탭 nav 로 통합) |
| `routes/lab/counterfactual/+page.ts` | **삭제** (server-side redirect 로 충분) |
| `routes/lab/ledger/+page.ts` | **삭제** |
| `routes/patterns/formula/page.svelte.test.ts` | **삭제** (페이지 흡수) |
| `routes/lab/counterfactual/page.svelte.test.ts` | **삭제 또는 Workshop CounterfactualSection 으로 이전** (PR6) |

### J8. `/strategies`, `/benchmark` redirect 일관성

- 현재: 이미 `/patterns/benchmark`, `/patterns/strategies` (path segment) 로 redirect 중
- 설계: `?tab=compare` (query param) 방식
- **결정: query param 방식으로 통일** — 단일 source of truth (`?tab=`)
- PR1 안에서 redirect target 을 `/patterns?tab=compare§ion=benchmark` / `/patterns?tab=compare§ion=strategies` 로 교체

### J9. `lib/strategy/PatternStrategyCard.svelte`

- `StrategyGrid` 가 import 하므로 **유지** (Compare 탭 의존성)
- 명시적으로 §C 추가

### J10. `lib/stores/captureAnnotationsStore.ts`

- 사용처 grep 결과 chart annotation 레이어 — Terminal 차트와 연동
- **유지** (Terminal/Patterns 양쪽 사용 가능성, 추가 audit 후 결정)

### J11. 추가 API endpoint (§A4 보강)

Workshop/Research/Live 구현 시 호출 가능 — 모두 **endpoint 자체는 살아있음**:

- `GET /api/research/blocked-candidates`
- `GET /api/research/tv-import/{author,commit,estimate,preview,twin}`
- `GET /api/refinement/stats`
- `GET /api/patterns/recall`
- `POST /api/patterns/draft-from-range`
- `POST /api/patterns/[slug]/capture`
- `GET /api/captures/chart-annotations`
- `GET /api/captures/watch-hits`
- `GET /api/captures/[id]/watch`
- `POST /api/captures/[id]/verdict-link`
- `GET /api/patterns/[slug]/lifecycle-status` (`lifecycle` 와 별개 endpoint)

→ 모두 page route 와 무관. PR 진행 중 필요한 것만 호출.

### J12. Engine endpoint 보강

| Endpoint | Workshop 연동 |
|----------|--------------|
| `engine/api/routes/universe.py` | **UniverseSelector 의 심볼 목록 공급원** — Workshop universe 멀티 심볼 옵션 제공 |
| `engine/api/routes/backtest_thread.py` | **Workshop 비동기 백테스트** — 긴 universe×기간 조합 시 사용 (auto-rerun debounce 와 연동) |
| `engine/api/routes/patterns_thread.py` | 비동기 패턴 처리 — Library 의 long-running scan 에 사용 가능 |
| `engine/api/routes/refinement.py` | leaderboard/suggestions 외 추가 endpoint — Refinement 패널이 호출 |

→ **결정**: Workshop auto-rerun 은 1차 클라이언트 `runMultiCycleBacktest` (기존 P6 보존) → 무거운 조합 시 `backtest_thread` fallback. PR5 안에서 임계치 결정.

### J13. PR 매핑 (J 항목 → 기존 PR 번호)

| J 항목 | 처리 PR |
|--------|---------|
| J1 (링크 교체) | PR5 (Workshop), PR6 (Live), PR7 (Research) — 각자 흡수 PR 안에서 |
| J2 (lab surface 제거) | PR7 |
| J3 (research blocks) | PR7 |
| J4 (util 파일명) | PR5 |
| J5 (SendToTerminalButton) | PR6 |
| J6 (`lib/research/` 유지) | PR7 (참조만) |
| J7 (layout/+page.ts 삭제) | PR5 (lab layout), PR6 (counterfactual), PR7 (ledger) |
| J8 (redirect query param) | PR1 |
| J9 (PatternStrategyCard) | PR1 |
| J10 (captureAnnotationsStore) | 추가 audit (구현 시) |
| J11 (API 추가) | 호출 시점에 발생 |
| J12 (engine universe/backtest_thread) | PR5 (Workshop 임계치 결정) |

### J14. 추가 AC

| AC | 검증 |
|----|------|
| AC15 | Terminal/Dashboard 의 모든 `/lab` 하드코딩 링크가 `/patterns?tab=workshop` 으로 교체됨 (grep 검증) |
| AC16 | `appSurfaces.ts` 에서 `lab` surface 제거, `patterns` 의 `activePaths` 가 `/lab`, `/strategies`, `/benchmark` 포함 |
| AC17 | Workshop UniverseSelector 가 `engine/universe` 에서 심볼 목록 fetch |
| AC18 | Lab 의 모든 util/test 파일이 `hubs/patterns/workshop/` 으로 이동 (lab 디렉터리 삭제 또는 빈 상태) |
| AC19 | `/strategies`, `/benchmark` redirect target = `/patterns?tab=compare§ion=...` (query param 방식) |

---

## Goal

위 §Why / §Goals 본문 참조.

## Owner

위 §Status 의 Owner 필드 참조.

## Scope

위 §A / §B / §C 본문 참조.

## Non-Goals

위 §Non-Goals 또는 본문 명시 항목 참조.

## Canonical Files

위 §C / §C3 / 컴포넌트 disposition 표 참조.

## Facts

위 §A audit (실측) 또는 References 참조.

## Assumptions

위 §Status dependencies + §Why 전제 참조.

## Open Questions

위 §D Decisions 중 미확정 / §J 보강 항목 참조.

## Decisions

위 §D 결정표 / §Decisions 본문 참조.

## Next Steps

위 §I 다음 단계 / §G 다음 단계 본문 참조.

## Exit Criteria

위 §F AC / §D AC / §통합 AC 본문 참조.

## Handoff Checklist

- [ ] 위 §F AC 전부 통과
- [ ] CURRENT.md main SHA 갱신
- [ ] 머지 후 본 work item 파일 archive 이동
