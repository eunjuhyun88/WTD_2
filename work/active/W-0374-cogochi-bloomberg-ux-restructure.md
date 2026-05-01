# W-0374 — Cogochi Bloomberg-Grade UX Restructure (5-Hub Layout 재배치 + TradingView 차트)

> Wave: 5 | Priority: P1 | Effort: L (15-20일)
> Charter: §In-Scope (IA Consolidation + Chart UX, 2026-05-01 Frozen 해제 후)
> Status: 🟡 Design Draft
> Parent: W-0372 Phase D 확장판
> Created: 2026-05-01
> Owner: app
> Persona: Jin (퀀트 트레이더 + 창업자, 첫 진입 → 내 현황 → 차트 작업 → 패턴 캡처 → 결정)

---

## 0. Goal (1줄)

50+ Terminal 컴포넌트와 70+ Indicator Registry를 5-Hub 안에 Bloomberg Terminal급 정보 위계 + TradingView급 차트 UX로 재배치한다. 사용자가 한 화면에서 가격 / 인디케이터 / Decision / Pattern / Verdict / Watch를 동시에 보고, 드래그 한 번으로 패턴 매칭이 AI agent 패널에 떠야 한다.

비-목표: 기능을 새로 만들지 않는다. 이미 있는 50+ 컴포넌트, 70+ 인디케이터, 50+ API endpoint를 적절한 zone에 정확히 배치만 한다.

---

## 1. 1차 — 전체 기능 인벤토리 (빠진 것 없이)

> 원칙: "지금까지 페이지 안 레이아웃 그대로 두고 기능만 꽂았음"의 반대 — 모든 기능을 먼저 빠짐없이 나열한다. 분류는 2차에서 한다.

### 1.1 차트 영역 기능 (Chart Surface)

| # | 기능 | 출처 컴포넌트/파일 | 현재 상태 | 비고 |
|---|---|---|---|---|
| C1 | 차트 grid 레이아웃 | `app/src/lib/cogochi/components/ChartGridLayout.svelte` | 존재 | 다중 차트 grid |
| C2 | 멀티 페인 차트 | `app/src/lib/cogochi/components/MultiPaneChart.svelte` | 존재 | price + sub pane stack |
| C3 | 차트 보드 | `app/src/lib/cogochi/components/ChartBoard.svelte` | 존재 | 차트 컨테이너 |
| C4 | 차트 보드 헤더 | `app/src/lib/cogochi/components/ChartBoardHeader.svelte` | 존재 | symbol/tf/24h |
| C5 | 차트 캔버스 | `app/src/lib/cogochi/components/ChartCanvas.svelte` | 존재 | 실제 candle 렌더 |
| C6 | 차트 페인 단위 | `app/src/lib/cogochi/components/ChartPane.svelte` | 존재 | 단일 pane |
| C7 | 차트 SVG (구버전) | `app/src/lib/cogochi/components/ChartSvg.svelte` | 폐기 예정 | lightweight-charts로 교체 |
| C8 | Pane info bar | `app/src/lib/cogochi/components/PaneInfoBar.svelte` | 존재 | pane별 인디케이터 이름+값 |
| C9 | Indicator pane stack | `app/src/lib/cogochi/components/IndicatorPaneStack.svelte` | 존재 | 추가된 인디케이터 stack |
| C10 | Mini indicator chart | `app/src/lib/cogochi/components/MiniIndicatorChart.svelte` | 존재 | sparkline용 |
| C11 | Phase chart | `app/src/lib/cogochi/components/PhaseChart.svelte` | 존재 | phase visualization |
| C12 | Chart toolbar | `app/src/lib/cogochi/components/ChartToolbar.svelte` | 존재 | 차트 상단 toolbar |
| C13 | Chart metric strip | `app/src/lib/cogochi/components/ChartMetricStrip.svelte` | 존재 | KPI strip |
| C14 | Board toolbar | `app/src/lib/cogochi/components/BoardToolbar.svelte` | 존재 | 보드 단위 toolbar |
| C15 | Sparkline | `app/src/lib/cogochi/components/Sparkline.svelte` | 존재 | inline sparkline |
| C16 | Symbol picker | `app/src/lib/cogochi/components/SymbolPicker.svelte` | 존재 | 심볼 선택 |
| C17 | Symbol picker sheet (mobile) | `app/src/lib/cogochi/components/SymbolPickerSheet.svelte` | 존재 | bottom sheet |
| C18 | Indicator settings sheet | `app/src/lib/cogochi/components/IndicatorSettingsSheet.svelte` | 존재 | per-pane settings |
| C19 | DataFeed | `app/src/lib/cogochi/chart/DataFeed.ts` | 존재 | timeframes 1m~1D |
| C20 | DrawingManager | `app/src/lib/cogochi/chart/DrawingManager.ts` | 존재 | 드로잉 관리 |
| C21 | Per-pane indicator | `app/src/lib/cogochi/chart/paneIndicators.ts` | W-0304 진행 | pane scoping |
| C22 | MTF align | `app/src/lib/cogochi/chart/mtfAlign.ts` | 존재 | multi-tf 정렬 |
| C23 | Chart coordinates | `app/src/lib/cogochi/chart/chartCoordinates.ts` | 존재 | 좌표 변환 |
| C24 | Analysis primitives | `app/src/lib/cogochi/chart/analysisPrimitives.ts` | 존재 | 분석 helper |
| C25 | Chart trade planner | `app/src/lib/cogochi/chart/chartTradePlanner.ts` | 존재 | 차트→trade plan |
| C26 | Live tick state | `app/src/lib/cogochi/chart/liveTickState.svelte.ts` | 존재 | live tick |
| C27 | WebSocket pool | `app/src/lib/cogochi/chart/wsPool.ts` | 존재 | WS 풀 |
| C28 | Price lines hook | `app/src/lib/cogochi/chart/usePriceLines.ts` | 존재 | price line |
| C29 | Chart indicators meta | `app/src/lib/cogochi/chart/chartIndicators.ts` | 존재 | indicator registry |
| C30 | Chart metrics | `app/src/lib/cogochi/chart/chartMetrics.ts` | 존재 | metric calc |
| C31 | Chart helpers | `app/src/lib/cogochi/chart/chartHelpers.ts` | 존재 | util |
| C32 | Chart types | `app/src/lib/cogochi/chart/chartTypes.ts` | 존재 | type def |
| C33 | useChartDataFeed | `app/src/lib/cogochi/chart/useChartDataFeed.svelte.ts` | 존재 | feed hook |
| C34 | Pane current values | `app/src/lib/cogochi/chart/paneCurrentValues.ts` | 존재 | crosshair value |
| C35 | KPI strip | `app/src/lib/cogochi/chart/kpiStrip.ts` | 존재 | KPI 계산 |
| C36 | AI overlay store | `app/src/lib/cogochi/stores/chartAIOverlay.ts` | 존재 | `setAIOverlay`, `AIPriceLine` |
| C37 | Chart save mode store | `app/src/lib/cogochi/stores/chartSaveMode.ts` (추정) | 존재 | drag-to-save |
| C38 | Drawing canvas | `app/src/lib/cogochi/components/DrawingCanvas.svelte` | 존재 | 드로잉 layer |
| C39 | Drawing toolbar | `app/src/lib/cogochi/components/DrawingToolbar.svelte` | 존재 | 드로잉 툴 |
| C40 | Timeframe list | `DataFeed.ts::TIMEFRAMES` | 존재 | 1m/3m/5m/15m/30m/1h/4h/1D |
| C41 | Chart type | (신규) `chartTypes.ts::ChartType` | 신규 | candle/line/HA/bar/area |
| C42 | Crosshair sync | (신규) `MultiPaneChart.svelte::syncCrosshair` | 부분 | rAF throttle 미적용 |
| C43 | Replay button | (신규) | 미존재 | 후속 |
| C44 | Screenshot | (신규) | 미존재 | dom-to-image |
| C45 | Zoom (mouse wheel) | lightweight-charts 내장 | 존재 | OK |
| C46 | Pan (drag x-axis) | lightweight-charts 내장 | 존재 | OK |
| C47 | OHLCV crosshair info | `paneCurrentValues.ts` | 존재 | 우상단 표시 |
| C48 | Volume sub-pane | `IndicatorPaneStack.svelte` | 존재 | 기본 표시 |
| C49 | Right margin reservation | lightweight-charts 옵션 | OK | 80px |
| C50 | Time axis label | lightweight-charts 옵션 | OK | KST |
| C51 | Drawing 영구 저장 | `DrawingManager.ts::persistToDb` (추정) | 미확인 | 후속 |
| C52 | Indicator favorite | (신규) localStorage | 신규 | 즐겨찾기 |
| C53 | Indicator search | `findIndicatorByQuery` (`AIPanel.svelte` 내) | 존재 | aiSynonyms 매치 |
| C54 | Live price line | `usePriceLines.ts` | 존재 | last close |
| C55 | Chart save mode toggle | `chartSaveMode.ts` | 존재 | drag mode flag |

### 1.2 AI Agent / Decision 영역

| # | 기능 | 출처 | 현재 상태 | 비고 |
|---|---|---|---|---|
| A1 | AIPanel (cogochi 통합) | `app/src/lib/cogochi/components/AIPanel.svelte` | 존재 | indicator search + AI overlay |
| A2 | AIAgentPanel (terminal peek) | `app/src/lib/terminal/peek/AIAgentPanel.svelte` | 존재 | drawer 패턴 후보 |
| A3 | DecisionHUD | `app/src/lib/terminal/components/DecisionHUD.svelte` | 존재 | verdict 표면 |
| A4 | LiveDecisionHUD (canonical W-0331) | `app/src/lib/components/hud/LiveDecisionHUD.svelte` | 존재 | hud unification 결과 |
| A5 | ResearchPanel | `app/src/lib/terminal/components/ResearchPanel.svelte` | 존재 | freeform notes |
| A6 | JudgePanel | `app/src/lib/terminal/peek/JudgePanel.svelte` | 존재 | 진입/회피 결과 |
| A7 | WhyPanel | `app/src/lib/terminal/components/WhyPanel.svelte` | 존재 | 이유 분해 |
| A8 | EvidenceCard | `app/src/lib/terminal/components/EvidenceCard.svelte` | 존재 | 증거 카드 |
| A9 | EvidenceGrid | `app/src/lib/terminal/components/EvidenceGrid.svelte` | 존재 | grid 표시 |
| A10 | SourcePill | `app/src/lib/terminal/components/SourcePill.svelte` | 존재 | source chip |
| A11 | SourceRow | `app/src/lib/terminal/components/SourceRow.svelte` | 존재 | source row |
| A12 | VerdictCard | `app/src/lib/terminal/components/VerdictCard.svelte` | 존재 | verdict 카드 |
| A13 | VerdictHeader | `app/src/lib/terminal/components/VerdictHeader.svelte` | 존재 | verdict 헤더 |
| A14 | VerdictBanner | (terminal) | 존재 | 큰 verdict 배너 |
| A15 | F60GateBar | `app/src/lib/terminal/components/F60GateBar.svelte` | 존재 | F-60 gate 시각화 |
| A16 | StructureExplainViz | `app/src/lib/terminal/components/StructureExplainViz.svelte` | 존재 | 구조 설명 시각화 |
| A17 | AssetInsightCard | `app/src/lib/terminal/components/AssetInsightCard.svelte` | 존재 | 자산 insight |
| A18 | KpiCard | `app/src/lib/terminal/components/KpiCard.svelte` | 존재 | KPI 카드 |
| A19 | KpiStrip | `app/src/lib/terminal/components/KpiStrip.svelte` | 존재 | KPI 스트립 |
| A20 | FreshnessBadge | `app/src/lib/terminal/components/FreshnessBadge.svelte` | 존재 | 데이터 최신도 |
| A21 | AIParserModal | (terminal) | 존재 | AI parser modal |
| A22 | AI Search input (CommandBar) | `app/src/lib/cogochi/components/CommandBar.svelte` | 존재 | ⌘K |
| A23 | CommandPalette | `app/src/lib/cogochi/components/CommandPalette.svelte` | 존재 | full palette |
| A24 | TerminalCommandBar | `app/src/lib/terminal/components/TerminalCommandBar.svelte` | 존재 | terminal 전용 |
| A25 | AIOverlay 차트 그리기 | `chartAIOverlay.ts::setAIOverlay` | 존재 | Claude-style line + annotation |
| A26 | findIndicatorByQuery | (in AIPanel) | 존재 | aiSynonyms |
| A27 | analyze API | `POST /api/analyze` | 존재 | 분석 |
| A28 | cogochi/analyze API | `POST /api/cogochi/analyze` | 존재 | cogochi 분석 |
| A29 | DecisionHUD VM (panelAdapter) | engine `/captures` 응답 → VM | 존재 | W-0309 wired |
| A30 | Captures fetch | `GET /api/captures?pattern_slug=` | 존재 | DecisionHUD 데이터 |
| A31 | Direction badge | `DirectionBadge.svelte` | 존재 | LONG/SHORT/AVOID |
| A32 | TerminalContextPanel | `app/src/lib/terminal/components/TerminalContextPanel.svelte` | 존재 | 우측 context |
| A33 | TerminalContextPanelSummary | (terminal) | 존재 | 요약 |
| A34 | RightRailPanel | `app/src/lib/terminal/peek/RightRailPanel.svelte` | 존재 | rail panel |
| A35 | PeekDrawer | `app/src/lib/terminal/peek/PeekDrawer.svelte` | 존재 | peek drawer |
| A36 | CenterPanel | `app/src/lib/terminal/peek/CenterPanel.svelte` | 존재 | center peek |
| A37 | IndicatorPanel (peek) | `app/src/lib/terminal/peek/IndicatorPanel.svelte` | 존재 | indicator peek |

