# W-0407 — Terminal Tab + Velo Multi-pane + TradingView Drawing 통합

## Status
- Owner: TBD
- Phase: Wave A — W-T0 ✅ W-T1 ✅ W-T2 ✅ W-T3 ✅ W-T4 ✅ W-T7 ✅ → 다음: W-T5 (aggregated indicator API)
- Created: 2026-05-05
- Updated: 2026-05-05 (W-T0 spike gate PASS — decisions #1/#2 확정; W-T7 tab context preservation 완료)
- Depends on:
  - W-0402 terminal-cogochi-redesign — **🟡 Design Approved / Implementation In Progress** (완료 아님). foldable panels + AppTopBar/StatusBar 분리는 머지됨(#1072), 그러나 Mode 4→1축 (#10) 은 아직 진행 중
  - W-0403 cogochi-surface-decomposition — 🟡 Design Draft rev3 (work/completed/ 위치이나 헤더 status 는 draft, drawing layer 결정 W-0407 와 정합 필요)
  - W-0404 ai-agent-nl-interface multi-provider litellm — Phase 1 PR1~PR5 머지 완료, AI Scan mode aggregated API 소비처 (cross-cut #3)
  - W-0399 multi-instance indicators (`clientIndicators.ts`) — 머지 완료, v5 마이그레이션 후 재배선 필요 (cross-cut #1)
- 설치 lib 버전: `lightweight-charts ^5.1.0` (`app/package.json`), 실측 resolved `5.2.0` (pnpm lock). spike 시 `~5.2.0` (caret→tilde) 검토 권장

## Goal

Terminal(`/cogochi`)을 트레이더가 필요한 **모든 동작**을 한 곳에 가진 단일 작업 환경으로 재구성한다. 페이지 무관, 30+ orphan 컴포넌트와 6개 dead-wiring 경로를 정리하고, Velo 스타일 멀티 pane 차트 + TradingView 동등 드로잉 + AI Agent 자연어 + 탭 시스템을 통합한다.

## Why now

- 현재 30개 orphan 컴포넌트, 6개 dead-wiring (Scanner / QuickPanel / alphaBuckets publisher / AlphaMarketBar mount / `/api/cogochi/alpha/scan` callers / CgChart-DataCard) — 기능은 만들었지만 안 보이거나 동작 안 함
- 5축 Mode 혼란 (workMode + rightPanelTab + mobileMode + workspaceMode + chartType) — 사용자 경험 분산
- 8개 영역에 동일 기능 중복 (Symbol/TF/Verdict/Drawing/차트컨트롤/Multi-pane/Mode/AI진입점)
- Velo 같은 멀티 venue aggregated 인디케이터 없음
- 차트가 단일 컨텍스트만 — 비교/패턴 매치/스캔 결과 동시 보기 불가

## Layout 최종

```
┌──────────────────────────────────────────────────────────────────────────┐
│ AppTopBar: [☰] WTD logo · 글로벌nav · 검색 · 모드(O/A/E) · 알림bell · 프로필│
├──────────────────────────────────────────────────────────────────────────┤
│ TabBar: [● BTC 30m] [DOGE 1h ×📌] [Cup&Handle BTC 4h ×] [+]   [≡ workspace]│
├──────────────────────────────────────────────────────────────────────────┤
│ ChartToolbar: 🔍심볼 ⊕인디 30m fx Options Autosave Heatmap                 │
│               ↶↷ 색 📷캡처 ⛶full 🎬replay │ vol-profile │ 비교             │
├──┬────────────────────────────────────────────┬──────────────────────────┤
│ D│ [VerdictBanner]                             │ Watchlist (velo 우측)    │
│ r│ ┌────────────────────────────────────────┐ │ Filter: ⭐ News Exch Coin│
│ a│ │ 메인 candle pane                        │ │ ⭐ BTC 78,733  +0.65%   │
│ w│ │  + Drawing layer (사용자/AI 공용)       │ │ ⭐ ETH 2,318   +0.77%   │
│ i│ │  + Range select layer (drag→toast)     │ │   SOL 83.91   +0.32%   │
│ n│ │  + Heatmap overlay                     │ │ ...                     │
│ g│ │  + Alert horizontal lines              │ ├──────────────────────────┤
│  │ ├────────────────────────────────────────┤ │ AI Agent Panel           │
│ T│ │ Aggregated Funding Rate pane           │ │ Mode: [Decide][Pattern]  │
│ B│ ├────────────────────────────────────────┤ │       [Verdict][Research]│
│  │ │ Aggregated Liquidations pane           │ │       [Scan][Judge]      │
│  │ ├────────────────────────────────────────┤ │ chat thread...           │
│  │ │ Aggregated OI / Volume / Spot Vol pane │ │  ┌──카드──┐               │
│  │ ├────────────────────────────────────────┤ │  │ DOGE   │               │
│  │ │ Premium / Funding / OI single venue    │ │  └────────┘               │
│  │ ├────────────────────────────────────────┤ │ [입력 + voice + /]       │
│  │ │ ATR/ADX/Returns/사용자 인디 stack      │ │                          │
│  │ └────────────────────────────────────────┘ │                          │
│  │  TF strip · cursor time · % log auto       │                          │
└──┴────────────────────────────────────────────┴──────────────────────────┘
   Footer: StatusBar · PropFirm mini · Replay controls(active 시)
```

---

## A. Symbol & Market 컨텍스트

### A1. 심볼 선택 / 변경
- 동작: ChartToolbar `🔍 BTCUSDT` → SymbolPickerSheet → 4탭(Search/Watchlist/Recent/Sector) → `tab.symbol` 변경. Cmd+클릭 = 새 탭. 우클릭 → 비교 추가
- AI 자연어: "ETH 보여줘" / "ETH 1h 새 탭으로"
- 현재 분산: TopBar, MobileTopBar(중복), ChartPane inline input, WatchlistItem
- 통합: `tab.symbol` 단일 source. ChartPane inline 제거. MobileTopBar 폐기
- API: `/api/binance/exchangeInfo`, priceStore WS

### A2. 가격 / 24h % / 24h Volume
- 동작: ChartToolbar 우측 inline `[78,733.9 | +0.65% | $11.54B]`. 우클릭 → "복사 / 알림 설정 / 라인 그리기"
- API: Binance WS `!ticker@arr` → priceStore

### A3. Funding Rate / OI / Liquidation 24h badge
- 동작: ChartToolbar 보조 row `FR +0.012% · OI $3.2B · Liq24h $45M`. 클릭 → AI 패널 decide push
- API: `/fapi/v1/premiumIndex`, `/fapi/v1/openInterest`, `/futures/data/forceOrders`

### A4. Quant Regime pill
- 동작: PERP 옆 pill `Strong Bull / Bull / Neutral / Bear / Strong Bear / Extreme FR`. 클릭 → AlphaMarketBar drawer
- 현재: ChartBoardHeader (mounted), alphaBuckets (publisher 0)
- fix: `pushBucketsFromResults()` AI scan 완료 시 자동 호출 + cron 5분

### A5. Compare / 멀티 심볼 오버레이
- 동작: ChartToolbar `+ 비교` → 메인 pane에 line series. 정규화 옵션 (% / 절대)
- store: `tab.compares: string[]`

---

## B. Chart 본체 (Velo + TradingView 동등)

### B1. Timeframe
- 1m/3m/5m/15m/30m/1h/2h/4h/6h/8h/12h/1d/3d/1w/1M + 커스텀. 키보드 1~9
- 통합: ChartToolbar + 하단 TF strip (velo 동등 1d 5d 1m 3m 6m 1y All)

### B2. Chart type
- Candle / Heikin / Line / Area / Bar / Renko / Hollow / Baseline
- store: `tab.chartType`

### B3. Zoom / Scroll / Crosshair
- 휠 줌, 드래그, OHLC tooltip, crosshair, 더블클릭 fit, Cmd+→ next

### B4. Multi-pane stack (Velo 핵심)
- 메인 pane 아래 N sub-pane stack. 드래그 높이. hover ⊙🗑⋯. 우클릭 순서. 같은 인디 중복 가능
- 지원 pane:
  - Aggregated Funding Rate (8h avg, OI weighted)
  - Aggregated Liquidations
  - Aggregated Open Interest (candles)
  - Aggregated Spot Tape
  - Aggregated Spot Volume
  - Aggregated Tape
  - Aggregated Volume
  - Coinbase Premium %
  - Single-venue Funding / OI / Volume
  - Premium %
  - Returns %
  - ATR / ADX / RSI / MACD / Stoch / CCI / OBV / VWAP / MFI
  - 사용자 정의
- 통합 후보: lightweight-charts v5 `IChartApi.addPane()`. MultiPaneChart/SplitPaneLayout/CgChart 폐기
- **⚠ 미결정 (W-T0 spike 검증 필수)**: 현 코드베이스에 이미 `paneLayoutStore.svelte.ts` 가 자체 멀티 pane (visibility/stretch) 을 store 기반으로 구현 중. 옵션:
  - (a) `paneLayoutStore` 폐기 + native v5 `addPane()` 단독 사용
  - (b) `paneLayoutStore` 유지 + v5 panes 위에 adapter 레이어
  - (c) v5 panes 만 사용하되 store 는 visibility 메타데이터만 보존
  → spike 시 (a)/(b)/(c) 비교, 마이그레이션 비용 측정. W-T2 PR body 에 결정 기록 필수
- store: `tab.panes: PaneConfig[]` (paneLayoutStore 와의 관계는 spike 결과로 결정)
- API: `/api/indicators/aggregated/{type}` (engine/ 신규, W-T5 백엔드 PR 별도), clientIndicators.ts (W-0399 산출물 — v5 마이그레이션 후 **재배선 필수**, cross-cut #1)

### B5. Indicator picker (fx 모달)
- ChartToolbar `fx` → 모달 — 검색 + 카테고리(Velo Aggregated / Single / Trend / Momentum / Volume / Custom) + 즐겨찾기 + 파라미터
- 통합: IndicatorFilterPanel 모달화

### B6. Multi-instance indicator (W-0399 완료)
- 같은 인디 다른 파라미터 (EMA20/50/200)
- 통합: fx 모달 "추가" 버튼

### B7~B14
- Heatmap toggle, Volume profile, Indicator labels toggle, Chart options, Autosave, Undo/Redo, Fullscreen, Color theme

---

## C. Drawing & Annotation

### C1. Drawing toolbar (좌측 vertical, 18종)
- Cursor / Trendline / Ray / Extended / Horizontal / Vertical
- Parallel channel / Disjoint channel
- Rectangle / Ellipse / Triangle / Polygon
- Fibonacci (retracement/extension/fan/arc/timezone)
- Pitchfork (Andrews/Schiff/Modified)
- Gann (fan/box/square)
- Elliott wave (impulse/correction)
- Text / Label / Callout / Comment
- Arrow / Price label
- Brush / Highlighter
- Position tool (long/short with TP/SL)
- Forecast
- Date range / Price range / Date+Price range
- Ruler

**⚠ 미결정 (W-T0 spike 검증 필수, W-0413 §J9 #2 cross-cut)**:

- 현 코드베이스 실측: `DrawingCanvas.svelte` 가 `<canvas>` 엘리먼트 래핑, `DrawingManager.ts` 가 Canvas 2D context (`getContext('2d')`, `clearRect`, `ctx.fillRect`) 로 구현되어 있음 — **현 시스템은 Canvas 기반**
- 옵션:
  - (a) **SVG overlay 신규**: SVG 마이그레이션, `timeToCoordinate()` + `priceToCoordinate()` 좌표 변환. 이점 — DOM 인스펙터/접근성/CSS 스타일링 가능, 단점 — 18종 도구 재구현 비용 큼
  - (b) **현 Canvas 유지 + 확장**: `DrawingManager.ts` 에 신규 도구 18종 점진 추가. 이점 — 기존 자산 보존, 단점 — 좌표 정합 / 줌 시 hit-test 재구현 필요
  - (c) **하이브리드**: AI 박스/range capture 등 임시 도형은 SVG, 사용자 영구 도형은 Canvas 유지
- → spike 시 (a)/(b)/(c) 비교, 18종 중 5종 (Trendline / Rectangle / Fibonacci / Position tool / Text) POC. 결과를 **W-0403 drawing layer 결정과 동기화** (cross-cut). W-T3 PR body 에 결정 기록 필수
- 좌표 변환 공통: lightweight-charts `timeToCoordinate()` + `priceToCoordinate()`

### C2~C10
- 편집/그룹/autosave/템플릿/Range capture(drag→toast 4 액션)/가격알림/스크린샷/노트/Forecast

---

## D. AI Agent 패널 (자연어 단일 진입점)

### D1. 패널 본체
- 우측 상시. 상단 mode chip 6개: Decide / Pattern / Verdict / Research / Scan / Judge
- 입력 + voice + `/` 단축키. thread 누적

### D2. 자연어 intent (전부)
| 입력 | intent | 결과 |
|---|---|---|
| "ETH 1h 보여줘" | change_symbol_tf | 활성 탭 변경 |
| "ETH 1h 새 탭" | new_tab | 새 탭 |
| "FR 추가" | add_pane | tab.panes push |
| "RSI 빼" | remove_pane | filter |
| "밈코인 강세" | scan | sector=meme,filter=BULL |
| "프리미엄 음수" | scan | filter=premium<0 |
| "이거 진입할만해?" | decide | overlay + verdict draft |
| "비슷한 패턴" | pattern_search | PatternCard |
| "어제 BTC 변동" | research | ResearchBlock |
| "이 구간 verdict" | verdict_compose | RangeActionToast |
| "백테스트" | backtest_handoff | Lab 인계 |
| "78000 알림" | alert_create | priceLine + alert |
| "200EMA 위 박스 그려" | draw_command | overlay push |
| "지금 캡처해서 verdict" | snapshot+verdict | C8+G1 |
| "이거 추적" | track | watchlist+WarRoom |

### D3. AI 답변 카드 타입
- SymbolCard / PatternCard / IndicatorCard / VerdictCard / DecideCard / ResearchBlock / NewsCard / JudgeCard / ScanResultGroup

### D4~D12
- AI overlay (drawing layer 흡수) / Verdict banner / Scroll analysis / Pattern library / ChatThread / WarRoom / Header AI Search / 음성 / 일괄 액션

---

## E. Scanner / Discovery (AI 패널 흡수)

### E1. 섹터 프리셋 chip
- AI 패널 Scan mode toolbar `[Meme][DeFi][AI][L1][L2][Top10][+커스텀]`
- 현재: QuickPanel(0 imports), scanner.ts presets
- API: `/api/cogochi/alpha/scan`

### E2. 필터 chip
- `[BULL][BEAR][WK][MTF][BB][FR>0.05%][OI↑]` 다중 토글
- store: alphaBuckets.activeFilters

### E3. AlphaMarketBar
- AI 패널 Scan mode 헤더 1줄 게이지 `Bull 32% | Neutral 41% | Bear 27% | ExtremeFR 4`
- 현재: AlphaMarketBar ← BottomBar (dead chain)
- fix: `pushBucketsFromResults()` E1 결과 도착 시 자동 호출

### E4~E9
- Watchlist 관리 (우측 사이드바, 그룹/News/Exchange/Coin filter) / Recent / 검색 / News 피드 / Market dominance

---

## F. 실행 / 포지션 / 트레이드 (Bottom drawer = Execute mode)

- F1. Position bar — Bottom drawer "Positions"
- F2. Quick order — ChartPane 우측 floating (Execute)
- F3. Bracket / TP-SL drag — Position tool drawing
- F4. Activity log — Bottom drawer "Log"
- F5. Order book / Tape — Bottom drawer "OrderBook"
- F6. Replay 모드 — ChartToolbar 🎬, `tab.replayState`
- F7. Paper / Live toggle — Settings
- F8. Position 자동 동기화 — Binance Futures user data WS

---

## G. Verdict

- G1. 작성 (Range capture → 모달 → AI 채점)
- G2. Inbox bell — AppTopBar
- G3. Streak badge — AppTopBar mini
- G4. Verdict thread — AI 패널 verdict mode

---

## H. Tab 시스템 (신규)

### H1. Tab bar
- 활성/×/📌pin/드래그/+/우클릭 메뉴(복제/오른쪽 닫기/모두 닫기/이름 변경)
- state: `tabsStore.tabs[] + activeId`

### H2. Tab 컨텍스트 (보존 항목)
```ts
type ChartTab = {
  id, symbol, timeframe, chartType,
  panes[], drawings[], indicators[], visibleRange,
  heatmapOn, autosave, aiOverlay, verdictBanner,
  rangeSelection, replayState, alerts[],
  compares[], notes[], drawingGroups,
  source, pinned, label
}
```

### H3. Swap 동작
- 비활성 탭 = 차트 인스턴스 destroy, 상태만 유지
- 활성 탭 = lazy mount + 상태 복원
- 메모리 cap: 동시 차트 인스턴스 최대 3 (LRU)

### H4. AI 카드 ↔ 탭 연동
- 카드 클릭 = 새 탭 생성 (default) 또는 활성 탭 swap

### H5. Split view
- `?m=split` → 활성 탭 N개 좌우/2x2 분할

### H6. URL ↔ 탭 sync
- `/cogochi?tab=tab1&sym=...&tf=...&panes=...` 공유

---

## I. Mode / Workspace

### I1. Observe / Analyze / Execute 3-mode
- Observe: AlphaMarketBar 강조, AI overlay off, drawing 잠금, 주문 hide
- Analyze: AI overlay on, drawing 활성, verdict 작성
- Execute: 포지션 강조, Bottom drawer auto open, 주문 단축키, alert 강조
- 통합: workMode 단일 (rightPanelTab/mobileMode/workspaceMode 폐기)

### I2~I5
- 단축키 cheatsheet (`?`) / Workspace 슬롯 1/2/3 / Foldable panels (W-0402) / 테마

---

## J. Footer

- J1. StatusBar (mounted, 유지)
- J2. PropFirm mini progress (Footer 우측, evaluation 활성 시)
- J3. Replay controls (▶⏸⏭ 1x/2x/4x/8x)
- J4. Connection / API health dot

---

## K. Mobile (≤768)

- K1. Mobile Header 단일
- K2. Mobile Tab bar (가로 스크롤 + swipe)
- K3. Mobile Bottom Nav (Watchlist/Chart/AI/Positions)
- K4. AI 패널 = Bottom sheet
- K5. Mobile prompt footer
- K6. 손가락 드로잉 + 핀치 줌
- K7. Watchlist sheet (우측 swipe)

---

## L. 외부 통합

- L1. Binance API key (Settings)
- L2. Telegram bot
- L3. DogeOS wallet (의도 확인 필요)
- L4. AI 모델 선택 (W-0404 multi-provider litellm)
- L5. Subscription / quota gauge

---

## M. 기타

- Volume profile / 세션 색깔 / 이벤트 마커(CPI/FOMC) / 타임존 토글 / log scale / Compare % normalize / Bar magnification

---

## 컴포넌트 처리 매핑

| 컴포넌트 | 현재 | 처리 |
|---|---|---|
| ChartPane | mounted | 재구현 v5 panes + drawing overlay |
| MultiPaneChart | orphan | 폐기 |
| SplitPaneLayout | orphan | 폐기 (탭 split 대체) |
| CgChart | orphan | 폐기 |
| ChartHeader | orphan | 폐기 |
| ChartBoardHeader | mounted | ChartToolbar로 통합 |
| TopBar | mounted | 폐기 (AppTopBar+ChartToolbar) |
| MobileTopBar | mounted | 폐기 (Mobile Header 신규) |
| MobileSymbolStrip | orphan | 폐기 |
| TimeframeStrip | orphan | mount → ChartToolbar |
| MobileTfStrip | mounted | 폐기 |
| WatchlistItem | mounted | 우측 이동 |
| QuickPanel | orphan | AI 패널 Scan mode |
| AlphaMarketBar | orphan | AI 패널 Scan 헤더 |
| BottomBar | mounted | 폐기 |
| BottomPanel | orphan | Bottom drawer 재배선 |
| AIOverlayCanvas | orphan | drawing layer 흡수 |
| RangeActionToast | orphan | mount |
| SaveRangeToast | mounted | 폐기 |
| VerdictBanner | orphan | ChartPane mount |
| ChatThread | orphan | AI 패널 본체 |
| WarRoom | orphan | AI 패널 watch + Bottom Signals |
| ScrollAnalysisDrawer | orphan | AI 패널 decide stream |
| PatternLibraryPanelAdapter | orphan | AI 패널 Pattern mode |
| PatternClassBreakdown | orphan | AI 패널 Pattern mode |
| IndicatorFilterPanel | orphan | fx 모달 |
| AIAgentPanel | mounted | mode 6개 확장 |
| AiSearchBar | mounted | AppTopBar 글로벌 |
| StatusBar | mounted | 유지 |
| PositionBar | mounted | Bottom drawer Positions |
| LiveSignalPanel | orphan | 흡수 또는 삭제 |
| ModeToggle | orphan | AppTopBar mount |
| ModeRouter | orphan | 폐기 |
| MobileBottomNav | mounted | 유지 |
| BottomTabBar | orphan | 폐기 |
| MobileFooter | orphan | 폐기 |
| MobilePromptFooter | orphan | mount mobile |
| AppSurfaceHeader | orphan | 폐기 |
| SearchResultList | orphan | AI SymbolCard 대체 |
| SearchLayerBadge | orphan | Patterns 페이지 |
| CopyTradingLeaderboard | orphan | Dashboard |
| ResearchBlockRenderer | orphan | AI Research mode |
| PineGenerator | orphan | Lab |
| DogeOSWalletButton | orphan | Settings |
| Icon / ChartSvg | orphan | 평가 후 폐기 |
| StreakBadgeCard | mounted | AppTopBar mini |

---

## Store / API 맵

### Store 신규/통합
- `tabsStore` (신규) — tabs[], activeId, persist
- `tab.*` per-tab state
- `shellStore` 단순화 (workMode, layoutPreset)
- `chartStore` — 활성 탭 인스턴스 ref
- `drawingStore` → `tab.drawings` 통합
- `indicatorStore` → `tab.panes` 통합
- 폐기: `mobileMode`, `rightPanelTab`, `workspaceMode`, `chartSaveMode v1`

### API 신규
- `/api/tabs` — 탭 sync (선택)
- `/api/tabs/{id}/drawings`
- `/api/indicators/aggregated/{type}` (engine/)
- `/api/alerts`
- `/api/share/snapshot`
- `/api/news?symbol=`
- `/api/events`

### API 기존 wire 필요
- `/api/cogochi/alpha/scan` — callers 0 → AI Scan mode
- `pushBucketsFromResults()` — publisher 0 → scan 결과 hook

---

## Decisions (12 + 4 cross-cut)

| # | 항목 | 옵션 | 권장 | 상태 |
|---|---|---|---|---|
| 1 | 차트 lib | (a) lightweight-charts v5 panes (b) 자체 | **(a) option (c)** | **✅ W-T0 spike 확정**: native v5 paneIndex API 사용, paneLayoutStore = 메타데이터 전용. W-0399 재배선 불필요 |
| 2 | Drawing layer | (a) Canvas (b) SVG (c) 하이브리드 | **(b) SVG** | **✅ W-T0 spike 확정**: DrawingOverlay.svelte SVG overlay — Canvas 완전 교체. DOM hit-test + LWC 좌표 변환 |
| 3 | Aggregated 데이터 | (a) 자체 aggregator (b) Binance (c) Velo 외부 | **(a)** | W-T5 engine 백엔드 PR 별도, W-0404 Scan mode 와 데이터 owner 명확화 (cross-cut) |
| 4 | Tab 시스템 | (a) 도입 (b) 단일 차트 | **(a)** | W-T1 |
| 5 | Watchlist 위치 | (a) 우측 (b) 좌측 | **(a)** | W-T8 |
| 6 | AI 패널 폭 | (a) 360 고정 (b) resize | **(b)** | W-T6 |
| 7 | Bottom drawer | (a) 폐기 (b) Execute toggle | **(b)** | W-T10 |
| 8 | Scan 카드 클릭 | (a) 새 탭+차트 (b) 차트만 | **(a)** | W-T6 |
| 9 | Heatmap | (a) 토글+자연어 | **(a)** | W-T11 |
| 10 | Mode 4→1축 | (a) 3-state (b) 현행 | **(a)** | **W-0402 진행 중** — workMode 단일 정의 W-0402 owner. W-0407 는 consumer. cross-cut |
| 11 | Quick order | (a) floating (Execute) (b) Bottom (c) 후순위 | **(a)** | W-T10 |
| 12 | PropFirm Footer | (a) 박음 (b) 별도만 | **(a)** | W-T13 |

### Cross-cut Decisions (W-0413 §J9 — 4건)

| # | Cross-cut 대상 | 영향 | 처리 |
|---|---------------|------|------|
| **CC-1** | W-0399 multi-instance indicators (`clientIndicators.ts`) ↔ Decision #1 (v5 panes) | v5 마이그레이션 후 W-0399 산출물 재배선 필요 | W-T0 spike 시 `clientIndicators.ts` 호환성 측정. W-T2 PR body 에 재배선 plan 기록 |
| **CC-2** | W-0403 surface decomposition drawing layer ↔ Decision #2 (Canvas vs SVG) | drawing 결정이 W-0403 surface 분해와 정합 필요 | W-T0 spike 결과로 W-0403 doc 업데이트 (W-0407 owner 가 W-0403 PR 동시 발행) |
| **CC-3** | W-0404 AI NL Scan mode aggregated data ↔ Decision #3 (자체 aggregator) | aggregated data 소유권 — engine/ 가 owner, AI Scan 은 consumer | W-T5 PR body 에 W-0404 Scan mode contract (input/output schema) 명시 |
| **CC-4** | W-0402 Mode 4→1 axis (`workMode`) ↔ Decision #10 | W-0402 가 workMode store owner, W-0407 는 consumer | W-0402 머지 대기 — workMode 안정 후에야 W-T1 (TabBar) 진행. **W-0407 가 단독 정의 금지** |

---

## Cross-W File Lock 의존 (W-0413 §J8)

| 파일 | 충돌 W | W-0407 처리 순서 |
|------|--------|------------------|
| `lib/components/layout/AppTopBar.svelte` | W-0411 §K7 PR1 | **W-0411 PR1 → W-0407 W-T9** (settings + AC10 layout 먼저 확정) |
| `hubs/terminal/workspace/ChartBoardHeader.svelte` | W-0409 PR5 (`/lab` URL 교체) | **W-0409 PR5 → W-0407 W-T14** (URL 교체 후 폐기) |
| `hubs/terminal/workspace/SaveStrip.svelte` | 위 동일 | 위 동일 |
| `hubs/terminal/workspace/ChartBoard.svelte` | 위 동일 | 위 동일 |
| `hubs/cogochi/AiSearchBar.svelte` | W-0407 다수 PR (W-T6 + W-T9) | W-0407 내부 직렬 |
| `routes/cogochi/+page.svelte` | W-0407 다수 PR | W-0407 내부 직렬 |

→ W-T14 (orphan 일괄 삭제) 발급 시점 = **모든 cross-W URL 교체 PR 머지 후** (W-0409 PR5 + W-0411 PR1 + W-0408 cross-page mount 완료 시점).

---

## PR 분할 (15 phase) — Wave 매핑 + 게이트 명시

| PR | 범위 | 의존 | Wave (W-0413 §J12) | 게이트 |
|---|---|---|--------------------|--------|
| W-T0 | spike: lightweight-charts v5 + drawing layer 결정 + 탭 swap POC + paneLayoutStore 양립성 | — | **A0 (단독)** | **Spike Exit Gate (5항목)** — pass 안 나오면 W-T1 이후 발급 금지 |
| W-T1 | tabsStore + TabBar UI + 단일 탭 working | **T0 pass** | A | T0 게이트 통과 |
| W-T2 | ChartPane v5 마이그레이션 + 멀티 pane (paneLayoutStore 결정 반영) | **T0 pass**, W-0399 재배선 plan | A | T0 게이트 통과 + CC-1 plan |
| W-T3 | Drawing overlay layer (Canvas/SVG/하이브리드 결정 반영) + AIOverlayCanvas 흡수 | T0, T2 | B | CC-2 결정 + W-0403 sync PR |
| W-T4 | Range capture v2 + Verdict banner + Alert lines | T3 | B | — |
| W-T5 | Aggregated indicator API (engine/ 백엔드 PR **별도**) + fx 모달 frontend | T2, **engine PR 머지** | C | engine 백엔드 PR contract-stable |
| W-T6 | AI Agent 패널 자연어 router + 카드 + Scan mode (W-0404 Scan contract sync) | T1, W-0404 머지 | C | CC-3 contract |
| W-T7 | Tab N개 swap + 컨텍스트 보존 + URL sync | T1, T2, T3 | C | — |
| W-T8 | Watchlist 우측 + News + 그룹 | — | C | — |
| W-T9 | AppTopBar 통합 + 단축키 + Workspace 슬롯 | — | **E** (W-0411 PR1 후) | **W-0411 PR1 머지** (settings/AC10 먼저, W-0413 §J8) |
| W-T10 | Bottom drawer + Quick order + Position tool | T9 | E | — |
| W-T11 | Replay + Compare + Heatmap + Volume profile | T2, T3 | E | — |
| W-T12 | Mobile 통합 | T1~T10 | E | — |
| W-T13 | Footer + Telegram/Binance API 통합 | T9 | E | — |
| W-T14 | orphan 일괄 정리 (15+ 컴포넌트 삭제 — ChartBoardHeader/SaveStrip/ChartBoard 포함) | 전부 + **W-0409 PR5 + W-0411 PR1** | **E (마지막)** | 모든 cross-W URL 교체 완료 (W-0413 §J8) |

---

## Spike (W-T0) Exit Gate — 5 + 보강 필수 항목

다음 항목 **전부** 통과해야 Wave A (W-T1, W-T2) 진입. 하나라도 실패 시 W-0407 재설계 또는 결정 옵션 변경.

### 핵심 기술 검증
- [x] **(a) v5 양립**: `addSeries(type, opts, paneIndex)` + `panes()[idx].setStretchFactor()` — LWC v5 API 이미 전면 사용. `^5.1.0` (resolved 5.2.0), 충돌 없음
- [x] **(b) panes API**: implicit 생성 via addSeries 3rd arg. **Decision #1 확정: option (c)** — v5 panes native, paneLayoutStore = visibility/stretch 메타데이터 전용
- [x] **(c) drawing layer 결정**: **Decision #2 확정: SVG overlay** (DrawingOverlay.svelte) — Canvas 완전 교체. DOM 이벤트 hit-test, `timeToCoordinate()`/`priceToCoordinate()` 좌표 변환
- [x] **(d) AI + user 동일 레이어**: DrawingOverlay가 `chartAIOverlay` store + `drawingMgr` 동일 SVG 컨테이너에 z-order 분리 렌더
- [x] **(e) 탭 swap**: W-T7에서 `drawings:${tabId}:${sym}:${tf}` per-tab drawing 격리 + legacy migration 완료

### Cross-cut 검증 (W-0413 §J9)
- [x] **CC-1**: W-0399 indicators — `mountIndicatorPanes.ts`가 v5 paneIndex API 사용, W-0399 multi-instance 패턴 호환. 재배선 추가 PR 불필요
- [x] **CC-2**: SVG DrawingOverlay 확정 → W-0403 drawing layer 결정과 정합
- [ ] **CC-3**: `/api/indicators/aggregated/{type}` schema 초안 — W-T5 착수 시 작성 예정
- [x] **CC-4**: W-0402 머지 완료 (SHA 654c230b), workMode stable — W-T1 이미 진행 중

### 비기능 요구
- [ ] **SSR**: lightweight-charts 는 browser-only — `+page.svelte` 의 `browser` guard 전략 명시 (`onMount` lazy import 또는 `if (browser)`). SSR 시 chart skeleton/placeholder 렌더 정의
- [ ] **Perf**: LCP < 2.5s 유지 (W-0413 IAC15), 차트 mount < 500ms (cold), 탭 swap < 200ms (warm). spike 시 Lighthouse + DevTools profiler 측정
- [ ] **Drawing 저장 API**: `/api/tabs/{id}/drawings` GET/PUT contract 초안 — autosave debounce 1s, 오프라인 시 localStorage fallback
- [ ] **Error boundary**: 차트 mount 실패 시 fallback UI 정의 (탭 자체는 살리고 차트만 error placeholder), Sentry/console error 로깅 hook
- [ ] **버전 pin**: `app/package.json` `lightweight-charts ^5.1.0` → `~5.2.0` (caret→tilde) 변경 검토 — minor drift 방지

### Gate 통과 산출물
1. POC repo branch (commit URL) — 5 항목 모두 작동 영상/스크린샷
2. 결정 기록 — Decision #1 / #2 / paneLayoutStore 옵션 a/b/c 확정
3. W-T1~W-T14 PR scope 변경 사항 (있을 경우 doc patch)
4. CC-1~CC-4 cross-cut plan (재배선 PR 수, contract schema, 머지 순서)
5. SSR / perf / drawing API / error boundary 4 비기능 spec

→ Gate 통과 후에야 W-T1, W-T2 work item 발급. **부분 통과 (예: drawing 미결정) 시 W-T3 만 보류, W-T1+W-T2 는 진행 가능**.

## References

- velo.xyz (Velo 멀티 pane UX 레퍼런스)
- lightweight-charts v5 panes API: https://tradingview.github.io/lightweight-charts/docs/panes
- W-0402 — terminal-cogochi-redesign (foldable panels)
- W-0403 — cogochi-surface-decomposition
- W-0404 — ai-agent-nl-interface (multi-provider litellm)
- W-0399 — multi-instance indicators (clientIndicators.ts)

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