### 1.3 Pattern / Verdict 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| P1 | PatternLibraryPanel | `app/src/lib/terminal/components/PatternLibraryPanel.svelte` | 패턴 라이브러리 |
| P2 | PatternSeedScoutPanel | `app/src/lib/terminal/components/PatternSeedScoutPanel.svelte` | seed scout |
| P3 | PatternClassBreakdown | `app/src/lib/components/hud/PatternClassBreakdown.svelte` | class 분해 |
| P4 | VerdictInboxPanel | `app/src/lib/terminal/peek/VerdictInboxPanel.svelte` | watch hits inbox |
| P5 | DraftFromRangePanel | `app/src/lib/terminal/components/DraftFromRangePanel.svelte` | range → draft |
| P6 | SaveSetupModal | `app/src/lib/terminal/components/SaveSetupModal.svelte` | setup 저장 |
| P7 | SaveStrip | `app/src/lib/terminal/components/SaveStrip.svelte` | 저장 strip |
| P8 | PineScriptGenerator | `app/src/lib/terminal/components/PineScriptGenerator.svelte` | Pine 생성 |
| P9 | StrategyCard | (terminal) | 전략 카드 |
| P10 | CompareWithBaselineToggle | (terminal) | 베이스라인 비교 toggle |
| P11 | WorkspaceCompareBlock | (terminal) | compare block |
| P12 | PatternRecall (buildPatternRecallMatches) | engine `/api/patterns/recall` (또는 captures range query) | 핵심 |
| P13 | Captures POST | `POST /api/captures` | drag → save |
| P14 | Patterns library API | `GET /api/patterns?...` | library 데이터 |
| P15 | Patterns lifecycle API | `/api/patterns/lifecycle` | lifecycle |
| P16 | Patterns benchmark API | `/api/patterns/benchmark` | benchmark |
| P17 | Patterns search API | `/api/patterns/search` | search |
| P18 | Patterns strategies API | `/api/patterns/strategies` | strategies |

### 1.4 Watchlist / Symbol 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| W1 | WatchlistRail (cogochi) | `app/src/lib/cogochi/components/WatchlistRail.svelte` | Phase C fold/add/del |
| W2 | TerminalLeftRail | `app/src/lib/terminal/components/TerminalLeftRail.svelte` | terminal rail |
| W3 | TerminalRightRail | `app/src/lib/terminal/components/TerminalRightRail.svelte` | terminal right |
| W4 | WatchToggle | (terminal) | watch on/off toggle |
| W5 | WhaleWatchCard | `app/src/lib/terminal/components/WhaleWatchCard.svelte` | whale 알림 |
| W6 | SymbolPicker | C16 (위) | symbol 선택 |
| W7 | Watchlist API | `/api/cogochi/alerts`, `/api/preferences?key=watchlist` | sync |
| W8 | Sparkline 미니 | C15 | rail 안 |
| W9 | Whale alerts API | `/api/cogochi/alerts` | whale |
| W10 | Whale data | `/api/cogochi/whales` | whale |

### 1.5 Workspace / Mode 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| WS1 | AppShell | `app/src/lib/cogochi/components/AppShell.svelte` | shell 골조 |
| WS2 | WorkspaceStage | `app/src/lib/cogochi/components/WorkspaceStage.svelte` | 작업 stage |
| WS3 | WorkspaceGrid | `app/src/lib/terminal/components/WorkspaceGrid.svelte` | grid |
| WS4 | WorkspacePanel | `app/src/lib/terminal/components/WorkspacePanel.svelte` | panel |
| WS5 | WorkspacePresetPicker | `app/src/lib/cogochi/components/WorkspacePresetPicker.svelte` | preset |
| WS6 | TabBar | `app/src/lib/cogochi/components/TabBar.svelte` | 탭 바 |
| WS7 | Splitter | `app/src/lib/cogochi/components/Splitter.svelte` | 좌우 분할 |
| WS8 | Sidebar | `app/src/lib/cogochi/components/Sidebar.svelte` | 사이드바 (legacy) |
| WS9 | ModeSheet | `app/src/lib/cogochi/components/ModeSheet.svelte` | mode 선택 |
| WS10 | ModeToggle | `app/src/lib/components/hud/ModeToggle.svelte` | mode toggle |
| WS11 | TradeMode | `app/src/lib/cogochi/modes/TradeMode.svelte` | trade mode |
| WS12 | TrainMode | `app/src/lib/cogochi/modes/TrainMode.svelte` | train mode |
| WS13 | RadialTopology | `app/src/lib/cogochi/modes/RadialTopology.svelte` | radial mode |
| WS14 | SplitPaneLayout | `app/src/lib/components/hud/SplitPaneLayout.svelte` | split layout |
| WS15 | LibrarySection | `app/src/lib/cogochi/sections/LibrarySection.svelte` | section |
| WS16 | RulesSection | `app/src/lib/cogochi/sections/RulesSection.svelte` | section |
| WS17 | VerdictsSection | `app/src/lib/cogochi/sections/VerdictsSection.svelte` | section |
| WS18 | SectionHeader | `app/src/lib/cogochi/sections/SectionHeader.svelte` | section header |
| WS19 | SingleAssetBoard | (terminal) | 단일 자산 보드 |
| WS20 | TerminalHeaderMeta | `app/src/lib/terminal/components/TerminalHeaderMeta.svelte` | 헤더 메타 |
| WS21 | TerminalBottomDock | `app/src/lib/terminal/components/TerminalBottomDock.svelte` | 하단 dock |
| WS22 | CollectedMetricsDock | `app/src/lib/terminal/components/CollectedMetricsDock.svelte` | 수집 metric dock |
| WS23 | ActionStrip | `app/src/lib/terminal/components/ActionStrip.svelte` | 액션 strip |
| WS24 | ScanGrid | `app/src/lib/terminal/peek/ScanGrid.svelte` | scan grid |
| WS25 | terminalLayoutController | `app/src/lib/terminal/terminalLayoutController.ts` | layout 제어 |

### 1.6 Status / Meta / News 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| S1 | StatusBar | `app/src/lib/cogochi/components/StatusBar.svelte` | 하단 status |
| S2 | NewsFlashBar | `app/src/lib/terminal/components/NewsFlashBar.svelte` | news flash |
| S3 | F60GateBar | A15 | F-60 gate |
| S4 | FreshnessBadge | A20 | freshness |
| S5 | TerminalHeaderMeta | WS20 | 메타 |
| S6 | KpiStrip | A19 | KPI |
| S7 | MobileTopBar | `app/src/lib/cogochi/components/MobileTopBar.svelte` | 모바일 상단 |
| S8 | MobileFooter | `app/src/lib/cogochi/components/MobileFooter.svelte` | 모바일 하단 |
| S9 | News API | `/api/cogochi/news` | 뉴스 |
| S10 | Fear & Greed | `/api/feargreed` | F&G |
| S11 | Macro | `/api/macro` | 매크로 |
| S12 | Senti | `/api/senti` | 센티 |
| S13 | Wallet status | `/api/wallet` | wallet dot |
| S14 | Notifications | `/api/notifications` | 알림 |

### 1.7 Drawing / Annotation / Range 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| D1 | DrawingCanvas | C38 | 드로잉 layer |
| D2 | DrawingToolbar | C39 | 드로잉 툴 |
| D3 | DrawingManager | C20 | 드로잉 관리 |
| D4 | SaveSetupModal | P6 | setup 저장 |
| D5 | SaveStrip | P7 | 저장 strip |
| D6 | DraftFromRangePanel | P5 | range → draft |
| D7 | chartSaveMode store | C37 | drag mode |
| D8 | chart/notes API | `/api/chart/notes` | 노트 |
| D9 | Captures POST | P13 | drag → DB |

### 1.8 외부 통합 영역 (Frozen 일부, 디스플레이만)

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| X1 | GMX trade panel | (terminal) `GmxTradePanel.svelte` | display only |
| X2 | Polymarket bet panel | (terminal) `PolymarketBetPanel.svelte` | display only |
| X3 | WarRoom | (terminal) | display only |
| X4 | IntelPanel | (terminal) | intel display |
| X5 | intelHelpers | (terminal) | helper |
| X6 | terminalHelpers | (terminal) | helper |
| X7 | Telegram | `/api/telegram` | 알림 |
| X8 | Etherscan | `/api/etherscan` | onchain |
| X9 | Coinglass / Coinalyze | `/api/coinalyze` | derivatives |
| X10 | Polymarket API | `/api/polymarket` | display |
| X11 | GMX API | `/api/gmx` | display |
| X12 | Yahoo | `/api/yahoo` | macro |

### 1.9 Pages / Routes

| Route | 현재 | 5-Hub 매핑 후 |
|---|---|---|
| `/dashboard` | 지갑 | Hub-1 Home (재목적, 사용자 현황) |
| `/cogochi` | terminal-lite | Hub-2 Terminal (★ 핵심) |
| `/terminal` | 풀 terminal | redirect → `/cogochi` |
| `/agent` | AI agent 별도 | redirect → `/cogochi?panel=decision` |
| `/scanner` | scanner | redirect → `/cogochi?panel=verdict` |
| `/market` | market | DELETE (Phase A) |
| `/patterns` | 5탭 | Hub-3 Patterns (Library/Strategies/Benchmark/Lifecycle/Search) |
| `/lab` | 3탭 | Hub-4 Lab (Backtest/AI Analysis/PineScript) |
| `/settings` | 3탭 | Hub-5 Settings (Settings/Passport/Status) |
| `/verdict/[id]` | 외부 share | KEEP (외부 link 용) |

### 1.10 Indicator Registry 카테고리 (70+)

| Family | 갯수 | 대표 |
|---|---|---|
| OI | 3+ | oi_change_1h, oi_change_4h, oi_per_venue |
| Funding | 4+ | funding_rate, predicted_funding, funding_skew |
| On-chain | 21 | exchange_reserve, exchange_netflow, mvrv_zscore, nupl, sopr, lth_sopr, active_addresses, realized_price, sth_cost_basis, coinbase_premium, whale_ratio, miner_outflow, ssr, nvt_ratio, hodl_waves, accumulation_trend_score, supply_in_profit, realized_pl, exchange_inflow, exchange_outflow |
| Derivatives | 7+ | open_interest, long_short_ratio, liquidation_heatmap, cvd, perps_volume, basis_spread, oi_btc |
| DeFi | 10+ | tvl, dex_volume, unique_swappers, volume_tvl_ratio, fees_generated, top_token_pairs, dex_market_share, token_unlocks, bridge_volume, stablecoin_mcap |
| Technical | 25+ | rsi, macd, bb, stoch, atr, adx, ichimoku, etc. |
| Custom | 사용자 | 사용자 정의 |

전부 `aiSynonyms`(한+영) + `aiExampleQueries` 정의되어 있어 AI agent 검색 인덱스로 즉시 사용 가능.

### 1.11 API Endpoints (50+)

- **Captures / Patterns**: `/api/captures`, `/api/patterns`, `/api/patterns/recall`, `/api/patterns/lifecycle`, `/api/patterns/benchmark`, `/api/patterns/search`, `/api/patterns/strategies`
- **Chart**: `/api/chart/feed`, `/api/chart/klines`, `/api/chart/notes`
- **Cogochi**: `/api/cogochi/alerts`, `/api/cogochi/alpha`, `/api/cogochi/analyze`, `/api/cogochi/news`, `/api/cogochi/outcome`, `/api/cogochi/pine-script`, `/api/cogochi/terminal`, `/api/cogochi/thermometer`, `/api/cogochi/whales`, `/api/cogochi/workspace-bundle`
- **Decision / AI**: `/api/analyze`, `/api/agents/stats`, `/api/confluence`, `/api/cycles`, `/api/doctrine`, `/api/research`, `/api/refinement`, `/api/wizard`
- **Market data**: `/api/market`, `/api/klines`, `/api/exchange`, `/api/coingecko`, `/api/coinalyze`, `/api/onchain`, `/api/macro`, `/api/feargreed`, `/api/senti`, `/api/predictions`
- **Trade / Position**: `/api/positions`, `/api/portfolio`, `/api/quick-trades`, `/api/pnl`, `/api/propfirm`
- **External**: `/api/etherscan`, `/api/gmx`, `/api/polymarket`, `/api/yahoo`, `/api/telegram`
- **System**: `/api/dashboard`, `/api/engine`, `/api/lab`, `/api/live-signals`, `/api/memory`, `/api/notifications`, `/api/observability`, `/api/preferences`, `/api/profile`, `/api/progression`, `/api/runtime`, `/api/search`, `/api/signals`, `/api/terminal`, `/api/ui-state`, `/api/wallet`, `/api/facts`, `/api/pine`

총 1차 인벤토리: 145+ 항목.

---

## 2. 2차 — UX 배치 (어디에, 왜)

### 2.1 정보 위계 원칙 (Bloomberg-grade 3 레벨)

| Level | 정의 | 예시 | 컴포넌트 사례 |
|---|---|---|---|
| L1 | 항상 보임 (영역 정체성) | 가격, symbol, verdict 한 단어, wallet status | TopBar, ChartCanvas, StatusBar dot |
| L2 | 주변 인지 (peripheral) | sparkline, KPI 4개, freshness, news flash | Sparkline, KpiStrip, NewsFlashBar, FreshnessBadge |
| L3 | 요청 시 expand | drawer slide, modal, full panel | PeekDrawer, IndicatorSettingsSheet, SaveSetupModal |

원칙:
- 같은 화면에 L1은 7±2개 한도 (Miller's law)
- L2는 화면 가장자리 또는 strip 형태
- L3는 클릭/⌘K로만 호출

### 2.2 페르소나 Jin의 흐름과 hub 매핑

| 단계 | 사용자 행동 | 적합 hub | 적합 zone |
|---|---|---|---|
| 1 | 첫 진입 → 내 현황 확인 | Hub-1 Home | full page (지갑 + Passport + WATCHING) |
| 2 | 차트 작업 (BTC 1h 분석) | Hub-2 Terminal | center (MultiPaneChart) |
| 3 | 인디케이터 추가 (OI 4h) | Hub-2 Terminal | left-rail Indicator Library 또는 ⌘L |
| 4 | 차트 위 영역 드래그 → 패턴 매칭 | Hub-2 Terminal | drag → AI agent panel Pattern tab |
| 5 | Decision verdict 확인 | Hub-2 Terminal | AI agent panel Decision tab |
| 6 | 패턴 라이브러리 확인 / 백테스트 | Hub-3 Patterns / Hub-4 Lab | hub 전환 |
| 7 | 설정 / 시스템 상태 | Hub-5 Settings | hub 전환 |

### 2.3 Hub별 배치 매핑

#### Hub 1 — Home (`/dashboard`)

목적: "내 현황" 5초 안에 파악. 차트/AI/패턴은 여기 없음 (역할 분리).

| Zone | 크기 | 컴포넌트 | Level | 이유 |
|---|---|---|---|---|
| Hero (top) | 100vw × 200px | Wallet 요약 + Passport tier + WATCHING count | L1 | 진입 즉시 정체성 |
| Today strip | 100vw × 80px | KpiStrip (24h 전체 PnL, 활성 패턴, watch hits, KP score) | L2 | 오늘 요약 |
| WATCHING | 50vw × auto | VerdictInboxPanel (요약 모드) | L2 | 즉각 액션 가능 |
| KimchiPremium | 50vw × auto | KimchiPremiumBadge (large) | L2 | 한국 트레이더 핵심 |
| OpportunityScore | 100vw × 240px | ScanGrid (top 10) | L2 | 기회 발견 |
| Quick Action | 우상단 sticky | "Open Terminal" 버튼 | L1 | 다음 hub로 이동 |

#### Hub 2 — Terminal (`/cogochi`) ★★★ 핵심

목적: 차트 + Decision + Pattern + Verdict 모두 한 화면. Bloomberg + TradingView fusion.

5-Zone 구조 (CSS grid):

```
grid-template-rows: 48px 28px 1fr 32px;
grid-template-columns: 200px 40px 1fr 320px;

zones:
  top-bar      / top-bar      / top-bar      / top-bar
  news-flash   / news-flash   / news-flash   / news-flash
  watchlist    / drawing-tool / chart-stage  / ai-agent
  status-bar   / status-bar   / status-bar   / status-bar
```

| Zone | 크기 | 컴포넌트 | Level | 이유 |
|---|---|---|---|---|
| top-bar | 100vw × 48px | Symbol search + price + 24h + TF picker + Wallet dot + Tier badge | L1 | 항상 보임 |
| news-flash | 100vw × 28px (dismissable) | NewsFlashBar | L2 | 큰 뉴스 즉각 |
| watchlist | 200px (foldable to 56px) | WatchlistRail | L1 | 항상 보임, 다른 심볼 즉시 클릭 |
| drawing-tool | 40px 세로 | DrawingToolbar | L2 | 아이콘만, 클릭으로 활성 |
| chart-stage | flex × flex | ChartToolbar + MultiPaneChart + IndicatorPaneStack + DrawingCanvas | L1 | 메인 |
| ai-agent | 320px (expand 480px) | 5-tab panel + drawer slide | L1+L3 | inline + expand |
| status-bar | 100vw × 32px | F60GateBar mini + Freshness + mini Verdict + system | L2 | peripheral |

내부 component props:
- `MultiPaneChart`: `{symbol, timeframe, panes: [pricePane, ...subPanes], drawings, aiOverlay}`
- `WatchlistRail`: `{items, foldedDefault, onSymbolSelect, onAdd, onDelete}`
- `AIAgentPanel`: `{activeTab, expanded, drawerContent, onDrawerOpen}`

#### Hub 3 — Patterns (`/patterns/*`)

목적: 패턴을 발견·관리·비교하는 도구함.

5탭 zone 구조 (TabBar 상단 고정):

| Tab | Zone 1 (left filter) | Zone 2 (center main) | Zone 3 (right detail) |
|---|---|---|---|
| Library | 카테고리 트리 (160px) | 패턴 그리드 (3열 카드) | 선택된 패턴 detail (320px) |
| Strategies | 전략 리스트 (240px) | StrategyCard grid | StrategyCard detail |
| Benchmark | 패턴 multi-select (240px) | 비교 차트 (line chart) | metric table |
| Lifecycle | 단계 필터 (160px) | 단계별 funnel chart | 단계 detail |
| Search | 검색 input + facets (240px) | 검색 결과 list | 결과 detail card |

#### Hub 4 — Lab (`/lab/*`)

목적: 실험 / 백테스트 / 코드 생성.

3탭 zone 구조:

| Tab | Zone 1 | Zone 2 | Zone 3 |
|---|---|---|---|
| Backtest | 파라미터 form (320px) | 결과 차트 + equity curve | metric panel + trades 테이블 |
| AI Analysis | freeform query (320px) + 히스토리 | analysis 결과 (markdown + 차트) | sources / citations |
| PineScript | template picker (240px) | PineScriptGenerator (code editor) | preview / export |

#### Hub 5 — Settings (`/settings/*`)

목적: 설정 / 정체성 / 시스템 상태 (peripheral).

3탭 zone 구조:

| Tab | Zone 1 | Zone 2 | Zone 3 |
|---|---|---|---|
| Settings | 카테고리 (200px) | 설정 form (flex) | 미사용 |
| Passport | level / track record | 통계 그리드 | progression |
| Status | system map (좌) | 모듈별 health (중앙) | logs (우, 280px) |

### 2.4 차트 영역 상세 UX (TradingView 급)

#### 2.4.1 Chart Toolbar (chart-stage 상단 36px)

레이아웃 (왼쪽부터):

```
[Candle ▾] | [+ Indicator] | [Drawing ▾] | [Replay] | [Screenshot] | [⚙ Settings] | ... [Save Setup] [Save Range]
```

- **Chart type dropdown** (Candle / Line / Heikin-Ashi / Bar / Area) — `chartTypes.ts::ChartType`
- **+ Indicator** 버튼 → 좌측 슬라이드 모달 (Indicator Library) 열림
- **Drawing dropdown** (또는 좌측 Drawing toolbar 활성)
- **Save Setup** → SaveSetupModal
- **Save Range** → 현재 visible range 캡처

(Timeframe picker는 top-bar에 둠 — 이유: 항상 보이는 영역에 두면 hub-1/hub-3에서도 활용 가능 + Bloomberg 패턴)

#### 2.4.2 Timeframe Picker (top-bar, 항상 보임)

```
[1m] [3m] [5m] [15m] [30m] [1h] [4h] [1D]   [Custom...]
```

- 클릭 즉시 `GET /api/chart/klines?symbol={s}&tf={tf}` 호출 (이미 존재)
- 키보드: 1=1m, 2=3m, 3=5m, 4=15m, 5=30m, 6=1h, 7=4h, 8=1D
- 활성 TF는 박스 + bold + 아래 underline

#### 2.4.3 Indicator Library (좌측 슬라이드 panel, 320px, ⌘L)

레이아웃:

```
┌─ Indicator Library ─────────────┐
│ [🔍 Search...]                  │
│ ☆ Favorites (8)                 │
│ ─────────────────────────────── │
│ ▼ OI (3)                        │
│   ☐ OI Change 1h                │
│   ☐ OI Change 4h                │
│   ☐ OI per Venue                │
│ ▼ Funding (4)                   │
│ ▼ On-chain (21)                 │
│ ▼ Derivatives (7)               │
│ ▼ DeFi (10)                     │
│ ▼ Technical (25)                │
│ ▼ Custom (n)                    │
│ ─────────────────────────────── │
│ Selected: 3                     │
│ [Add to Price Pane] [+ New Pane]│
└─────────────────────────────────┘
```

- 검색 input (debounce 100ms) — `findIndicatorByQuery` 재사용 (aiSynonyms 매치)
- 즐겨찾기 별표 (localStorage `cogochi.indicator.favorites`)
- 카테고리 expand/collapse (한 번에 한 개만 open by default)
- 추가 모드 2종:
  - **Add to Price Pane** → price pane 위 overlay
  - **+ New Pane** → IndicatorPaneStack에 새 sub-pane append
- 추가 후 panel 자동 close (또는 ⌘L 다시 누르면 close)

#### 2.4.4 Pane별 PaneInfoBar (각 pane 좌상단 24px)

```
[RSI(14) BTC/USDT 1h] 65.4  [⚙] [✕]
```

- 인디케이터 이름 + 파라미터 + 현재 값 (`paneCurrentValues.ts`)
- ⚙ 클릭 → IndicatorSettingsSheet 열림 (per-pane)
- ✕ 클릭 → pane 제거 (price pane은 제거 불가, ✕ disabled)

#### 2.4.5 Drawing Toolbar (좌측 세로 40px, 항상 보임)

```
┌──┐
│ ☐│ select
│ ╱│ trend line
│ ─│ horizontal line
│ ▭│ rectangle
│ Φ│ fibonacci
│ ╱╱│ pitchfork
│ T │ text
│ 📝│ note
│ ─│
│ ⤴│ undo
│ ⤵│ redo
│ 🗑│ clear
└──┘
```

- 기존 `DrawingToolbar.svelte` 활용
- 단축키: T(trend), H(hline), R(rect), F(fib), P(pitchfork), Esc(deselect)
- 드로잉 영구화: `DrawingManager.persistToDb` (후속) 또는 localStorage MVP

#### 2.4.6 Crosshair Multi-Pane Sync

- X축 시간 동기 (rAF throttle, 60fps 보장)
- 각 pane PaneInfoBar value도 crosshair 따라 갱신
- 우상단 OHLCV strip: `O 95,200 | H 95,800 | L 94,900 | C 95,650 | V 1.2K`

#### 2.4.7 ★ 드래그-to-save 흐름 (사용자 핵심 요구)

단계:

1. **Trigger**: 사용자가 차트 위에서 mousedown → mousemove → mouseup
   - `chartSaveMode` store가 `range = {symbol, tf, start_time, end_time}` 캡처
   - 시각적 피드백: 파란 반투명 rectangle overlay (DrawingCanvas 사용)
2. **Action choice**: 화면 중앙 상단에 토스트 (5초)
   ```
   ┌─ Range captured: 2026-04-30 14:00 → 16:00 (BTC 5m) ─┐
   │  [Save] [Find Pattern] [Draft Setup] [Cancel]      │
   └────────────────────────────────────────────────────┘
   ```
3. **Save** 클릭 → `POST /api/captures` body `{symbol, tf, start, end, label?}` → 성공 시 우측 패널 Pattern tab에 카드 추가
4. **Find Pattern** 클릭 → `POST /api/patterns/recall` body `{range, symbol, tf}` → 결과를 우측 패널 Pattern tab에 매칭 카드 list로 표시 + 차트 위 매칭된 과거 range들 점선 marker로 표시 (`setAIOverlay`)
5. **Draft Setup** 클릭 → DraftFromRangePanel slide-out
6. **Cancel** → range 해제

성능 목표: trigger → AI pattern recall 결과 표시 ≤ 500ms (p75)

#### 2.4.8 AI overlay (Claude-style 차트 그리기)

`chartAIOverlay.ts::setAIOverlay({type, payload})` 활용.

타입:
- **AIPriceLine**: 수평선 + label (예: "Resistance 96,000 (whale wall)")
- **AIRangeBox**: 시간 range box (예: "Similar pattern 2025-12-14 14:00 (+3.2% in 4h)")
- **AIArrow**: 시점 + 방향 + label
- **AIAnnotation**: text + tail line

AI 결과 → 즉시 차트에 그려짐 (Claude artifact 처럼 "그려준다"는 느낌).

### 2.5 AI Agent 패널 UX (탭 + drawer slide)

#### 2.5.1 구조

```
┌─ AI Agent Panel (320px default, expandable to 480px) ─┐
│ [Decision] [Pattern] [Verdict] [Research] [Judge]     │  ← 5 tabs (40px)
├──────────────────────────────────────────────────────┤
│ AI Search input ⌘L                                    │  ← 40px sticky
│ [▢ "Show me OI 4h"  →]                                │
├──────────────────────────────────────────────────────┤
│ Active Tab Content (scrollable)                       │
│  - inline 요약 카드 (Level-1)                         │
│  - "더 보기" 버튼 → drawer slide-out (Level-3)       │
│                                                       │
│  ...                                                  │
└──────────────────────────────────────────────────────┘
```

#### 2.5.2 5탭 컨텐츠

| Tab | Inline (L1) | Drawer (L3) | 출처 컴포넌트 | 데이터 소스 |
|---|---|---|---|---|
| Decision | DecisionHUD VM (verdict 1줄, direction badge, 핵심 evidence 3개) | EvidenceGrid (full) + WhyPanel + StructureExplainViz + SourceRow | LiveDecisionHUD, EvidenceCard, WhyPanel | `/api/captures?pattern_slug=` (W-0309 wired) |
| Pattern | PatternRecall match cards (top 5) + capturedRanges list | PatternLibraryPanel + PatternClassBreakdown | PatternLibraryPanel, PatternClassBreakdown | `/api/patterns/recall`, `/api/captures` |
| Verdict | VerdictInboxPanel rows (latest 10) | VerdictCard full + VerdictBanner + outcome | VerdictInboxPanel, VerdictCard | `/api/cogochi/alerts`, watch hits |
| Research | freeform notes + AI analysis 결과 요약 | ResearchPanel + AIParserModal | ResearchPanel | `/api/research`, `/api/cogochi/analyze` |
| Judge | 진입/회피 결과 KPI 카드 | JudgePanel full + outcome history | JudgePanel | `/api/cogochi/outcome` |

#### 2.5.3 Drawer Slide 패턴

- inline 카드 우상단 "→ 더 보기" 또는 카드 전체 클릭
- 우측에서 320px slide-in (총 width: panel 320 + drawer 320 = 640, mobile은 full-screen)
- drawer 닫기: Esc / 외부 클릭 / 헤더 ✕
- drawer 내용은 해당 tab의 full detail (위 표 L3 컬럼)

#### 2.5.4 AI Search input

위치: panel 상단 sticky (CommandBar 변형) + ⌘L 단축키 활성

쿼리 패턴 → 행동:
| Query 예시 | Intent | Action |
|---|---|---|
| "Show me OI 4h" | indicator add | findIndicatorByQuery → IndicatorPaneStack 추가 + AI overlay 안내선 |
| "Find similar pattern" | pattern recall | 현재 visible range 또는 마지막 capture range로 `/api/patterns/recall` |
| "5분봉으로 바꿔줘" | timeframe change | TF=5m으로 변경 |
| "BTC 96,000 저항 표시" | overlay | setAIOverlay AIPriceLine |
| "최근 whale 알림" | data fetch | `/api/cogochi/whales` → drawer table |
| "지금 long 들어가도 됨?" | analyze | `/api/cogochi/analyze` → Decision tab 갱신 |

응답 표면: 항상 active tab의 inline 카드 추가 + (필요시) 차트 AI overlay + (옵션) drawer auto-open.

### 2.6 정보 분류 표 (어디로 가야 하나)

| 정보 | 표시 위치 | Level | 이유 |
|---|---|---|---|
| 가격 / OHLC last | 차트 우상단 crosshair info | L1 | TradingView 표준 |
| Symbol | top-bar 좌측 + WatchlistRail 활성 | L1 | 항상 보임 |
| Timeframe | top-bar 중앙 + URL `?tf=` | L1 | 항상 보임 |
| 24h 변화 | top-bar Symbol 옆 | L1 | 항상 보임 |
| Indicator value (live) | PaneInfoBar | L2 | pane별 |
| Indicator settings | IndicatorSettingsSheet | L3 | 클릭 시 |
| AI agent 요약 | right-panel inline 카드 | L1 | tab 안 |
| AI agent detail | right-panel drawer slide | L3 | expand |
| Decision verdict (1줄) | StatusBar mini + Decision tab | L1 dual | 자주 봄 |
| Decision evidence | Decision tab inline + drawer | L2/L3 | 분리 |
| Watchlist | left-rail | L1 | 항상 보임 |
| Pattern hit (실시간) | 화면 중앙 토스트 3s + Verdict tab 영구 | L1 + persist | 즉각 + 영구 |
| News (속보) | NewsFlashBar (top-bar 아래 28px) | L2 | dismissable |
| Drawing | 차트 위 overlay | persist | 영구 (DB) |
| Captures (drag-saved) | Pattern tab + DB | persist | 영구 |
| Range AI overlay | 차트 위 layer | session | 일회성 |
| Wallet status | top-bar 우측 dot + Hub-5 | L1 + L3 | 항상 보임 |
| Tier badge | top-bar 우측 | L1 | 항상 보임 |
| System status | StatusBar 우측 + Hub-5 Status | L2 + L3 | minimal |
| F-60 gate | StatusBar mini + Decision drawer | L2 + L3 | 자주 X |
| KpiStrip (24h vol/OI/funding/dom) | top-bar 아래 또는 chart 상단 | L2 | 차트 컨텍스트 |
| Freshness | StatusBar + 각 데이터 옆 inline badge | L2 | per-data |
| Whale alert | WatchlistRail Whale 카드 + Verdict tab | L2 + L1 | 즉각 |
| GMX/Polymarket | display-only sidebar (옵션) | L3 | 외부 |
| Mode toggle | top-bar 우측 ModeToggle | L1 | 자주 |

### 2.7 정보가 어디로 가는지 (분류 흐름)

```
[데이터 소스]
   │
   ├─→ 차트 영역 (가격, OHLCV, 인디케이터, AI overlay, drawing)
   │
   ├─→ AI Agent 패널 (Decision / Pattern / Verdict / Research / Judge)
   │     ├─ inline 카드 (요약)
   │     └─ drawer (detail)
   │
   ├─→ Hub-1 Home (지갑 / Passport / WATCHING 요약 / KP / OS)
   │
   ├─→ Hub-3 Patterns (라이브러리 영구 저장소)
   │
   ├─→ Hub-4 Lab (실험 / 백테스트 / Pine 코드)
   │
   ├─→ Hub-5 Settings (설정 / 정체성 / 시스템 health)
   │
   ├─→ Top-bar (symbol, TF, wallet, tier, mode — 항상 보임)
   │
   ├─→ Status-bar (F60 mini, freshness, mini verdict, system)
   │
   ├─→ NewsFlashBar (속보, dismissable)
   │
   └─→ 토스트 (실시간 이벤트, 3-5초)
```

### 2.8 Mobile 분기 (≤ 768px)

- left-rail → 숨김 (햄버거 → bottom sheet)
- right-panel → bottom sheet 5-tab (탭 strip)
- chart → 단일 pane only (sub-pane은 swipe 또는 tab)
- drawing toolbar → chart 상단 가로 strip
- drawer slide → bottom-up sheet (full screen)
- 5-Hub 전환은 MobileBottomNav (5-hub)

---

## 3. 3차 — 최종 구조 (Wireframe + 코드 매핑)

### 3.1 Cogochi (Terminal Hub) Desktop Wireframe

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ TopBar (48px)                                                                │
│ ┌────────────┬─────────────────┬────────────────────────┬──────────────────┐ │
│ │[⌘K Search] │ BTC/USDT $95,650│ [1m][3m][5m][15m]      │ 🔵Wallet [Pro]  │ │
│ │            │ +1.2% / 24h     │ [30m][1h][4h][1D]      │ [Mode▾]          │ │
│ └────────────┴─────────────────┴────────────────────────┴──────────────────┘ │
├──────────────────────────────────────────────────────────────────────────────┤
│ NewsFlashBar (28px) — "BTC ETF flow +$420M" [×]                              │
├────────┬────┬───────────────────────────────────────────────┬────────────────┤
│Watch   │Drw │ ChartToolbar (36px)                           │ AI Agent (320) │
│list    │Tlb │ [Candle▾][+Indicator][Replay][Snap][⚙][Save]  │ [Dec][Pat][Ver]│
│Rail    │ ☐ │                                                │ [Res][Judge]   │
│(200px) │ ╱ ├───────────────────────────────────────────────┤ ─────────────  │
│        │ ─ │                                                │ AI Search ⌘L   │
│★ BTC   │ ▭ │  ChartCanvas Pane 1 (Candles, height: 50%)    │ [____________] │
│  $95k  │ Φ │  + AI overlay (lines, boxes)                   │ ─────────────  │
│  +1.2% │ ╱╱│  + DrawingCanvas overlay                        │ ┌─Active Tab─┐ │
│  ▁▂▄▆█│ T │  ┌──────PaneInfoBar──────────────┐              │ │ inline    │ │
│        │ 📝│  │ BTC/USDT 1h  O 95,200 H..C... │              │ │ cards     │ │
│  ETH   │ ─ │  └───────────────────────────────┘              │ │ + "더보기" │ │
│  $3.2k │ ⤴ │                                                │ │  → drawer │ │
│  +0.8% │ ⤵ ├───────────────────────────────────────────────┤ │           │ │
│  ▁▃▅▆██│ 🗑│  Pane 2 (RSI, height: 25%)                    │ │           │ │
│        │   │  PaneInfoBar: RSI(14) 65.4  [⚙][✕]            │ │           │ │
│  + Add │   │  IndicatorPaneStack                            │ └───────────┘ │
│        │   ├───────────────────────────────────────────────┤                │
│Whales  │   │  Pane 3 (OI 4h, height: 25%)                  │  drawer slide  │
│(collap)│   │  PaneInfoBar: OI 4h Change +5.2%  [⚙][✕]      │  out → 320px   │
│        │   │                                                │  expand 480    │
│        │   │  crosshair sync (rAF)                         │                │
├────────┴────┴───────────────────────────────────────────────┴────────────────┤
│ StatusBar (32px)                                                             │
│  F60 ▓▓▓▓░ 0.73 │ Freshness 12s │ mini Verdict: WAIT │ System: ●●●● healthy │
└──────────────────────────────────────────────────────────────────────────────┘
```

총 영역:
- top-bar 48 + news 28 + body (1f) + status 32 = 108px chrome
- body height = `100vh - 108px`

### 3.2 Cogochi Mobile Wireframe (≤ 768px)

```
┌──────────────────────┐
│ MobileTopBar (44px)  │
│ ☰ BTC ▾  5m▾  💰    │
├──────────────────────┤
│ NewsFlash (24px,     │
│  collapsible)        │
├──────────────────────┤
│ MultiPaneChart       │
│ (single price pane,  │
│  swipe to RSI/OI)    │
│  + AI overlay        │
│  height: 50vh        │
│                      │
├──────────────────────┤
│ Tab Strip (40px)     │
│ [W][Dec][Pat][Ver]   │
│ [Res][Jdg]           │
├──────────────────────┤
│ Tab Content          │
│ (full width,         │
│  scrollable)         │
│                      │
│  cards inline        │
│  "더보기" → bottom   │
│   sheet (full)       │
│                      │
├──────────────────────┤
│ MobileBottomNav (60) │
│ 🏠 📊 🎯 🧪 ⚙       │
└──────────────────────┘
   Drawing toolbar:
   chart 상단 가로 strip
   (40px, 좌→우 scrollable)
```

### 3.3 Hub별 Wireframe (간결)

#### Hub-1 Home `/dashboard`

```
┌────────────────────────────────────────────────────────────┐
│ TopBar: [Symbol🔍][TF irrelevant grayed][Wallet][Tier]     │
├────────────────────────────────────────────────────────────┤
│ ┌──Hero (200px) ──────────────────────────────────────┐  │
│ │ Wallet $5,420 | Passport: Pro | WATCHING: 3 active │  │
│ └─────────────────────────────────────────────────────┘  │
│ KpiStrip 80px: [24h PnL +2.3%][Active Patterns 5]       │
│                [Watch Hits 12][KP score 0.73]            │
├──────────────────────────────────┬─────────────────────────┤
│ WATCHING (50%)                   │ KimchiPremium (50%)     │
│ VerdictInboxPanel (compact)      │ Large badge + chart     │
│ ┌──────────────────────────────┐ │ ┌─────────────────────┐ │
│ │ • BTC tagged tweet 14:32     │ │ │     +0.34%          │ │
│ │ • ETH whale move 13:01       │ │ │  ▁▂▃▅▆▆▅▄▃ 30d    │ │
│ │ • SOL liquidation 12:45      │ │ └─────────────────────┘ │
│ └──────────────────────────────┘ │                         │
├──────────────────────────────────┴─────────────────────────┤
│ Opportunity Score (ScanGrid top 10, 240px)                │
│ ┌──┬──┬──┬──┬──┬──┬──┬──┬──┬──┐                          │
│ │  │  │  │  │  │  │  │  │  │  │ cards horizontal scroll  │
│ └──┴──┴──┴──┴──┴──┴──┴──┴──┴──┘                          │
└────────────────────────────────────────────────────────────┘
                           [Open Terminal →] sticky 우상단
```

#### Hub-3 Patterns `/patterns`

```
┌────────────────────────────────────────────────────────────┐
│ TopBar (글로벌)                                            │
├────────────────────────────────────────────────────────────┤
│ TabBar: [Library] [Strategies] [Benchmark] [Lifecycle] [Search] │
├──────────┬───────────────────────────────────┬─────────────┤
│ Filter   │ Main                              │ Detail      │
│ (240px)  │ (flex)                            │ (320px)     │
│          │                                   │             │
│ ▼ All    │ ┌──┬──┬──┐                       │ ┌─────────┐ │
│ ▼ OI     │ │  │  │  │                       │ │Selected │ │
│ ▼ Funding│ ├──┼──┼──┤                       │ │ Pattern │ │
│ ▼ Onchain│ │  │  │  │                       │ │ detail  │ │
│ ...      │ └──┴──┴──┘                       │ └─────────┘ │
│          │ PatternLibraryPanel grid          │             │
└──────────┴───────────────────────────────────┴─────────────┘
```

#### Hub-4 Lab `/lab`

```
┌────────────────────────────────────────────────────────────┐
│ TopBar                                                     │
├────────────────────────────────────────────────────────────┤
│ TabBar: [Backtest] [AI Analysis] [PineScript]              │
├──────────┬─────────────────────────────────┬───────────────┤
│ Param    │ Result Chart                    │ Metric Panel  │
│ Form     │ + Equity Curve                  │ + Trades      │
│ (320px)  │ + Drawdown                      │ Table (280px) │
│          │                                 │               │
│ symbol   │ ┌─────────────────────────┐    │ Sharpe 1.42   │
│ tf       │ │   curve goes up         │    │ MaxDD -8.2%   │
│ params   │ │       ▁▂▃▅▆▆▅▆▇█       │    │ Trades 142    │
│ run ▶    │ └─────────────────────────┘    │ ...           │
└──────────┴─────────────────────────────────┴───────────────┘
```

#### Hub-5 Settings `/settings`

```
┌────────────────────────────────────────────────────────────┐
│ TopBar                                                     │
├────────────────────────────────────────────────────────────┤
│ TabBar: [Settings] [Passport] [Status]                     │
├──────────┬──────────────────────────────────────────────┬──┤
│ Cat tree │ Form / Stats / System Map                   │  │
│ (200px)  │                                              │  │
│          │ (per tab)                                    │  │
└──────────┴──────────────────────────────────────────────┴──┘
```

### 3.4 컴포넌트 → Zone 매핑 표 (전수)

| # | 컴포넌트 | Hub | Zone | Level | 비고 |
|---|---|---|---|---|---|
| 1 | AppShell | Hub-2 | grid 골조 | structural | wrapper |
| 2 | TopBar (신규 통합) | 모든 hub | top-bar | L1 | 글로벌 |
| 3 | NewsFlashBar | Hub-2 | news-flash | L2 | dismissable |
| 4 | WatchlistRail | Hub-2 | left-rail | L1 | foldable |
| 5 | DrawingToolbar | Hub-2 | drawing-tool 세로 | L2 | 항상 보임 |
| 6 | ChartToolbar | Hub-2 | chart-stage 상단 | L1 | chart 전용 |
| 7 | ChartBoardHeader | Hub-2 | (사용 안 — TopBar로 대체) | - | 폐기 후보 |
| 8 | BoardToolbar | Hub-2 | (ChartToolbar로 통합) | - | 폐기 후보 |
| 9 | ChartGridLayout | Hub-2 | chart-stage | structural | grid |
| 10 | ChartBoard | Hub-2 | chart-stage | wrapper | wrapper |
| 11 | MultiPaneChart | Hub-2 | chart-stage | L1 | ★ 메인 차트 |
| 12 | ChartCanvas | Hub-2 | (MultiPaneChart 내부) | - | candle 렌더 |
| 13 | ChartPane | Hub-2 | (MultiPaneChart 내부) | - | pane 단위 |
| 14 | PaneInfoBar | Hub-2 | 각 pane 좌상단 | L2 | per-pane |
| 15 | IndicatorPaneStack | Hub-2 | chart-stage 하부 | L1 | sub-pane stack |
| 16 | MiniIndicatorChart | Hub-1, Hub-2 watchlist | rail sparkline | L2 | sparkline |
| 17 | PhaseChart | Hub-3 Lifecycle, Hub-2 옵션 | center | L2 | phase viz |
| 18 | ChartMetricStrip | Hub-2 | chart-stage 상단 strip | L2 | 24h vol/OI |
| 19 | DrawingCanvas | Hub-2 | chart overlay | persist | drawing layer |
| 20 | Sparkline | Hub-1, Hub-2 rail | inline | L2 | mini |
| 21 | SymbolPicker | Hub-2 | top-bar 검색 | L1 | ⌘K |
| 22 | SymbolPickerSheet | mobile | bottom sheet | L1 | mobile |
| 23 | IndicatorSettingsSheet | Hub-2 | per-pane modal | L3 | ⚙ 클릭 |
| 24 | IndicatorLibrary (신규 통합) | Hub-2 | left slide panel | L3 | ⌘L |
| 25 | AIPanel (cogochi) | Hub-2 | (AIAgentPanel로 통합) | - | 흡수 |
| 26 | AIAgentPanel | Hub-2 | right-panel | L1+L3 | ★ 5탭 |
| 27 | LiveDecisionHUD | Hub-2 | Decision tab inline | L1 | inline |
| 28 | DecisionHUD | Hub-2 | (LiveDecisionHUD로 deprecate) | - | 흡수 |
| 29 | EvidenceCard | Hub-2 | Decision tab + drawer | L2 | 카드 |
| 30 | EvidenceGrid | Hub-2 | Decision drawer | L3 | grid full |
| 31 | WhyPanel | Hub-2 | Decision drawer | L3 | reason |
| 32 | StructureExplainViz | Hub-2 | Decision drawer | L3 | viz |
| 33 | SourcePill | Hub-2 | Decision tab inline | L2 | chip |
| 34 | SourceRow | Hub-2 | Decision drawer | L3 | row |
| 35 | VerdictCard | Hub-2 Verdict tab + drawer | inline + L3 | L2/L3 | full |
| 36 | VerdictHeader | Hub-2 Verdict tab | inline header | L1 | 헤더 |
| 37 | VerdictBanner | Hub-2 (top toast) | toast | L1 | 큰 배너 |
| 38 | VerdictInboxPanel | Hub-2 Verdict tab + Hub-1 | inline | L1 | inbox |
| 39 | F60GateBar | Hub-2 status-bar mini + Decision drawer | L2/L3 | gate viz |
| 40 | FreshnessBadge | Hub-2 status-bar + per-data | L2 | freshness |
| 41 | KpiCard | Hub-1 hero | L2 | KPI |
| 42 | KpiStrip | Hub-1 today + Hub-2 chart 상단 | L2 | strip |
| 43 | AssetInsightCard | Hub-2 Decision drawer | L3 | insight |
| 44 | DraftFromRangePanel | Hub-2 drawer (range save) | L3 | range draft |
| 45 | SaveSetupModal | Hub-2 modal | L3 | modal |
| 46 | SaveStrip | Hub-2 chart-stage 상단 우측 | L2 | save strip |
| 47 | PineScriptGenerator | Hub-4 PineScript tab | center | L2 | code editor |
| 48 | PatternLibraryPanel | Hub-3 Library + Hub-2 Pattern drawer | L3 | library |
| 49 | PatternSeedScoutPanel | Hub-3 Library 좌측 widget | L2 | scout |
| 50 | PatternClassBreakdown | Hub-2 Pattern drawer | L3 | breakdown |
| 51 | StrategyCard | Hub-3 Strategies | grid | L2 | card |
| 52 | CompareWithBaselineToggle | Hub-3 Benchmark, Hub-4 Backtest | toggle | L2 | toggle |
| 53 | DirectionBadge | Hub-2 Decision tab + 토스트 | inline | L1 | LONG/SHORT |
| 54 | WhaleWatchCard | Hub-2 watchlist 하부 + Hub-1 | rail | L2 | whale |
| 55 | TerminalLeftRail | Hub-2 (WatchlistRail로 통합) | - | - | 흡수 |
| 56 | TerminalRightRail | Hub-2 (AIAgentPanel로 통합) | - | - | 흡수 |
| 57 | TerminalContextPanel | Hub-2 (AIAgentPanel Decision) | - | - | 흡수 |
| 58 | TerminalContextPanelSummary | Hub-2 (Decision inline) | - | - | 흡수 |
| 59 | TerminalCommandBar | Hub-2 (CommandBar로 통합 ⌘K) | - | - | 흡수 |
| 60 | TerminalHeaderMeta | Hub-2 top-bar | L1 | 흡수 |
| 61 | TerminalBottomDock | Hub-2 status-bar | L2 | 흡수 |
| 62 | CollectedMetricsDock | Hub-2 옵션 (footer expand) | L3 | option |
| 63 | ActionStrip | Hub-2 chart-stage 우측 작은 button group | L2 | actions |
| 64 | RightRailPanel | Hub-2 (AIAgentPanel로 통합) | - | - | 흡수 |
| 65 | PeekDrawer | Hub-2 drawer 패턴 base | L3 | drawer base |
| 66 | CenterPanel | Hub-2 (chart-stage center) | - | - | 흡수 |
| 67 | IndicatorPanel (peek) | Hub-2 (PaneInfoBar 클릭 시) | L3 | peek |
| 68 | JudgePanel | Hub-2 Judge tab + drawer | L1+L3 | judge |
| 69 | ResearchPanel | Hub-2 Research tab + drawer | L1+L3 | research |
| 70 | ScanGrid | Hub-1 Opportunity + Hub-2 Verdict drawer | L2 | scan |
| 71 | WorkspaceStage | Hub-2 (chart-stage로 대체) | - | - | 흡수 |
| 72 | WorkspaceGrid | Hub-2 옵션 (multi-chart 모드) | - | option |
| 73 | WorkspacePanel | Hub-2 (ChartPane로 흡수) | - | - | 흡수 |
| 74 | WorkspacePresetPicker | Hub-2 top-bar Mode menu | L3 | preset |
| 75 | WorkspaceCompareBlock | Hub-3 Benchmark | center | L2 | compare |
| 76 | TabBar | Hub-3, Hub-4, Hub-5 상단 | L1 | hub tabs |
| 77 | Splitter | Hub-2 (chart vs ai-agent 사이) | structural | resizable |
| 78 | Sidebar (cogochi legacy) | (폐기, WatchlistRail+Drawing+AIAgent로 분해) | - | - | 폐기 |
| 79 | StatusBar | Hub-2 status-bar zone | L2 | status |
| 80 | MobileTopBar | mobile 모든 hub | top | L1 | mobile |
| 81 | MobileFooter | mobile (MobileBottomNav로 대체) | - | - | 폐기 |
| 82 | ModeSheet | Hub-2 mobile mode 선택 | L3 | sheet |
| 83 | ModeToggle | Hub-2 top-bar 우측 | L1 | toggle |
| 84 | TradeMode | Hub-2 mode 변형 | structural | mode |
| 85 | TrainMode | Hub-2 mode 변형 | structural | mode |
| 86 | RadialTopology | Hub-2 mode 변형 (옵션) | structural | mode |
| 87 | SplitPaneLayout | Hub-2 (chart-stage 분할) | structural | split |
| 88 | LibrarySection | Hub-3 Library | section | L2 | section |
| 89 | RulesSection | Hub-2 Decision drawer | L3 | section |
| 90 | VerdictsSection | Hub-2 Verdict tab | inline | L1 | section |
| 91 | SectionHeader | 모든 section 헤더 | structural | header |
| 92 | SingleAssetBoard | Hub-2 default mode | structural | mode |
| 93 | AIParserModal | Hub-4 AI Analysis | modal | L3 | parser |
| 94 | CommandBar | Hub-2 top-bar 검색 + ⌘K | L1 | global |
| 95 | CommandPalette | global ⌘K | overlay | L3 | palette |
| 96 | GmxTradePanel | Hub-2 옵션 sidebar | L3 | external |
| 97 | PolymarketBetPanel | Hub-2 옵션 sidebar | L3 | external |
| 98 | WarRoom | Hub-2 옵션 mode | L3 | external |
| 99 | IntelPanel | Hub-2 Research drawer | L3 | intel |
| 100 | BottomPanel | Hub-2 (status-bar로 통합) | - | - | 흡수 |

(추가 헬퍼 / 컨트롤러는 structural — UI 표면에 직접 등장하지 않음)

### 3.5 라우팅 / Store / API 매핑

#### 3.5.1 shell.store 확장

```typescript
// app/src/lib/cogochi/stores/shell.svelte.ts (확장)

export type ShellWorkMode = 'observe' | 'analyze' | 'execute' | 'decide';
export type RightPanelTab = 'decision' | 'pattern' | 'verdict' | 'research' | 'judge';
export type ChartType = 'candle' | 'line' | 'heikin' | 'bar' | 'area';
export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export interface CapturedRange {
  id: string;
  symbol: string;
  tf: Timeframe;
  start_time: number;
  end_time: number;
  label?: string;
  saved: boolean;       // POST /captures 완료 여부
  pattern_recall_id?: string;
}

export interface PaneIndicatorMap {
  pricePane: { overlays: IndicatorId[] };
  subPanes: Array<{ id: string; indicator: IndicatorId; params: Record<string, unknown> }>;
}

export interface AIOverlayState {
  lines: AIPriceLine[];
  ranges: AIRangeBox[];
  arrows: AIArrow[];
  annotations: AIAnnotation[];
}

export interface DrawerContent {
  type: 'evidence-grid' | 'why-panel' | 'pattern-library' | 'verdict-card' | 'research-full' | 'judge-full' | 'draft-from-range';
  payload: any;
}

export interface ShellTabState {
  // 기존 (Phase B/C 유지) +
  symbol: string;
  timeframe: Timeframe;
  chartType: ChartType;
  rightPanelTab: RightPanelTab;
  rightPanelExpanded: boolean;       // 320 ↔ 480 px
  drawerOpen: boolean;
  drawerContent: DrawerContent | null;

  paneIndicators: PaneIndicatorMap;
  drawingState: { tool: DrawingTool | null; items: DrawingItem[] };
  aiOverlay: AIOverlayState;
  capturedRanges: CapturedRange[];

  // AI agent surfaces
  decisionBundle: PanelViewModel | null;
  patternRecallMatches: PatternRecallMatch[];
  verdictInbox: VerdictItem[];
  researchNotes: ResearchNote[];
  judgeOutcomes: JudgeOutcome[];

  // HUD / Mode
  hudVisible: boolean;
  selectedVerdictId: string | null;
  workMode: ShellWorkMode;

  // Watch
  watchlist: WatchlistItem[];
  watchlistFolded: boolean;
}
```

#### 3.5.2 라우팅

| 신규 라우트 / 파라미터 | 행동 |
|---|---|
| `/cogochi?symbol=BTCUSDT&tf=1h&panel=decision` | Hub-2 진입 + 상태 deep-link |
| `/cogochi?range=1715000000-1715003600&action=recall` | drag-saved range로 진입 + 즉시 recall |
| `/dashboard` | Hub-1 |
| `/patterns/[tab]` | Hub-3 (tab=library/strategies/benchmark/lifecycle/search) |
| `/lab/[tab]` | Hub-4 (tab=backtest/ai-analysis/pinescript) |
| `/settings/[tab]` | Hub-5 (tab=settings/passport/status) |
| `/terminal`, `/agent`, `/scanner` | 301 → `/cogochi?panel=…` |
| `/market` | 410 (Phase A 삭제) |
| `/verdict/[id]` | KEEP (외부 link) |

#### 3.5.3 API 매핑 (action ↔ endpoint)

| 사용자 행동 | API | 비고 |
|---|---|---|
| TF 변경 | `GET /api/chart/klines?symbol&tf` | 기존 |
| 인디케이터 추가 | `GET /api/chart/feed?indicator&symbol&tf` | 기존 |
| 드래그 save | `POST /api/captures` | 기존 |
| 드래그 → recall | `POST /api/patterns/recall` body `{range, symbol, tf}` | 기존(또는 신규 wrap) |
| AI search query | `POST /api/cogochi/analyze` | 기존 |
| Decision 갱신 | `GET /api/captures?pattern_slug=...` | W-0309 wired |
| Pattern library load | `GET /api/patterns?...` | 기존 |
| Watchlist sync | `GET/PATCH /api/preferences?key=watchlist` | 기존 |
| Whale alerts | `GET /api/cogochi/whales`, `/api/cogochi/alerts` | 기존 |
| News flash | `GET /api/cogochi/news` | 기존 |
| Wallet status | `GET /api/wallet` | 기존 |
| Notifications | `GET /api/notifications` | 기존 |
| Backtest run | `POST /api/lab/backtest` | 기존 |
| PineScript gen | `POST /api/cogochi/pine-script` | 기존 |
| Drawing persist | `POST /api/chart/notes` 또는 `/api/ui-state` | 후속 결정 (D-OQ) |

---

## 4. Scope (구현 범위)

### 포함
- 5-Hub 레이아웃 재배치 (Phase D-0 zone 골조)
- TopBar (글로벌 통합) + Timeframe picker 8개
- Hub-2 Terminal: chart-stage + AI Agent panel 5탭 + drawer slide
- IndicatorLibrary (좌 슬라이드, 70+ indicator 검색)
- IndicatorPaneStack add/remove
- Drawing toolbar 7종
- 드래그-to-save → captures + pattern recall 흐름
- AI overlay (Claude-style)
- Hub-1 / Hub-3 / Hub-4 / Hub-5 hub 내부 zone 재구성
- Mobile 분기 (bottom sheet right-panel + MobileBottomNav)
- redirect 처리 (`/terminal`, `/agent`, `/scanner` → `/cogochi`)
- shell.store 확장
- 컴포넌트 흡수 / 폐기 정리 (50+ 컴포넌트 zone 매핑)

### 제외
- 새 indicator 알고리즘 (registry 그대로)
- 새 AI 모델 (panelAdapter 그대로)
- 새 Drawing 알고리즘 (DrawingManager 그대로)
- copy_trading / leaderboard / 실자금 자동매매 (Frozen)
- 신규 메모리 stack (Frozen)
- Replay / Screenshot 기능 (후속 W에서)
- Drawing 영구 DB 저장 (MVP는 localStorage; 후속 결정)

---

## 5. Non-Goals

- Frozen 영역 침해
- TradingView 수준의 모든 기능 (replay 시뮬레이션, 알람, 멀티 탭 차트 등) — 핵심 7기능만
- Bloomberg 수준의 모든 화면 (28+ 패널) — 5-Hub로 압축
- 새 backend endpoint (기존 50+ 활용만)

---

## 6. CTO 관점

### 6.1 Risk Matrix

| ID | Risk | 확률 | 영향 | 완화 |
|---|---|---|---|---|
| R1 | 정보 밀도 ↑ → 인지 부하 폭발 | M | H | L1/L2/L3 strict 분리, density 측정 (eye-tracking proxy: 클릭 분포) |
| R2 | Mobile 정보 손실 | H | M | bottom sheet + tab strip + swipe |
| R3 | Chart perf 저하 (multi-pane crosshair) | M | H | rAF throttle, 60fps 측정, lightweight-charts memory leak 모니터 |
| R4 | shell.store 폭발 (필드 25+) | H | M | typed namespace 분리 (chart/ai/watch), selector 패턴 |
| R5 | lightweight-charts 메모리 누수 (mode 전환) | M | H | dispose 패턴 강제, 5회 toggle 후 RSS 측정 |
| R6 | Drawer 키보드 충돌 (Esc 우선순위) | M | M | drawer Esc → close 우선; 그 다음 modal; 그 다음 chart |
| R7 | drag-to-save race (동시 drawing tool 사용) | M | M | chartSaveMode와 DrawingManager 상호배제 (mode flag) |
| R8 | API 폭주 (TF 변경, indicator 추가 동시) | H | M | request dedup + abort controller |
| R9 | 디자인 시스템 부재 → token drift | H | M | Phase D-0에서 design tokens 정의 (color/spacing/radius) |
| R10 | redirect chain (`/terminal` → `/cogochi`) SEO | L | L | 301 + sitemap 업데이트 |
| R11 | Drawing localStorage quota | L | L | 50개 제한 + LRU |
| R12 | AI overlay 무한 누적 | M | M | session-only + max 20개 limit |
| R13 | WatchlistRail fold state device 간 sync 충돌 | L | L | localStorage primary + Supabase eventual |
| R14 | Indicator search 70+ debounce 부족 | L | L | 100ms debounce + max 20 result |
| R15 | Pattern recall 응답 ≥ 500ms | M | M | range 작을수록 빠름; loading skeleton 의무 |

### 6.2 Dependencies

- **Upstream**: W-0372 Phase A (5-hub IA) MERGED 필요, Phase B/C 진행 중
- **Internal**: lightweight-charts (이미 있음), DrawingManager, paneIndicators (W-0304 진행)
- **External**: 없음 (모든 endpoint 기존)

### 6.3 Rollback

- Phase D-0 ~ D-10 atomic PR 분할
- Feature flag `bloomberg_ux=on` (Hub-2만, default off → 1주 카나리)
- 각 phase rollback: 이전 layout 그대로 (Phase B/C 결과)

### 6.4 Files Touched

#### 신규 생성

- `app/src/lib/cogochi/components/TopBar.svelte` (글로벌 통합)
- `app/src/lib/cogochi/components/IndicatorLibrary.svelte` (좌 슬라이드)
- `app/src/lib/cogochi/components/AIAgentPanel.svelte` (5탭 통합 — 기존 peek/AIAgentPanel 흡수)
- `app/src/lib/cogochi/components/PatternRecallCard.svelte`
- `app/src/lib/cogochi/components/DrawerSlide.svelte` (PeekDrawer 일반화)
- `app/src/lib/cogochi/stores/rightPanel.svelte.ts`
- `app/src/lib/cogochi/stores/chartLayout.svelte.ts`
- `app/src/lib/cogochi/utils/dragToSave.ts`
- `app/src/lib/cogochi/utils/aiQueryRouter.ts` (query → action mapping)
- `app/src/routes/dashboard/+page.svelte` (재목적 — Hub-1)
- `app/src/lib/components/MobileBottomNav.svelte` (5-hub, 기존 W-0372 Phase A 결과 확장)

#### 수정

- `app/src/lib/cogochi/components/AppShell.svelte` (CSS grid zone 정의)
- `app/src/lib/cogochi/components/WatchlistRail.svelte` (fold default + sparkline 추가)
- `app/src/lib/cogochi/components/MultiPaneChart.svelte` (crosshair sync rAF + drag-save)
- `app/src/lib/cogochi/components/ChartToolbar.svelte` (chart type / replay / snapshot)
- `app/src/lib/cogochi/components/AIPanel.svelte` (AIAgentPanel로 흡수)
- `app/src/lib/cogochi/components/PaneInfoBar.svelte` (settings sheet trigger)
- `app/src/lib/cogochi/components/StatusBar.svelte` (mini Verdict + F60 mini)
- `app/src/lib/cogochi/components/CommandBar.svelte` (TopBar 검색으로 흡수)
- `app/src/lib/cogochi/stores/shell.svelte.ts` (필드 확장)
- `app/src/lib/cogochi/stores/chartAIOverlay.ts` (AIRangeBox / AIArrow / AIAnnotation 추가)
- `app/src/lib/cogochi/chart/DataFeed.ts` (필요 시)
- `app/src/lib/cogochi/chart/DrawingManager.ts` (mode flag chartSaveMode 호환)
- `app/src/routes/cogochi/+page.svelte` (zone-based)
- `app/src/routes/patterns/+layout.svelte` (TabBar 통합)
- `app/src/routes/lab/+layout.svelte` (TabBar 통합)
- `app/src/routes/settings/+layout.svelte` (TabBar 통합)
- `app/src/routes/terminal/+page.svelte` (301 redirect)
- `app/src/routes/agent/+page.svelte` (301 redirect)
- `app/src/routes/scanner/+page.svelte` (301 redirect)
- `app/src/routes/market/+server.ts` (410)

#### 폐기 (이동/통합 후 삭제)

- `app/src/lib/cogochi/components/Sidebar.svelte` (분해됨)
- `app/src/lib/cogochi/components/MobileFooter.svelte` (MobileBottomNav로 대체)
- `app/src/lib/terminal/components/TerminalLeftRail.svelte` (WatchlistRail로 통합)
- `app/src/lib/terminal/components/TerminalRightRail.svelte` (AIAgentPanel로 통합)
- `app/src/lib/terminal/components/TerminalCommandBar.svelte` (CommandBar로 통합)
- `app/src/lib/terminal/components/TerminalContextPanel.svelte` (Decision tab 흡수)
- `app/src/lib/terminal/components/TerminalContextPanelSummary.svelte` (Decision inline 흡수)
- `app/src/lib/terminal/components/ChartBoardHeader.svelte` (TopBar로 흡수)
- `app/src/lib/terminal/components/BoardToolbar.svelte` (ChartToolbar로 흡수)
- `app/src/lib/terminal/peek/RightRailPanel.svelte` (AIAgentPanel로 통합)
- `app/src/lib/terminal/peek/CenterPanel.svelte` (chart-stage center 흡수)
- `app/src/lib/cogochi/components/BottomPanel.svelte` (StatusBar 흡수, 존재 시)

#### 보존 (그대로 유지)

- 모든 `chart/` 인프라 파일
- 모든 indicator registry
- 모든 API endpoint
- DrawingManager / DrawingCanvas / DrawingToolbar
- LiveDecisionHUD (W-0331 canonical)
- 모든 peek tab 내용 컴포넌트 (EvidenceCard, WhyPanel, etc.) — wrapper만 통합

---

## 7. AI Researcher 관점

### 7.1 Data Impact

| 데이터 | 변화 | 활용 |
|---|---|---|
| User session events | density ↑ → click stream 폭발 | 사용 패턴 클러스터링 |
| Indicator 추가 query | aiSynonyms 매치 데이터 | indicator 검색 품질 학습 |
| Drag-saved ranges | ground-truth pattern label | ★ 가장 가치 큰 데이터 (사람이 직접 표시) |
| AI search queries | 의도 라벨링 데이터 | query → action mapper 학습 |
| Drawer expand 패턴 | L3 접근률 측정 | 어떤 detail이 자주 필요한지 |
| Tab dwell time | 5탭별 체류 시간 | 우선순위 재배치 근거 |

### 7.2 Statistical Validation (사용 후)

- A/B: `bloomberg_ux=on` vs off, primary metric: time-to-first-decision (1주, n≥200)
- Secondary: drag-save 빈도 (절대 수치 ≥ 5/user/day가 목표)
- Tertiary: drawer expand rate (≥ 30% 의 inline 카드가 expand 되어야 의미 있음)

### 7.3 Failure Modes

- **F1 정보 마비**: 너무 많이 보임 → 사용자가 차트만 봄. 측정: tab click rate ≤ 10%면 fail.
- **F2 mobile 사용 불가**: bottom sheet 잘 안 열림. 측정: mobile session bounce rate.
- **F3 drag-to-save 오발**: 드로잉 의도였는데 save 트리거. mitigation: mode flag 명확.
- **F4 AI overlay 누적**: 화면 지저분. mitigation: 자동 expire 5분.
- **F5 lightweight-charts 누수**: 장시간 세션 메모리 ↑. mitigation: dispose 강제 + watchdog.

### 7.4 Research Priorities

1. drag-saved range를 pattern_seed로 활용 (사용자 ground truth)
2. AI search query log → 자연어 → action 매퍼 fine-tune
3. drawer expand 카드 type별 빈도 → priority re-rank

---

## 8. Decisions (Yes/Reject + 이유)

### D-1 right-panel tab 갯수 (5 vs 3)

- **Yes**: 5탭 (Decision/Pattern/Verdict/Research/Judge)
- Reject 3탭: 기능 압축 시 Verdict와 Judge가 모호해짐. 5탭이 정체성 명확.
- Reject 7탭: tab strip 가로 320px에 안 들어감.

### D-2 detail 표시 (drawer slide vs modal vs full-page)

- **Yes**: drawer slide-out (320px)
- Reject modal: 차트 가림 → 사용자가 차트와 detail 동시에 보고 싶어 함.
- Reject full-page: 컨텍스트 손실.

### D-3 timeframe picker 위치 (top-bar vs chart toolbar)

- **Yes**: top-bar (Hub 글로벌)
- Reject chart toolbar 단독: Hub-3/Hub-4에서도 TF 필요할 수 있음.
- 양쪽 둘 다 두는 옵션도 reject (중복).

### D-4 Indicator Library trigger (좌 슬라이드 vs 모달 vs sidebar 영구)

- **Yes**: 좌 슬라이드 panel (⌘L)
- Reject 모달: 차트 위 indicator 보면서 추가 선택 불가.
- Reject sidebar 영구: 320px가 항상 점유.

### D-5 AI overlay 차트 layer 순서

- **Yes**: candle layer < drawing layer < AI overlay < crosshair
- 이유: AI는 사람이 그린 것 위에 표시, 그러나 crosshair는 가장 위.

### D-6 drag-to-save trigger UI (toast vs floating action)

- **Yes**: 화면 중앙 상단 토스트 (5초, 4-action)
- Reject floating action: 차트 어딘가에 떠 있으면 또 다른 클릭 영역과 충돌.

### D-7 multi-pane crosshair sync (X축만 vs X+Y)

- **Yes**: X축만 동기 (시간만)
- Y는 pane별 단위가 다르므로 (가격 vs RSI 0-100) 동기 무의미.

### D-8 mobile right-panel (bottom sheet vs new route)

- **Yes**: bottom sheet 5탭 + tab strip
- Reject new route: 차트와 분리되면 contextual 손실.

### D-9 Pattern recall 결과 표시 (drawer vs Pattern tab)

- **Yes**: Pattern tab inline 카드 list + 클릭 시 drawer
- 차트 위 marker는 추가로 표시 (점선 box, AIRangeBox).

### D-10 AI search history persist

- **Yes**: Supabase + localStorage fallback (50개)
- 디바이스 간 공유 필요.

### D-11 KpiStrip 위치 (chart 상단 vs PaneInfoBar)

- **Yes**: chart 상단 strip (40px) — TradingView 패턴
- PaneInfoBar는 indicator 단위라 다름.

### D-12 워크스페이스 preset (단일 vs 다중)

- **Yes**: 다중 (Trade/Train/Radial 3 mode + 사용자 정의)
- top-bar Mode dropdown.

### D-13 mode 'decide' 버튼 위치

- **Yes**: AI agent panel Decision tab 상단 sticky button "Run Decision Now"
- 결과 즉시 inline 카드.

### D-14 drawing 도구 좌측 vs 차트 우측

- **Yes**: 좌측 세로 (40px, 항상 보임)
- TradingView 표준 + 좌손/우손잡이 모두 무난.

### D-15 NewsFlashBar 위치 (TopBar 아래 vs StatusBar)

- **Yes**: TopBar 아래 28px (dismissable)
- 속보는 위쪽이 시인성 ↑.

### D-16 인디케이터 즐겨찾기 저장 위치

- **Yes**: localStorage primary + Supabase eventual
- 즉시성 우선.

### D-17 Hub-1 Home의 차트 노출 여부

- **Yes**: 차트 안 노출. 차트는 Hub-2 전용.
- Reject mini chart: 정체성 분리 위반.

### D-18 Drawing tool과 chartSaveMode 상호배제

- **Yes**: mode flag 1개 (`chart.activeMode = 'idle' | 'drawing' | 'save-range'`)
- 동시 활성 reject (race 위험).

---

## 9. Open Questions (구체)

| ID | 질문 | 결정 필요 시점 |
|---|---|---|
| OQ-1 | Drawing 영구 저장 백엔드 (`/api/chart/notes` vs `/api/ui-state` vs 신규) | Phase D-3 시작 전 |
| OQ-2 | AI overlay 자동 만료 시간 (5분 vs 세션 종료) | D-9 |
| OQ-3 | drag-to-save 후 Pattern recall이 0건일 때 UX (안내 메시지 / fallback) | D-9 |
| OQ-4 | indicator 즐겨찾기 max 갯수 (8 vs 16 vs 무제한) | D-2 |
| OQ-5 | mobile에서 Drawing tool 표시 여부 (touch 정밀도 한계) | D-8 |
| OQ-6 | Hub-2 default Workspace mode (Trade vs Train) | D-0 |
| OQ-7 | right-panel default expanded vs collapsed | D-1 |
| OQ-8 | NewsFlashBar 닫은 후 다시 보일 조건 (n분 후 재표시 vs 새 뉴스만) | D-10 |
| OQ-9 | AI agent query history scope (per-symbol vs global) | D-9 |
| OQ-10 | TopBar Mode dropdown 단축키 (M? Ctrl+M?) | D-0 |
| OQ-11 | Hub-3 Patterns Library default sub-tab (전체 vs 즐겨찾기) | D-4 |
| OQ-12 | Hub-4 Lab Backtest 결과 차트와 Hub-2 차트 동기 여부 | D-5 |
| OQ-13 | Captures DB schema에 user_label 필드 추가 여부 | OQ-1과 함께 |
| OQ-14 | redirect 시 query string 보존 여부 (`/agent?x=y` → `/cogochi?panel=decision&x=y`) | D-0 |
| OQ-15 | Telemetry event 이름 규칙 (`bloomberg_ux.{action}` vs 기존 `cogochi.*`) | D-0 |

---

## 10. Implementation Plan (Phase 분할)

### Phase D-0 — Layout grid 골조 (2일)
- AppShell.svelte CSS grid zone 정의 (top-bar / news / left-rail / drawing-tool / chart-stage / ai-agent / status-bar)
- design tokens (color/spacing/radius) 정리
- TopBar 컴포넌트 신규 생성 (글로벌)
- 5-Hub 라우팅 redirect 처리
- shell.store 필드 확장 (typed)
- design tokens grep + drift fix

### Phase D-1 — WatchlistRail polish (1일)
- fold 56px / expand 200px 토글
- Sparkline 추가
- Whale 카드 collapsible
- localStorage + Supabase sync
- (Phase C 결과물 확장)

### Phase D-2 — Chart toolbar + Timeframe picker (1.5일)
- Chart type dropdown (Candle/Line/HA/Bar/Area)
- TF picker top-bar에 통합
- Save Setup / Save Range button
- 키보드 단축키 (1-8 for TF)

### Phase D-3 — Indicator Library + Pane Stack (2일)
- IndicatorLibrary.svelte (좌 슬라이드 panel)
- 검색 input (debounce 100ms, findIndicatorByQuery)
- 카테고리 expand
- 즐겨찾기
- IndicatorPaneStack add/remove
- PaneInfoBar 갱신

### Phase D-4 — Drawing toolbar + Drawing Canvas (1일)
- 좌측 세로 toolbar 7종
- DrawingManager 통합
- mode flag (`activeMode`) 도입

### Phase D-5 — MultiPaneChart crosshair sync + AI overlay (1.5일)
- rAF throttle crosshair X축 sync
- AI overlay layer (line/range/arrow/annotation)
- chartAIOverlay.ts 확장

### Phase D-6 — drag-to-save → Pattern Recall (2일)
- chartSaveMode store
- mousedown→up range 캡처
- 토스트 4-action
- POST /api/captures
- POST /api/patterns/recall
- Pattern tab inline 카드 + AIRangeBox marker

### Phase D-7 — AI Agent Panel 5탭 + Drawer (2일)
- AIAgentPanel.svelte (5탭 통합)
- DrawerSlide.svelte (PeekDrawer 일반화)
- 5탭 inline 카드 + drawer detail wiring
- AI Search input ⌘L
- aiQueryRouter.ts (query → action)

### Phase D-8 — Mobile + perf polish (1.5일)
- mobile bottom sheet right-panel
- MobileBottomNav 5-hub
- chart 단일 pane + swipe
- Drawing toolbar mobile horizontal
- LCP / INP / CLS 측정 + tune

### Phase D-9 — AI Agent 정교화 (2일)
- AI overlay (Claude-style 차트 그리기 정교)
- AI Search history (Supabase)
- Pattern recall loading skeleton + empty state
- Decision auto-refresh on tab switch

### Phase D-10 — Bloomberg-grade polish (1.5일)
- KpiStrip chart 상단
- FreshnessBadge per-data
- NewsFlashBar throttle 1/3s
- StatusBar mini Verdict + F60 mini
- design tokens 최종 정리
- redirect 100% 검증

총: 2 + 1 + 1.5 + 2 + 1 + 1.5 + 2 + 2 + 1.5 + 2 + 1.5 = **18일**

---

## 11. Exit Criteria (수치 필수)

- AC1: 5-Hub 모든 페이지 zone-based 레이아웃 적용 (Hub-1~5 5/5)
- AC2: 컴포넌트 → zone 매핑 표 100항목 모두 매핑 (인벤토리 100%)
- AC3: 차트 timeframe picker 8개 (1m/3m/5m/15m/30m/1h/4h/1D) 동작
- AC4: 인디케이터 검색 registry ≥ 70 항목 검색 가능
- AC5: 인디케이터 add/remove pane stack 작동, max sub-pane = 5
- AC6: 드래그 range → AI pattern recall 자동 (≤ 500ms p75)
- AC7: AI agent 5탭 (Decision/Pattern/Verdict/Research/Judge) 모두 inline + drawer 작동
- AC8: 우측 drawer slide expand 동작 (320 ↔ 480px, 200ms ease-out)
- AC9: multi-pane crosshair X축 동기 (rAF throttle, 60fps p95)
- AC10: LCP ≤ 2.5s p75 (Hub-2 cold load)
- AC11: INP ≤ 200ms p75 (탭 전환, drawer expand, TF 변경)
- AC12: CLS = 0 (모든 hub)
- AC13: vitest ≥ 1955 pass (기존) + 신규 ≥ 60 추가
- AC14: typecheck pass (svelte-check 0 errors)
- AC15: VerdictInbox 100항목 60fps virtual scroll
- AC16: lightweight-charts 메모리 누수 0 (mode toggle 5회 RSS Δ ≤ 5MB)
- AC17: Mobile bottom-sheet 5탭 작동 (≤ 768px)
- AC18: Drawing tools 7종 (Trend/HLine/Rect/Fib/Pitchfork/Text/Note) 작동
- AC19: AI overlay 4종 (line/range/arrow/annotation) 작동, max 20개 동시
- AC20: KpiStrip 4종 (24h vol, OI, funding, dominance) 표시
- AC21: NewsFlashBar throttle 1/3s, dismissable
- AC22: Watchlist Supabase sync (디바이스 2개 ≤ 5초)
- AC23: Captures (drag-saved) DB 저장 + Pattern tab 표시 (≤ 1s)
- AC24: 키보드 shortcut (B/Esc/⌘K/j/k/H/⌘L/T/H/R/F/P/1-8) 충돌 0
- AC25: Bundle size +30% 이내 (Phase C baseline 기준)
- AC26: redirect (Phase B/C + Phase D) 100% 작동 (`/terminal`, `/agent`, `/scanner` → 200, `/market` → 410)
- AC27: PR atomic 분할 (D-0 ~ D-10, 11 PR)
- AC28: Mode toggle 4종 (observe/analyze/execute/decide) 작동
- AC29: AI Search query → action 매핑 ≥ 12 패턴 (위 표)
- AC30: PaneInfoBar 모든 pane에 표시 (price + sub-panes)

---

## 12. Owner: app

PR 분할 11개. 검증 protocol: 각 phase 종료 시 vitest + svelte-check + Playwright (Hub-2 시각 회귀) + memory probe.

---

## 13. Facts (실측 수치 + 컴포넌트 정확한 path)

### 13.1 컴포넌트 path (모두 확인된 실측)

- `app/src/lib/cogochi/components/AppShell.svelte`
- `app/src/lib/cogochi/components/AIPanel.svelte`
- `app/src/lib/cogochi/components/CommandBar.svelte`
- `app/src/lib/cogochi/components/CommandPalette.svelte`
- `app/src/lib/cogochi/components/IndicatorSettingsSheet.svelte`
- `app/src/lib/cogochi/components/MobileFooter.svelte`
- `app/src/lib/cogochi/components/MobileTopBar.svelte`
- `app/src/lib/cogochi/components/ModeSheet.svelte`
- `app/src/lib/cogochi/components/PhaseChart.svelte`
- `app/src/lib/cogochi/components/Sidebar.svelte`
- `app/src/lib/cogochi/components/Splitter.svelte`
- `app/src/lib/cogochi/components/StatusBar.svelte`
- `app/src/lib/cogochi/components/SymbolPicker.svelte`
- `app/src/lib/cogochi/components/SymbolPickerSheet.svelte`
- `app/src/lib/cogochi/components/TabBar.svelte`
- `app/src/lib/cogochi/components/WatchlistRail.svelte`
- `app/src/lib/cogochi/components/WorkspacePresetPicker.svelte`
- `app/src/lib/cogochi/components/WorkspaceStage.svelte`
- `app/src/lib/cogochi/components/ChartSvg.svelte` (폐기 예정)
- `app/src/lib/cogochi/sections/{LibrarySection,RulesSection,SectionHeader,VerdictsSection}.svelte`
- `app/src/lib/cogochi/modes/{RadialTopology,TradeMode,TrainMode}.svelte`
- `app/src/lib/cogochi/chart/*` (18 파일, 위 1.1 표 C19-C36)
- `app/src/lib/cogochi/stores/chartAIOverlay.ts`
- `app/src/lib/cogochi/stores/shell.svelte.ts`
- `app/src/lib/terminal/components/*.svelte` (50+, 위 1.1~1.7 표)
- `app/src/lib/terminal/peek/*.svelte` (8 파일)
- `app/src/lib/components/hud/{LiveDecisionHUD,ModeToggle,PatternClassBreakdown,SplitPaneLayout}.svelte`

### 13.2 API endpoints (실측 50+)

위 1.11에 전체 나열.

### 13.3 Indicator Registry 카운트

- OI 3+ / Funding 4+ / On-chain 21 / Derivatives 7+ / DeFi 10+ / Technical 25+ / Custom n
- 합계 ≥ 70개 (모두 aiSynonyms + aiExampleQueries 보유)

### 13.4 Timeframes (DataFeed.ts)

`TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1D']` (8개)

---

## 14. Canonical Files (신규/수정/보존 정리)

위 6.4 참고. 신규 11, 수정 17, 폐기 12, 보존 ≥ 100.

---

## 15. Assumptions

- A1: lightweight-charts v4 그대로 사용. v5 마이그레이션은 별 work.
- A2: paneIndicators (W-0304) 본 phase 시작 전 완료된 상태로 가정.
- A3: Phase A (5-hub IA) 머지 완료 (PR #826 OPEN → MERGED 가정).
- A4: Phase B/C (MobileBottomNav 5-hub, WatchlistRail fold/add/del) 머지 완료 가정.
- A5: panelAdapter (DecisionHUD VM)는 캡처 응답 그대로 변환 — 추가 변경 없음.
- A6: aiSynonyms 한국어/영어 mapping은 indicator registry에 이미 정의됨.
- A7: chartAIOverlay store의 setAIOverlay API는 호환 유지.
- A8: 사용자 베타 ≤ 50명 — 디자인 시스템 token drift 허용 범위.
- A9: Supabase preferences 키 (`watchlist`, `workspace_preset`, `indicator_favorites`)는 충돌 없음 (네임스페이스 prefix `cogochi.`).

---

## 16. Handoff Checklist

- [ ] D-0 zone grid + design tokens
- [ ] D-1 WatchlistRail polish (Phase C 확장)
- [ ] D-2 ChartToolbar + Timeframe picker top-bar
- [ ] D-3 IndicatorLibrary + PaneStack
- [ ] D-4 DrawingToolbar + activeMode flag
- [ ] D-5 MultiPaneChart crosshair sync + AI overlay layer
- [ ] D-6 drag-to-save → captures + pattern recall
- [ ] D-7 AIAgentPanel 5탭 + DrawerSlide + AI Search ⌘L
- [ ] D-8 Mobile bottom sheet + perf
- [ ] D-9 AI 정교화 (Claude-style, history)
- [ ] D-10 Bloomberg polish (KpiStrip / Freshness / NewsFlash / StatusBar mini)
- [ ] redirect 검증
- [ ] 컴포넌트 폐기 12개 삭제 + 흡수 검증
- [ ] vitest + svelte-check + Playwright + memory probe 모두 GREEN
- [ ] /닫기 — CURRENT.md SHA + work/active → completed 이동

---

## Goal
Bloomberg-terminal-grade UX restructure: TopBar(symbol/TF/chart-type) + AIAgentPanel(5-tab) + IndicatorLibrary + DrawingToolbar.

## Owner
app

## Scope
`app/src/lib/cogochi/` — AppShell, shell.store, TopBar, AIAgentPanel, WatchlistRail, CommandBar, +layout.svelte

## Non-Goals
Copy trading, ORPO/DPO model training, backend engine changes, new memory stack.

## Facts
D-0~D-3 merged PR #839 main=`c982f613`. svelte-check 0 errors. 5 CI checks green.

## Canonical Files
- `app/src/lib/cogochi/TopBar.svelte`
- `app/src/lib/cogochi/AIAgentPanel.svelte`
- `app/src/lib/cogochi/shell.store.ts`
- `app/src/lib/cogochi/AppShell.svelte`
- `app/src/lib/cogochi/cogochi.css`
- `app/src/routes/cogochi/+layout.svelte`

## Assumptions
D-0~D-3 foundation is live. Next phases D-4+ build on top.

## Decisions
D-1: TopBar replaces CommandBar TF section. D-2: AIAgentPanel replaces legacy AIPanel.

## Next Steps
1. D-4: IndicatorLibrary drawer (TV-style search/pin/add)
2. D-5: DrawingToolbar + drag-to-save → AI pattern capture
3. D-6: AI overlay layer on MultiPaneChart
4. D-7: Bloomberg polish (KpiStrip / NewsFlash / StatusBar)

## Exit Criteria
- [ ] AC1: svelte-check 0 errors on all D phases
- [ ] AC2: TopBar TF change updates chart reactively
- [ ] AC3: AIAgentPanel 5 tabs all render without error
- [ ] AC4: Indicator library shows all registered indicators
- [ ] CI green + PR merged + CURRENT.md SHA updated

## Open Questions
- [ ] Q1: IndicatorLibrary — inline drawer vs modal overlay?
- [ ] Q2: DrawingToolbar placement — vertical left rail vs floating?

## Handoff Checklist
- [x] D-0 design tokens + shell.store extensions ✅ (#839)
- [x] D-1 TopBar (symbol + 8 TF + chart type) ✅ (#839)
- [x] D-2 AIAgentPanel 5-tab ✅ (#839)
- [x] D-3 AppShell wiring ✅ (#839)
- [ ] D-4 IndicatorLibrary drawer
- [ ] D-5 DrawingToolbar + drag-to-save
- [ ] D-6 AI overlay layer
- [ ] D-7 Bloomberg polish

END
