# W-0403 — Cogochi Surface Decomposition (Wave 6 Deep Design)

> Wave: 6 | Priority: P0 | Effort: XL (3-4주)
> Charter: §In-Scope (페이지별 책임 분해 + 2026-05-01 이후 신규 surface 흡수)
> Status: 🟡 Design Draft (rev3, UX-reviewed)
> Owner: app — hjj032549@gmail.com
> Created: 2026-05-04 (rev2)
> rev3 (2026-05-04): UI/UX 검토 반영 — L1 density 압축, design tokens 추가, mobile 5-region, dashboard re-weight, dup row 정리
> Persona: Jin (퀀트 트레이더 + 창업자) — 첫 진입 / 차트 분석 / 패턴 검증 / verdict streak / passport 공유 / setup 저장
> Depends on: PRODUCT-DESIGN-PAGES-V2.md (P-01..P-10), W-0374 결과 (5-Hub IA 머지 완료), W-0395B / W-0399 / W-0400 / W-0401 / W-0402 머지 (main=`940e0955`)
> Supersedes: W-0403 rev1 (감사-only 198줄 shallow doc)

---

## 0. Goal (1줄)

24개 라우트 / 200+ Svelte 컴포넌트 / 70+ indicator registry / 50+ API endpoint 를 **5개 hub × zone-tagged 정보 위계 (L1/L2/L3)** 로 재배치하고, 2026-05-01 이후 추가된 6개 신규 surface (Streak / Daily Digest / Inbox count / Modal Search / Multi-instance / Catalog Favorites / HoldTimeStrip) 를 자기 자리에 꽂는다.

비-목표: 새 indicator 알고리즘, 새 AI 모델, 신규 backend endpoint, 모바일 native rewrite, 메모리 stack 신설.

---

## 1. 1차 — 전체 인벤토리 (빠짐 없이)

> 원칙: 분류 전에 전부 나열. 출처 컴포넌트 path는 main=`940e0955` 기준 실측.

### 1.1 차트 영역 (Chart Surface)

| # | 기능 | 출처 (실측 path) | 비고 |
|---|---|---|---|
| C1 | Chart container (board) | `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` | wrapper |
| C2 | Chart board header (W-0402 CSS fix) | `app/src/lib/hubs/terminal/workspace/ChartBoardHeader.svelte` | symbol/TF/24h |
| C3 | Multi-pane chart | `app/src/lib/hubs/terminal/workspace/MultiPaneChart.svelte` | price + sub-pane |
| C4 | Multi-pane chart adapter | `app/src/lib/hubs/terminal/workspace/MultiPaneChartAdapter.svelte` | data wiring |
| C5 | Chart canvas | `app/src/lib/hubs/terminal/workspace/ChartCanvas.svelte` | candle 렌더 |
| C6 | Chart pane | `app/src/lib/hubs/terminal/workspace/ChartPane.svelte` | 단일 pane |
| C7 | Chart grid layout | `app/src/lib/hubs/terminal/workspace/ChartGridLayout.svelte` | grid |
| C8 | Pane info bar | `app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte` | per-pane crosshair |
| C9 | Indicator pane stack | `app/src/lib/hubs/terminal/workspace/IndicatorPaneStack.svelte` | sub-pane stack |
| C10 | Mini indicator chart | `app/src/lib/hubs/terminal/workspace/MiniIndicatorChart.svelte` | sparkline |
| C11 | Phase chart | `app/src/lib/hubs/terminal/PhaseChart.svelte` | phase viz |
| C12 | Chart toolbar (workspace) | `app/src/lib/hubs/terminal/workspace/ChartToolbar.svelte` | 차트 툴 |
| C13 | Chart toolbar (L1 shell) | `app/src/lib/hubs/terminal/L1/ChartToolbar.svelte` | L1 변형 |
| C14 | Chart metric strip | `app/src/lib/hubs/terminal/workspace/ChartMetricStrip.svelte` | KPI strip |
| C15 | Board toolbar | `app/src/lib/hubs/terminal/workspace/BoardToolbar.svelte` | board 단위 |
| C16 | Sparkline | `app/src/lib/hubs/terminal/workspace/Sparkline.svelte` | inline mini |
| C17 | Symbol picker | `app/src/lib/hubs/terminal/workspace/SymbolPicker.svelte` | 심볼 선택 |
| C18 | Symbol picker sheet (mobile) | `app/src/lib/hubs/terminal/SymbolPickerSheet.svelte` | bottom sheet |
| C19 | CgChart (compact) | `app/src/lib/hubs/terminal/CgChart.svelte` | 작은 chart variant |
| C20 | Workspace stage | `app/src/lib/hubs/terminal/workspace/WorkspaceStage.svelte` | mode container |
| C21 | Single asset board | `app/src/lib/hubs/terminal/workspace/SingleAssetBoard.svelte` | default mode |
| C22 | Workspace grid | `app/src/lib/hubs/terminal/workspace/WorkspaceGrid.svelte` | grid mode |
| C23 | Workspace panel | `app/src/lib/hubs/terminal/workspace/WorkspacePanel.svelte` | panel |
| C24 | Workspace preset picker | `app/src/lib/hubs/terminal/workspace/WorkspacePresetPicker.svelte` | preset |

### 1.2 AI / Decision 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| A1 | AIAgentPanel (canonical) | `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` | 5탭 wrapper |
| A2 | AIPanel (legacy alias) | `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIPanel.svelte` | 흡수 대상 |
| A3 | DrawerSlide | `app/src/lib/hubs/terminal/panels/AIAgentPanel/DrawerSlide.svelte` | L3 expand |
| A4 | PatternTab | `app/src/lib/hubs/terminal/panels/AIAgentPanel/PatternTab.svelte` | PAT 탭 |
| A5 | DecideRightPanel | `app/src/lib/hubs/terminal/DecideRightPanel.svelte` | decide mode 우측 |
| A6 | DecisionHUD | `app/src/lib/hubs/terminal/workspace/DecisionHUD.svelte` | inline verdict |
| A7 | DecisionHUDAdapter | `app/src/lib/hubs/terminal/workspace/DecisionHUDAdapter.svelte` | wiring |
| A8 | F60ProgressCard | `app/src/lib/components/ai/F60ProgressCard.svelte` | F-60 gauge |
| A9 | EvidenceCard | `app/src/lib/hubs/terminal/workspace/EvidenceCard.svelte` | 증거 카드 |
| A10 | EvidenceGrid | `app/src/lib/hubs/terminal/workspace/EvidenceGrid.svelte` | grid |
| A11 | WhyPanel | `app/src/lib/hubs/terminal/workspace/WhyPanel.svelte` | reason |
| A12 | StructureExplainViz | `app/src/lib/hubs/terminal/workspace/StructureExplainViz.svelte` | viz |
| A13 | SourcePill | `app/src/lib/hubs/terminal/workspace/SourcePill.svelte` | chip |
| A14 | SourceRow | `app/src/lib/hubs/terminal/workspace/SourceRow.svelte` | row |
| A15 | VerdictCard | `app/src/lib/hubs/terminal/workspace/VerdictCard.svelte` | full card |
| A16 | VerdictHeader | `app/src/lib/hubs/terminal/workspace/VerdictHeader.svelte` | header |
| A17 | F60GateBar | `app/src/lib/hubs/terminal/workspace/F60GateBar.svelte` | gate viz |
| A18 | FreshnessBadge | `app/src/lib/hubs/terminal/workspace/FreshnessBadge.svelte` | freshness |
| A19 | KpiCard | `app/src/lib/hubs/terminal/workspace/KpiCard.svelte` | KPI |
| A20 | KpiStrip | `app/src/lib/hubs/terminal/workspace/KpiStrip.svelte` | strip |
| A21 | AssetInsightCard | `app/src/lib/hubs/terminal/workspace/AssetInsightCard.svelte` | insight |
| A22 | AnalyzePanel | `app/src/lib/hubs/terminal/workspace/AnalyzePanel.svelte` | ANL tab |
| A23 | ScanPanel | `app/src/lib/hubs/terminal/workspace/ScanPanel.svelte` | SCN tab |
| A24 | JudgePanel (workspace) | `app/src/lib/hubs/terminal/workspace/JudgePanel.svelte` | JDG tab |
| A25 | JudgePanel (peek) | `app/src/lib/hubs/terminal/peek/JudgePanel.svelte` | peek alias (dup) |
| A26 | AIParserModal | `app/src/lib/hubs/terminal/sheets/AIParserModal.svelte` | parser modal |
| A27 | aiQueryRouter | `app/src/lib/hubs/terminal/aiQueryRouter.ts` | NL→action |
| A28 | aiSearchHistory | `app/src/lib/hubs/terminal/aiSearchHistory.ts` | history persist |
| A29 | parseAgentCommand | `app/src/lib/cogochi/parseAgentCommand.ts` | command parser |
| A30 | LiveSignalPanel | `app/src/lib/components/live/LiveSignalPanel.svelte` | live signals |

### 1.3 Pattern / Verdict 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| P1 | PatternLibraryPanel | `app/src/lib/hubs/terminal/workspace/PatternLibraryPanel.svelte` | library |
| P2 | PatternSeedScoutPanel | `app/src/lib/hubs/terminal/workspace/PatternSeedScoutPanel.svelte` | seed scout |
| P3 | PatternCard | `app/src/lib/components/patterns/PatternCard.svelte` | grid card |
| P4 | PatternEquityCurve | `app/src/lib/components/patterns/PatternEquityCurve.svelte` | equity |
| P5 | PatternLifecycleCard | `app/src/lib/components/patterns/PatternLifecycleCard.svelte` | lifecycle |
| P6 | PatternStatsCard | `app/src/lib/components/patterns/PatternStatsCard.svelte` | stats |
| P7 | PhaseBadge | `app/src/lib/components/patterns/PhaseBadge.svelte` | phase chip |
| P8 | PromoteConfirmModal | `app/src/lib/components/patterns/PromoteConfirmModal.svelte` | promote |
| P9 | TradeHistoryTab | `app/src/lib/components/patterns/TradeHistoryTab.svelte` | history tab |
| P10 | TransitionRow | `app/src/lib/components/patterns/TransitionRow.svelte` | row |
| P11 | IndicatorFilterPanel | `app/src/lib/components/patterns/IndicatorFilterPanel.svelte` | filter |
| P12 | VerdictInboxSection (NEW W-0401) | `app/src/lib/components/patterns/VerdictInboxSection.svelte` | inbox section |
| P13 | VerdictInboxPanel | `app/src/lib/hubs/terminal/peek/VerdictInboxPanel.svelte` | inbox panel |
| P14 | DraftFromRangePanel | `app/src/lib/hubs/terminal/workspace/DraftFromRangePanel.svelte` | range→draft |
| P15 | SaveSetupModal | `app/src/lib/hubs/terminal/workspace/SaveSetupModal.svelte` | setup save |
| P16 | SaveStrip | `app/src/lib/hubs/terminal/workspace/SaveStrip.svelte` | save strip |
| P17 | RangeActionToast | `app/src/lib/hubs/terminal/workspace/RangeActionToast.svelte` | drag-save toast |
| P18 | CompareWithBaselineToggle | `app/src/lib/hubs/terminal/workspace/CompareWithBaselineToggle.svelte` | baseline toggle |
| P19 | WorkspaceCompareBlock | `app/src/lib/hubs/terminal/workspace/WorkspaceCompareBlock.svelte` | compare |
| P20 | PatternClassBreakdown | `app/src/lib/components/terminal/PatternClassBreakdown.svelte` | class breakdown |
| P21 | PineScriptGenerator | `app/src/lib/hubs/terminal/workspace/PineScriptGenerator.svelte` | Pine gen |
| P22 | PineGenerator (canonical) | `app/src/lib/components/pine/PineGenerator.svelte` | Pine gen v2 |
| P23 | StreakBadgeCard (NEW W-0401) | `app/src/lib/components/passport/StreakBadgeCard.svelte` | streak 5 badges |

### 1.4 Watchlist / Symbol 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| W1 | WatchlistRail | `app/src/lib/hubs/terminal/panels/WatchlistRail/WatchlistRail.svelte` | 좌측 rail |
| W2 | WatchlistHeader | `app/src/lib/hubs/terminal/panels/WatchlistRail/WatchlistHeader.svelte` | 헤더 |
| W3 | WatchlistItem | `app/src/lib/hubs/terminal/panels/WatchlistRail/WatchlistItem.svelte` | row |
| W4 | WhaleWatchCard | `app/src/lib/hubs/terminal/workspace/WhaleWatchCard.svelte` | whale 알림 |
| W5 | KimchiPremiumBadge | `app/src/lib/components/market/KimchiPremiumBadge.svelte` | KP badge |

### 1.5 Workspace / Mode 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| WS1 | TerminalHub | `app/src/lib/hubs/terminal/TerminalHub.svelte` | shell entry |
| WS2 | DesktopShell | `app/src/lib/hubs/terminal/L1/DesktopShell.svelte` | desktop |
| WS3 | TabletShell | `app/src/lib/hubs/terminal/L1/TabletShell.svelte` | tablet |
| WS4 | MobileShell | `app/src/lib/hubs/terminal/L1/MobileShell.svelte` | mobile |
| WS5 | TerminalShell | `app/src/lib/hubs/terminal/L1/TerminalShell.svelte` | shell selector |
| WS6 | TopBar | `app/src/lib/hubs/terminal/TopBar.svelte` | symbol/TF/IND |
| WS7 | MobileTopBar | `app/src/lib/hubs/terminal/MobileTopBar.svelte` | mobile top |
| WS8 | TabBar | `app/src/lib/hubs/terminal/TabBar.svelte` | 탭 + workMode |
| WS9 | StatusBar | `app/src/lib/hubs/terminal/StatusBar.svelte` | 하단 status |
| WS10 | BottomSheet | `app/src/lib/hubs/terminal/BottomSheet.svelte` | mobile sheet |
| WS11 | Splitter | `app/src/lib/hubs/terminal/Splitter.svelte` | resize |
| WS12 | ModeSheet | `app/src/lib/hubs/terminal/ModeSheet.svelte` | mode 선택 |
| WS13 | ModeToggle | `app/src/lib/components/terminal/ModeToggle.svelte` | toggle |
| WS14 | SplitPaneLayout | `app/src/lib/components/terminal/SplitPaneLayout.svelte` | split |
| WS15 | TradeMode | `app/src/lib/hubs/terminal/workspace/TradeMode.svelte` | mode |
| WS16 | TrainMode | `app/src/lib/hubs/terminal/workspace/TrainMode.svelte` | mode |
| WS17 | TrainStage | `app/src/lib/hubs/terminal/panels/TrainStage.svelte` | train stage |
| WS18 | FlywheelStage | `app/src/lib/hubs/terminal/panels/FlywheelStage.svelte` | fly mode |
| WS19 | RadialTopology | `app/src/lib/hubs/terminal/workspace/RadialTopology.svelte` | radial |
| WS20 | QuizCard | `app/src/lib/hubs/terminal/panels/QuizCard.svelte` | quiz (TRAIN) |
| WS21 | RetrainCountdown | `app/src/lib/hubs/terminal/panels/RetrainCountdown.svelte` | retrain timer |
| WS22 | TerminalHoldTimeAdapter | `app/src/lib/hubs/terminal/panels/TerminalHoldTimeAdapter.svelte` | hold-time wiring |
| WS23 | shell.store | `app/src/lib/hubs/terminal/shell.store.ts` | global store |
| WS24 | workMode.store | `app/src/lib/hubs/terminal/workMode.store.ts` | OBS/ANL/EXE |
| WS25 | cogochi.data.store | `app/src/lib/hubs/terminal/cogochi.data.store.ts` | shared data |
| WS26 | terminalLayoutController | `app/src/lib/hubs/terminal/terminalLayoutController.ts` | layout ctrl |
| WS27 | panelAdapter | `app/src/lib/hubs/terminal/panelAdapter.ts` | VM adapter |
| WS28 | terminalHelpers | `app/src/lib/hubs/terminal/terminalHelpers.ts` | utils |
| WS29 | design-tokens | `app/src/lib/hubs/terminal/design-tokens.ts` | tokens |
| WS30 | telemetry | `app/src/lib/hubs/terminal/telemetry.ts` | analytics |

### 1.6 Status / Meta / News 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| S1 | NewsFlashBar | `app/src/lib/hubs/terminal/workspace/NewsFlashBar.svelte` | 속보 strip |
| S2 | F60ProgressCard | `app/src/lib/components/ai/F60ProgressCard.svelte` | F60 gauge |
| S3 | FreshnessBadge | A18 | 데이터 freshness |
| S4 | TerminalHeaderMeta | `app/src/lib/hubs/terminal/workspace/TerminalHeaderMeta.svelte` | meta strip |
| S5 | HoldTimeStrip (NEW W-0395) | `app/src/lib/components/shared/HoldTimeStrip.svelte` | hold p50/p90 |
| S6 | UnverifiedDot | `app/src/lib/components/header/UnverifiedDot.svelte` | unverified user |
| S7 | TerminalContextPanel | `app/src/lib/hubs/terminal/workspace/TerminalContextPanel.svelte` | context |
| S8 | TerminalContextPanelSummary | `app/src/lib/hubs/terminal/workspace/TerminalContextPanelSummary.svelte` | summary |
| S9 | TerminalBottomDock | `app/src/lib/hubs/terminal/workspace/TerminalBottomDock.svelte` | bottom dock |
| S10 | TerminalCommandBar | `app/src/lib/hubs/terminal/workspace/TerminalCommandBar.svelte` | cmd bar |
| S11 | TerminalLeftRail | `app/src/lib/hubs/terminal/workspace/TerminalLeftRail.svelte` | left rail |
| S12 | TerminalRightRail | `app/src/lib/hubs/terminal/workspace/TerminalRightRail.svelte` | right rail |
| S13 | CollectedMetricsDock | `app/src/lib/hubs/terminal/workspace/CollectedMetricsDock.svelte` | metric dock |
| S14 | MarketDrawer | `app/src/lib/hubs/terminal/workspace/MarketDrawer.svelte` | market drawer |
| S15 | AppSurfaceHeader | `app/src/lib/components/surfaces/AppSurfaceHeader.svelte` | surface 공통 헤더 |
| S16 | DashActivityGrid | `app/src/lib/components/dashboard/DashActivityGrid.svelte` | dashboard grid |
| S17 | WVPLCard | `app/src/lib/components/dashboard/WVPLCard.svelte` | passport card |
| S18 | LiveStatStrip | `app/src/lib/components/landing/LiveStatStrip.svelte` | landing stats |
| S19 | MiniLiveChart | `app/src/lib/components/landing/MiniLiveChart.svelte` | landing chart |
| S20 | LocaleToggle | `app/src/lib/components/LocaleToggle.svelte` | i18n |
| S21 | FeedbackButton | `app/src/lib/components/FeedbackButton.svelte` | feedback |

### 1.7 Drawing / Annotation / Range 영역

| # | 기능 | 출처 | 비고 |
|---|---|---|---|
| D1 | DrawingCanvas | `app/src/lib/hubs/terminal/workspace/DrawingCanvas.svelte` | drawing layer |
| D2 | DrawingToolbar | `app/src/lib/hubs/terminal/workspace/DrawingToolbar.svelte` | 7 tools |
| D3 | DrawingRail | `app/src/lib/hubs/terminal/panels/DrawingRail.svelte` | side rail |
| D4 | ActionStrip | `app/src/lib/hubs/terminal/workspace/ActionStrip.svelte` | actions strip |
| D5 | RangeActionToast | P17 | drag-save toast |
| D6 | DraftFromRangePanel | P14 | range draft |
| D7 | SaveSetupModal | P15 | save modal |
| D8 | SaveStrip | P16 | save strip |

### 1.8 외부 통합 / 미사용 (dead/quasi-dead)

| # | 기능 | 출처 | Mount 여부 |
|---|---|---|---|
| X1 | GmxTradePanel | `app/src/lib/hubs/terminal/panels/connectors/GmxTradePanel.svelte` | dead (no import) |
| X2 | PolymarketBetPanel | `app/src/lib/hubs/terminal/panels/connectors/PolymarketBetPanel.svelte` | dead |
| X3 | WarRoom | `app/src/lib/hubs/terminal/panels/warroom/WarRoom.svelte` | dead |
| X4 | WarRoomFooter/Header/SignalFeed | `panels/warroom/*` | dead |
| X5 | IntelPanel | `app/src/lib/hubs/terminal/panels/IntelPanel.svelte` | dead |
| X6 | DogeOSWalletButton | `app/src/lib/components/wallet/DogeOSWalletButton.svelte` | mounted (TopBar) |
| X7 | TelegramConnectWidget | `app/src/lib/components/settings/TelegramConnectWidget.svelte` | mounted (settings) |
| X8 | TVImport (ConstraintLadder/HypothesisCard/IdeaTwinCard) | `app/src/lib/components/TVImport/*` | mounted (TV import flow) |
| X9 | peek/CenterPanel | `app/src/lib/hubs/terminal/peek/CenterPanel.svelte` | duplicate (workspace) |
| X10 | peek/RightRailPanel | `app/src/lib/hubs/terminal/peek/RightRailPanel.svelte` | duplicate |
| X11 | peek/IndicatorPanel | `app/src/lib/hubs/terminal/peek/IndicatorPanel.svelte` | duplicate |
| X12 | peek/ScanGrid | `app/src/lib/hubs/terminal/peek/ScanGrid.svelte` | duplicate |
| X13 | peek/AIAgentPanel | `app/src/lib/hubs/terminal/peek/AIAgentPanel.svelte` | duplicate |
| X14 | peek/ModePill | `app/src/lib/hubs/terminal/peek/ModePill.svelte` | duplicate |
| X15 | peek/PeekDrawer | `app/src/lib/hubs/terminal/peek/PeekDrawer.svelte` | duplicate |
| X16 | peek/WatchlistRail | `app/src/lib/hubs/terminal/peek/WatchlistRail.svelte` | duplicate |
| X17 | peek/JudgePanel | `app/src/lib/hubs/terminal/peek/JudgePanel.svelte` | duplicate (A25) |
| X18 | cogochi-components/DrawerSlide | `app/src/lib/hubs/terminal/workspace/cogochi-components/DrawerSlide.svelte` | duplicate (A3) |

### 1.9 Pages / Routes (현 24개 — 모두 결정)

| Route | 현재 책임 | 결정 | 사유 |
|---|---|---|---|
| `/` | Landing | **KEEP** | P-01 canonical |
| `/cogochi` | Terminal hub (5탭 panel + chart) | **KEEP** ★ | P-02 canonical, 제품 정체성 |
| `/dashboard` | DashActivityGrid + WVPL summary | **KEEP** | P-03 canonical (action board) |
| `/agent` | Agent list (Phase 2 marketing) | **KEEP** | P-10, Pro+ marketing landing |
| `/agent/[id]` | Agent detail | **KEEP** | P-10 detail |
| `/analyze` | Analyze surface (legacy) | **REDIRECT → /cogochi?panel=analyze** | TradeMode AnalyzePanel와 중복 |
| `/benchmark` | Pattern benchmark page | **CONSOLIDATE → /patterns?tab=benchmark** | P-04 4탭 spec |
| `/lab` | Lab top (free tier) | **KEEP** | P-09 |
| `/lab/analyze` | Lab analyze | **KEEP** | sub-page (Pro+) |
| `/lab/counterfactual` | Counterfactual | **KEEP** | research feature |
| `/lab/health` | Lab health | **CONSOLIDATE → /settings/status** | system health = settings/status |
| `/passport` | My passport | **KEEP** | P-08 (Streak/Badges 표면) |
| `/passport/[username]` | Public passport | **KEEP** | P-08 share URL |
| `/patterns` | Pattern library | **KEEP** ★ | P-04 (4탭 라우터화) |
| `/patterns/[slug]` | Pattern detail | **KEEP** | P-05 SEO |
| `/patterns/benchmark` | sub-route benchmark | **CONSOLIDATE → /patterns?tab=benchmark** | sub-route → tab |
| `/patterns/filter-drag` | Filter drag UX | **DELETE** | 실험용, 본 page tab의 filter로 흡수 |
| `/patterns/formula` | Formula viewer | **KEEP** (sub-tab on detail) | 패턴 수식 — detail 안의 탭 |
| `/patterns/lifecycle` | Lifecycle | **CONSOLIDATE → /patterns?tab=lifecycle** | sub-route → tab |
| `/patterns/search` | Pattern search | **CONSOLIDATE → /patterns?tab=search** | sub-route → tab |
| `/patterns/strategies` | Strategies | **CONSOLIDATE → /patterns?tab=strategies** | sub-route → tab |
| `/research` | Research home | **KEEP** | research feature (Pro+) |
| `/research/battle` | A/B battle | **KEEP** | research |
| `/research/cycle` | Cycle | **KEEP** | research |
| `/research/diff` | Diff viewer | **KEEP** | research |
| `/research/ensemble` | Ensemble | **KEEP** | research |
| `/research/import` | Import | **KEEP** | research import flow |
| `/research/ledger` | Ledger | **CONSOLIDATE → /lab/ledger** | lab과 더 맞음 (개발자 도구) |
| `/scanner` | Scanner standalone | **REDIRECT → /cogochi?panel=scn** | ScanPanel SCN 탭이 정식 surface |
| `/settings` | Settings tabs | **KEEP** | P-07 |
| `/settings/passport` | Passport settings | **KEEP** | sub-tab |
| `/settings/status` | System status | **KEEP** | sub-tab (lab/health 흡수 대상) |
| `/status` | System status (top-level) | **REDIRECT → /settings/status** | 중복 |
| `/strategies` | Strategy listing | **CONSOLIDATE → /patterns?tab=strategies** | P-04 spec |
| `/terminal` | Terminal alias | **REDIRECT → /cogochi** | 중복 |
| `/terminal/peek` | Peek mode | **DELETE** | peek 컴포넌트군 전체 deprecate (1.8 X9-X17) |
| `/verdict` | Verdict redirect/landing | **KEEP** | P-06 |
| `/verdict/[token]` | Verdict deeplink | **KEEP** ★ | 외부 telegram 링크 |

**합계**: 38 path → KEEP 21 / CONSOLIDATE 9 / REDIRECT 5 / DELETE 3.

### 1.10 Indicator Registry (W-0400 결과 30+, target 70+)

| Family | 갯수 | 대표 |
|---|---|---|
| OI | 3 | oi_change_1h/4h, oi_per_venue |
| Funding | 4 | funding_rate, predicted_funding, funding_skew, funding_ema |
| On-chain | 21 | exchange_reserve, netflow, mvrv_z, nupl, sopr, lth_sopr, active_addr, realized_price, sth_cb, coinbase_premium, whale_ratio, miner_outflow, ssr, nvt, hodl_waves, accum_score, supply_in_profit, realized_pl, ex_inflow, ex_outflow, market_cap |
| Derivatives | 7 | open_interest, lsr, liquidation_heatmap, cvd, perps_volume, basis_spread, oi_btc |
| DeFi | 10 | tvl, dex_volume, swappers, vol_tvl, fees, top_pairs, dex_share, unlocks, bridge_volume, stable_mcap |
| Technical | 25+ | rsi, macd, bb, stoch, atr, adx, ichimoku, vwap, ema, sma, ... |
| Custom | n | user-defined |

**Multi-instance (W-0399)**: 같은 family의 여러 instance 동시 chart load (예: VWAP daily + VWAP weekly, RSI 14 + RSI 21).

### 1.11 API Endpoints (50+)

- **Captures / Patterns**: `/api/captures`, `/api/patterns`, `/api/patterns/recall`, `/api/patterns/lifecycle`, `/api/patterns/benchmark`, `/api/patterns/search`, `/api/patterns/strategies`
- **Chart**: `/api/chart/feed`, `/api/chart/klines`, `/api/chart/notes`
- **Cogochi**: `/api/cogochi/alerts`, `/api/cogochi/alpha`, `/api/cogochi/analyze`, `/api/cogochi/news`, `/api/cogochi/outcome`, `/api/cogochi/pine-script`, `/api/cogochi/terminal`, `/api/cogochi/thermometer`, `/api/cogochi/whales`, `/api/cogochi/workspace-bundle`
- **Decision / AI**: `/api/analyze`, `/api/agents/stats`, `/api/confluence`, `/api/cycles`, `/api/doctrine`, `/api/research`, `/api/refinement`, `/api/wizard`
- **Market data**: `/api/market`, `/api/klines`, `/api/exchange`, `/api/coingecko`, `/api/coinalyze`, `/api/onchain`, `/api/macro`, `/api/feargreed`, `/api/senti`, `/api/predictions`, `/api/kimchi`
- **Trade / Position**: `/api/positions`, `/api/portfolio`, `/api/quick-trades`, `/api/pnl`, `/api/propfirm`
- **External**: `/api/etherscan`, `/api/gmx`, `/api/polymarket`, `/api/yahoo`, `/api/telegram`
- **Verdict / Streak (NEW)**: `/api/verdict`, `/api/verdict/[token]`, `/api/streak`, `/api/digest`
- **System**: `/api/dashboard`, `/api/engine`, `/api/lab`, `/api/live-signals`, `/api/memory`, `/api/notifications`, `/api/observability`, `/api/preferences`, `/api/profile`, `/api/progression`, `/api/runtime`, `/api/search`, `/api/signals`, `/api/terminal`, `/api/ui-state`, `/api/wallet`, `/api/facts`, `/api/pine`

### 1.12 NEW since 2026-05-01 (필수 배치 대상) ★

| ID | Surface | 출처 PR | 현재 위치 | 비고 |
|---|---|---|---|---|
| N1 | Verdict streak distinct-day count + 5 badges (StreakCard) | #1028 / #1060 (W-0401-P1) | `/passport` `StreakBadgeCard` | distinct-day query + badge |
| N2 | Daily digest email | #1032 (W-0401-P3) | backend cron + 이메일; surface = email + 유저 settings toggle | 표면 없음 → settings toggle 필요 |
| N3 | Nav inbox unread dot (limit=10 count) | #1032 (W-0401-P2) | TopBar/StatusBar nav badge | 글로벌 nav 우상단 |
| N4 | IndicatorCatalogModal (modal search) | W-0400 Phase 1B | `/cogochi` ⌘L 또는 IND 버튼 | TopBar IND trigger |
| N5 | Catalog Favorites + Recents (localStorage) | #1024 (W-0400 Ph1C) | IndicatorCatalogModal 안 sections | modal 내부 |
| N6 | Multi-instance indicators (VWAP/RSI 다중) | #1042 (W-0399-P2) | chart pane stack | per-instance config |
| N7 | HoldTimeStrip (p50/p90) | W-0395B | StatusBar 내 strip | 차트 컨텍스트 메타 |
| N8 | Foldable panels (⌘[ ⌘] ⌘\\ ⌘0) | #1072/#1074 (W-0402) | Splitter + shell.store | 단축키 + persistence |
| N9 | ChartBoardHeader CSS fix | #1072 (W-0402) | observe mode `.chart-header--tv` | observe mode CSS 주의 |
| N10 | Dev auth bypass | #1074 (W-0402) | settings/dev only | dev only |
| N11 | Pattern Library auto-open removal | #1066 (W-0402) | `/cogochi` 진입 시 자동 modal 안 뜸 | regression 방지 |
| N12 | VerdictInboxSection (patterns 페이지) | (W-0401 patterns) | `/patterns` 우측 column | inbox section |

---

## 2. 2차 — UX 배치 (어디에, 왜)

### 2.1 정보 위계 원칙 (3 레벨)

| Level | 정의 | 예시 | 화면 점유 |
|---|---|---|---|
| **L1** | 항상 보임 (영역 정체성) | 가격, symbol, verdict 1줄, mode tag | chrome 영구 |
| **L2** | 주변 인지 (peripheral) | sparkline, KpiStrip, NewsFlash, HoldTimeStrip, FreshnessBadge | strip / corner |
| **L3** | 요청 시 expand | drawer slide, modal, full panel, sheet | trigger 후 등장 |

원칙:
- 한 화면에 L1 = 7±2개 (Miller's law)
- L2는 strip / 가장자리 / sparkline 형태
- L3는 ⌘shortcut 또는 명시적 click

### 2.2 페르소나 Jin의 흐름과 Hub 매핑

| 단계 | 행동 | Hub | Zone |
|---|---|---|---|
| 1 | 첫 진입 → 오늘 뭐할까 | Hub-1 `/dashboard` | full page (기회 카드 + 통계 + 시스템) |
| 2 | Streak 확인 / 패스포트 | Hub-1 또는 `/passport` | StreakBadgeCard L1 |
| 3 | 차트 분석 BTC 4h | Hub-2 `/cogochi` | center MultiPaneChart |
| 4 | 인디케이터 검색/추가 (multi-instance) | Hub-2 | IND drawer (IndicatorCatalogModal) |
| 5 | 드래그 range → 패턴 매칭 | Hub-2 | RangeActionToast → AIAgentPanel PAT 탭 |
| 6 | Decision verdict | Hub-2 | AIAgentPanel JDG 탭 / DecisionHUD inline |
| 7 | Verdict 제출 (telegram → 모바일) | `/verdict/[token]` | full screen mobile |
| 8 | Pattern library 브라우징 | Hub-3 `/patterns` | 4탭 (목록/벤치마크/라이프사이클/전략) |
| 9 | 백테스트 / Pine 코드 | Hub-4 `/lab`, `/research` | sub-tabs |
| 10 | 설정 / API 키 / 시스템 health | Hub-5 `/settings` | tabs (settings/passport/status) |

### 2.3 5-Hub 분류 (24 라우트 → 5 Hub로 mapping)

- **Hub-1 Home** = `/`, `/dashboard`, `/passport`, `/passport/[username]`
- **Hub-2 Terminal** = `/cogochi` (★ 핵심), `/scanner`→redirect, `/analyze`→redirect, `/terminal`→redirect, `/agent`+`/agent/[id]` (marketing landing 유지)
- **Hub-3 Patterns** = `/patterns` (4탭: 목록/벤치마크/라이프사이클/전략) + `/patterns/[slug]` + `/patterns/[slug]/formula`, `/verdict`(P-06), `/verdict/[token]`(P-06 deeplink)
- **Hub-4 Lab/Research** = `/lab/*`, `/research/*` (Pro+ 도구함)
- **Hub-5 Settings** = `/settings/*`, `/status`→redirect

### 2.4 Hub-2 Terminal Zone Matrix (★ 핵심)

CSS grid:
```
grid-template-rows:    32px 24px 1fr 32px;   /* TopBar / TabBar / main / StatusBar (32px per StatusBar.svelte:156) */
grid-template-columns: 160px 40px 1fr 280px; /* Watchlist / Drawing / Stage / AIAgent */
```

| Zone | Component | Level | Data source | Why |
|---|---|---|---|---|
| top-bar | TopBar (symbol/TF/chartType/price/IND/inbox-dot) | L1 | liveTick + workspace-bundle + nav inbox count | 항상 보임 (W-0401-P2 inbox dot **여기**) |
| tab-bar | TabBar (탭 목록 + workMode OBS/ANL/EXE 우측끝) | L1 | shell.store.tabs + workMode.store | mode 전환 |
| watchlist | WatchlistRail (160px, foldable to 56px ⌘\\) | L1 | preferences `watchlist` | 다른 심볼 즉시 |
| drawing-rail | DrawingRail + DrawingToolbar (40px 세로) | L2 | drawing store | tool 활성 |
| stage | WorkspaceStage → TradeMode/TrainMode/FlywheelStage | L1 | mode store | 메인 |
| stage-top-strip | ChartMetricStrip (24h vol / OI / funding / dom) | L2 | `/api/cogochi/thermometer` | peripheral KPI |
| stage-chart | MultiPaneChart + IndicatorPaneStack + DrawingCanvas + AI overlay | L1 | klines + indicators + AI | 차트 본체 |
| stage-pane-info | PaneInfoBar per pane (multi-instance config 포함 — N6) | L2 | per-pane indicator state | crosshair 값 |
| ai-agent | AIAgentPanel (5탭: AI/ANL/SCN/JDG/PAT, 280px expand 480) | L1+L3 | cogochi.data.store | inline + drawer |
| status-bar | StatusBar (mode tag / scanner / verdicts / drift / **HoldTimeStrip N7** / inbox-mini / clock) | L2 | various | peripheral |

**Foldable panels (W-0402, N8)** — shell.store에 `panelsFolded: { left: bool, right: bool, both: bool }`, persist localStorage:
- ⌘[ → left fold (WatchlistRail 56px)
- ⌘] → right fold (AIAgentPanel 0px)
- ⌘\\ → both fold (chart full)
- ⌘0 → reset to default (160 / 280)

**IndicatorCatalogModal (N4/N5)** — TopBar IND 버튼 또는 ⌘L:
- Search input (debounce 100ms, findIndicatorByQuery)
- Sections (순서): **Favorites** (localStorage `cogochi.indicator.favorites`) → **Recents** (localStorage `cogochi.indicator.recents`, max 10) → Categories (OI/Funding/On-chain/...)
- Multi-instance (N6): "Add as new instance" 옵션 — `instanceId` 자동 부여 (`vwap_daily`, `vwap_weekly`)
- 추가 후 modal close + IndicatorPaneStack에 새 pane / overlay 등장

### 2.5 Hub-1 Home Zone Matrix

`/dashboard` (P-03 canonical):

| Zone | Component | Level | Data source |
|---|---|---|---|
| Hero | Wallet + Passport tier + Streak (N1) | L1 | profile + streak API |
| Today opportunities | DashActivityGrid (3 카드) | L1 | `/api/dashboard` |
| 내 통계 (30d) | WVPLCard + KpiStrip | L2 | profile/passport |
| 시스템 상태 (mini) | scanner live count + engine health | L2 | observability |
| 최근 활동 | Recent activity rows + NewsFlashBar (이전됨) | L2 | activity feed |
| Inbox section (NEW) | VerdictInboxSection compact (N12) | L2 | inbox unread |
| Sticky CTA | "Open Terminal" 우상단 | L1 | n/a |

`/passport` (P-08):

| Zone | Component | Level |
|---|---|---|
| Profile header | username / tier / share | L1 |
| **Streak block** | **StreakBadgeCard (N1)** ★ | L1 |
| 패턴별 성과 | per-pattern accuracy table | L2 |
| 최근 활동 | activity rows | L2 |

### 2.6 Hub-3 Patterns Zone Matrix

`/patterns` (4탭 router):

| Tab | Zone 1 (filter 200px) | Zone 2 (main flex) | Zone 3 (detail 320px) |
|---|---|---|---|
| 목록 | IndicatorFilterPanel + 카테고리 트리 | PatternCard grid (3열) | PatternStatsCard + PatternEquityCurve |
| 벤치마크 | multi-select + baseline | comparison line chart | metric table |
| 라이프사이클 | phase filter | PatternLifecycleCard funnel | TransitionRow detail |
| 전략 | StrategyCard list | StrategyCard grid | TradeHistoryTab |

추가 우측 column (모든 탭 공통, optional 280px):
- **VerdictInboxSection (N12)** — 인박스 빠른 액션

`/patterns/[slug]`:
- Detail header (PatternStatsCard) | sub-tabs (정의 / 통계 / formula / 내 통계 / 최근 capture)
- "→ /cogochi 분석" CTA

`/verdict` + `/verdict/[token]`:
- 모바일 first 풀스크린 (P-06)
- Mini chart + AI snippet + agree/disagree (좌/우 스와이프)

### 2.7 Hub-4 Lab/Research Zone Matrix

`/lab`:

| Tab | Zone 1 | Zone 2 | Zone 3 |
|---|---|---|---|
| analyze | param form | result JSON tree + chart | citations |
| backtest (Pro+) | strategy form | equity curve | metric table |
| pine (Pro+) | template picker | PineGenerator editor | preview |
| counterfactual | scenario form | scenario chart | delta table |

`/research/*`: 각 sub-route는 자기 책임 유지 (battle/cycle/diff/ensemble/import). `/research/ledger` → `/lab/ledger`로 이전.

### 2.8 Hub-5 Settings Zone Matrix

`/settings`:

| Tab | Zone 1 | Zone 2 | Zone 3 |
|---|---|---|---|
| 프로필 | category tree | form | n/a |
| 알림 | category | TelegramConnectWidget + **Daily Digest toggle (N2)** | n/a |
| 연결 | category | API key form | wallet status |
| 구독 | tier list | tier detail | upgrade CTA |
| API키 | exchange list | key form | n/a |
| passport | left list | profile detail | preview |
| status | system map | per-module health (lab/health 흡수) | logs |

### 2.9 Mobile 분기 (≤ 768px)

- WatchlistRail → MobileTopBar 햄버거 → BottomSheet
- AIAgentPanel → 5탭 BottomSheet (swipe up)
- DrawingRail → chart 상단 horizontal strip
- ChartCanvas → 단일 pane (sub-pane은 swipe)
- 5-Hub 전환 → MobileBottomNav (Home/Terminal/Patterns/Lab/Settings)
- foldable shortcut 대신 long-press handle drag

### 2.5 Design Tokens (Bloomberg-grade visual hierarchy)

> Without these tokens, "재배치" doesn't become "단순화". Every component below MUST use these scales — no ad-hoc px values in PR 2+.

#### Type scale (5 steps only)
| Token | px | Usage |
|---|---|---|
| `--ui-text-2xs` | 10 | Hint, fineprint (use sparingly) |
| `--ui-text-xs`  | 11 | StatusBar, table cells, chip labels |
| `--ui-text-sm`  | 12 | Body default, button labels |
| `--ui-text-md`  | 14 | Section headings, card titles |
| `--ui-text-lg`  | 18 | Hero numbers (Streak day count, price) |
| `--ui-text-xl`  | 24 | Dashboard hero only |

#### Spacing scale (4-base, no off-grid values)
4 · 8 · 12 · 16 · 24 · 32 · 48 — anything else is a bug. CSS vars `--sp-1..--sp-7`.

#### Color tier
| Token | Usage |
|---|---|
| `--text-primary` (g8/g9) | Numbers, key labels |
| `--text-secondary` (g7) | Default body |
| `--text-tertiary` (g5/g6) | Meta, dividers, low-priority chips |
| `--accent-pos` | LONG, gain, fresh |
| `--accent-neg` | SHORT, loss, stale |
| `--accent-amb` | WAIT, warn, fresh-warn |
| `--accent-info` | links, kimchi-cold, fr-short |

#### Density mode (single toggle in Settings → Display)
- `compact` (default for terminal): row-height 24, gap 8, font xs
- `comfortable` (default for dashboard / patterns): row-height 32, gap 12, font sm
Hub-2 forces compact. Hub-1/3/4/5 user-toggleable.

#### Z-index scale (no random values)
0 base / 10 sticky / 20 dropdown / 30 drawer / 40 modal / 50 toast / 60 tooltip

---

## 3. 와이어프레임

### 3.1 Hub-2 Terminal Desktop

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ TopBar [32px] — L1 ≤ 6 slots                                                     │
│ [BTC ▾] [4H ▾] [Candle ▾] [77,270 +1.2%] [🔔3] [⚙]                               │
│ TF chip click → popover (1m/3m/5m/15m/30m/1h/4h/1D).                             │
│ ChartType chip click → popover (Candle/HA/Line/Bar).                             │
│ IND moved to ⌘K command palette only — removed from TopBar to enforce L1 ≤ 6.   │
├──────────────────────────────────────────────────────────────────────────────────┤
│ TabBar [24px]                                                                    │
│ [BTC×][ETH×][+]                          [OBS][ANL][EXE]  [⊞]                    │
├────────┬────┬───────────────────────────────────────────────────┬────────────────┤
│Watch   │Drw │ ChartMetricStrip [24px]                           │ AIAgentPanel   │
│list    │Rail│ vol 1.2B │ OI 8.3B │ funding 0.012% │ dom 52.3%   │ [AI][ANL][SCN] │
│(160)   │(40)│                                                   │ [JDG][PAT]     │
│        │    │ ─────────────────────────────────────────────────│ ─────────────  │
│★ BTC   │ ☐  │  PaneInfoBar: BTC/USDT 1h  O 95.2k H..C 95.65k    │ AI Search ⌘K   │
│ 77,270 │ ╱  │  ┌─────────────────────────────────────────────┐  │ [____________] │
│ +1.2%  │ ─  │  │ MultiPaneChart Pane 1 (price 50%)           │  │                │
│ ▁▂▄▆█  │ ▭  │  │ + multi-instance overlay (VWAP D+W)         │  │ Active Tab:    │
│        │ Φ  │  │ + DrawingCanvas + AI overlay                │  │ ┌────────────┐ │
│ ETH    │ T  │  └─────────────────────────────────────────────┘  │ │ inline     │ │
│ 3,421  │ 📝 │  PaneInfoBar: VWAP daily 95.4k   [⚙][✕]           │ │ cards      │ │
│ -0.3%  │ ⤴  │  ┌─────────────────────────────────────────────┐  │ │ + 더보기 → │ │
│ ▁▃▅▆██ │ ⤵  │  │ Pane 2 (RSI 14, RSI 21 multi-instance, 25%) │  │ │   drawer   │ │
│        │ 🗑 │  └─────────────────────────────────────────────┘  │ └────────────┘ │
│ +Add   │    │  PaneInfoBar: RSI(14) 65.4   RSI(21) 58.2  [⚙][✕] │                │
│        │    │  ┌─────────────────────────────────────────────┐  │ DrawerSlide    │
│Whales  │    │  │ Pane 3 (OI 4h, 25%)                         │  │ (320 expand    │
│(fold)  │    │  └─────────────────────────────────────────────┘  │  to 480)       │
├────────┴────┴───────────────────────────────────────────────────┴────────────────┤
│ StatusBar [32px] — two-tier                                                      │
│ L2 always-on: [●scanner live] [verdicts <N>] [drift ±X] [hold p50/p90] [time]    │
│ L3 on hover/expand: [+market] → BTC FR · Kim · fresh · verdict pill              │
└──────────────────────────────────────────────────────────────────────────────────┘
chrome 합계 = 32+24+32 = 88px (+TabBar 24);   body = 100vh - 112px
foldable: ⌘[ left, ⌘] right, ⌘\\ both, ⌘0 reset
```

### 3.2 Hub-2 Mobile (≤ 768px)

```
┌──────────────────────┐
│ 1. TopBar (40)       │
│ BTC ▾  4H ▾  ⌘K  ●fr │
├──────────────────────┤
│ 2. Chart (≥50vh, 1fr)│
│ single pane + AI ovl │
│ DrawingStrip floats  │
│   bottom-right (3)   │
├──────────────────────┤
│ 4. Bottom tab strip  │
│ (48) [PAT][ANL][SCN] │
│      [JDG][SCN]      │
├──────────────────────┤
│ 5. BottomNav (56)    │
│ 🏠 📊 🎯 🧪 ⚙        │
└──────────────────────┘
5-region only:
1) TopBar 40px — symbol + TF + ⌘K (fresh dot inline)
2) Chart 1fr (≥50vh)
3) DrawingStrip — floating overlay bottom-right (NOT a stacked row)
4) Bottom tab strip 48px (PAT/ANL/SCN/JDG/SCN)
5) BottomNav 56px (5-hub)
StatusBar = desktop-only; mobile shows fresh dot inside TopBar instead.
```

### 3.3 Hub-1 `/dashboard` Desktop

```
┌──────────────────────────────────────────────────────────────────┐
│ Top nav (32) [logo][🏠 Home][📊 Terminal][🎯 Patterns][🧪 Lab][⚙]│
│              하나의 nav, 우측 끝 [🔔3 inbox dot N3][user]         │
├──────────────────────────────────────────────────────────────────┤
│ Hero (160px) — re-weighted 60/40 (Streak hero left, Wallet+Tier right)│
│ ┌──────────────────────────────────┬─────────────────────────┐ │
│ │ Streak 🔥 12d  ▁▂▄▆█▇▅          │ Wallet 5,420  (sm)      │ │
│ │ (24px hero number + 7-day mini)  ├─────────────────────────┤ │
│ │   ← 60% width (N1 hero)          │ Pro Tier      (sm)      │ │
│ └──────────────────────────────────┴─────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│ 오늘의 기회 (DashActivityGrid 240px)                             │
│ ┌────────┐ ┌────────┐ ┌────────┐                                │
│ │ BTC 4H │ │ ETH 1H │ │ SOL 15m│ → click → /cogochi?symbol=&tf= │
│ │ ↑ 89%  │ │ ↓ 76%  │ │ ↑ 71%  │                                │
│ └────────┘ └────────┘ └────────┘                                │
├──────────────────────────┬───────────────────────────────────────┤
│ 내 통계 (WVPLCard)       │ 시스템 상태                            │
│ verdict 47 / acc 67.3%   │ scanner ●300sym engine●  feed BTC ✓   │
├──────────────────────────┴───────────────────────────────────────┤
│ Inbox (VerdictInboxSection compact, N12)                         │
│ • BTC 4H bull_flag — agree? 14:32  [✓][✗]                       │
│ • ETH 1H bear_wedge        13:01   [✓][✗]                       │
├──────────────────────────────────────────────────────────────────┤
│ 최근 활동 + NewsFlash                                             │
│ bull_flag +3개 2h │ BTC ETF flow +$420M  [×]                     │
└──────────────────────────────────────────────────────────────────┘
                                                  [Open Terminal →]
```

### 3.4 Hub-3 `/patterns` Desktop

```
┌────────────────────────────────────────────────────────────────────┐
│ Top nav + AppSurfaceHeader: 패턴 라이브러리  [🔍 검색][정렬▾][방향▾]│
├────────────────────────────────────────────────────────────────────┤
│ TabBar: [목록] [벤치마크] [라이프사이클] [전략]                      │
├──────────┬──────────────────────────────┬─────────────────────────┤
│ Filter   │ Main grid (PatternCard 3col) │ Detail | Inbox (3) tab  │
│ (200px)  │                              │ (360px, tab switch)     │
│ ▼ All    │ ┌──┬──┬──┐                  │ [Detail] [Inbox 3]      │
│ ▼ OI     │ │  │  │  │                  │ ─────────────────────── │
│ ▼ Funding│ ├──┼──┼──┤                  │ stat + EQU curve  OR    │
│ ▼ Onchain│ │  │  │  │                  │ • BTC bull / ETH bear   │
│ ...      │ └──┴──┴──┘                  │ [→ /cogochi]            │
└──────────┴──────────────────────────────┴─────────────────────────┘
3-col layout: [Filter 200] [Grid 1fr] [Detail/Inbox 360] — fits ≤1280px laptops.
```

### 3.5 Hub-3 `/verdict/[token]` Mobile

```
┌────────────────────┐
│ BTC 4H · bull_flag │
├────────────────────┤
│ [mini chart 캡처]  │
├────────────────────┤
│ AI: "강한 지지 +   │
│ 거래량 급증.       │
│ bullish 89%."      │
├────────────────────┤
│                    │
│ [✓ 동의]  [✗ 이견] │
│ ←swipe      swipe→ │
│                    │
│ 만료 2h 14m        │
└────────────────────┘
```

### 3.6 Hub-5 `/settings` Desktop

```
┌────────────────────────────────────────────────────┐
│ TopNav + AppSurfaceHeader                          │
├────────────────────────────────────────────────────┤
│ Tabs (PR-1 scope): [Account][Notifications][Display]│
│ Tabs (PR 4+):     [Indicators][Workspaces][Shortcuts][Data]│
├──────────┬─────────────────────────────────────────┤
│ category │ Panel content (탭별)                    │
│ (200px)  │  알림 탭:                               │
│          │   - Telegram: TelegramConnectWidget    │
│          │   - 패턴 감지 알림 [ON/OFF]            │
│          │   - verdict 마감 30분 전 [ON/OFF]      │
│          │   - **Daily Digest 매일 09:00 (N2)**   │
│          │     [ON/OFF]  [시각 09:00▾]           │
└──────────┴─────────────────────────────────────────┘
```

---

## §3.4 Component → Zone Mapping (전수, ≥100 rows)

| # | Component | Hub | Zone | Level | Notes (keep/absorb/delete) |
|---|---|---|---|---|---|
| 1 | TerminalHub | Hub-2 | shell entry | structural | keep |
| 2 | DesktopShell | Hub-2 | L1 desktop | structural | keep |
| 3 | TabletShell | Hub-2 | L1 tablet | structural | keep |
| 4 | MobileShell | Hub-2 | L1 mobile | structural | keep |
| 5 | TerminalShell | Hub-2 | shell selector | structural | keep |
| 6 | TopBar | Hub-2 (글로벌화 후 모든 hub) | top-bar | L1 | keep — IND/inbox/streak hook 추가 |
| 7 | MobileTopBar | mobile 모든 hub | top | L1 | keep |
| 8 | TabBar | Hub-2 | tab-bar | L1 | keep — workMode 우측끝 |
| 9 | StatusBar | Hub-2 | status-bar | L2 | keep — HoldTimeStrip N7 mount |
| 10 | BottomSheet | mobile | sheet root | L3 | keep |
| 11 | Splitter | Hub-2 | grid splitter | structural | keep — foldable N8 wired |
| 12 | ModeSheet | Hub-2 mobile | sheet | L3 | keep |
| 13 | ModeToggle | Hub-2 | TabBar 우측 | L1 | keep |
| 14 | SplitPaneLayout | Hub-2 | grid | structural | keep |
| 15 | CgChart | Hub-1 dashboard mini, landing MiniLiveChart 옆 | inline mini | L2 | keep |
| 16 | ChartBoard | Hub-2 | stage chart wrapper | structural | keep |
| 17 | ChartBoardHeader | Hub-2 | (TopBar로 흡수, observe mode CSS 주의 N9) | - | absorb (leave file for observe variant) |
| 18 | BoardToolbar | Hub-2 | (ChartToolbar 흡수) | - | absorb |
| 19 | ChartToolbar (workspace) | Hub-2 | stage 상단 | L2 | keep |
| 20 | ChartToolbar (L1) | Hub-2 | (workspace ChartToolbar로 통합) | - | absorb |
| 21 | ChartGridLayout | Hub-2 | stage grid | structural | keep |
| 22 | MultiPaneChart | Hub-2 | stage center | L1 | keep ★ |
| 23 | MultiPaneChartAdapter | Hub-2 | wiring | structural | keep |
| 24 | ChartCanvas | Hub-2 | inside MultiPaneChart | - | structural |
| 25 | ChartPane | Hub-2 | inside MultiPaneChart | - | structural |
| 26 | PaneInfoBar | Hub-2 | per-pane top-left | L2 | keep — multi-instance config 표시 (N6) |
| 27 | IndicatorPaneStack | Hub-2 | stage 하부 | L1 | keep — multi-instance support |
| 28 | MiniIndicatorChart | Hub-1, Hub-2 watchlist | sparkline | L2 | keep |
| 29 | PhaseChart | Hub-3 lifecycle, Hub-2 옵션 | center viz | L2 | keep |
| 30 | ChartMetricStrip | Hub-2 | stage-top-strip | L2 | keep |
| 31 | DrawingCanvas | Hub-2 | chart overlay | persist | keep |
| 32 | DrawingToolbar | Hub-2 | drawing-rail | L2 | keep |
| 33 | DrawingRail | Hub-2 | drawing-rail wrapper | L2 | keep |
| 34 | ActionStrip | Hub-2 | stage 우측 button group | L2 | keep |
| 35 | Sparkline | Hub-1, Hub-2 watchlist | inline | L2 | keep |
| 36 | SymbolPicker | Hub-2 | TopBar symbol click | L1 | keep |
| 37 | SymbolPickerSheet | mobile | bottom sheet | L1 | keep |
| 38 | IndicatorSettingsSheet (top-level) | Hub-2 | per-pane modal | L3 | keep |
| 39 | IndicatorSettingsSheet (sheets/) | Hub-2 | (top-level과 통합) | - | absorb (dedupe) |
| 40 | IndicatorLibrary (top-level) | Hub-2 | (sheets IndicatorCatalogModal로 통합) | - | absorb |
| 41 | IndicatorLibrary (sheets/) | Hub-2 | (IndicatorCatalogModal canonical로 변경) | - | rename to IndicatorCatalogModal |
| 42 | IndicatorCatalogModal | Hub-2 | TopBar IND drawer / ⌘L | L3 | keep — Favorites + Recents sections (N4/N5) |
| 43 | AIParserModal | Hub-2 / Hub-4 | sheet | L3 | keep |
| 44 | AIAgentPanel (canonical) | Hub-2 | ai-agent zone | L1+L3 | keep ★ 5탭 |
| 45 | AIPanel (legacy) | Hub-2 | (AIAgentPanel 흡수) | - | absorb |
| 46 | DrawerSlide (canonical) | Hub-2 | AIAgentPanel L3 | L3 | keep |
| 47 | DrawerSlide (workspace/cogochi-components) | Hub-2 | (canonical 흡수) | - | absorb (dedupe) |
| 48 | PatternTab | Hub-2 | AIAgentPanel PAT | L1 | keep |
| 49 | DecideRightPanel | Hub-2 | AIAgentPanel JDG drawer | L3 | absorb into JDG drawer (workspace JudgePanel와 통합) |
| 50 | DecisionHUD | Hub-2 | stage inline (TradeMode 내) | L1 | keep |
| 51 | DecisionHUDAdapter | Hub-2 | wiring | structural | keep |
| 52 | F60ProgressCard | Hub-2 ANL drawer + Hub-1 dashboard | L2/L3 | keep |
| 53 | EvidenceCard | Hub-2 ANL inline + drawer | L2 | keep |
| 54 | EvidenceGrid | Hub-2 ANL drawer | L3 | keep |
| 55 | WhyPanel | Hub-2 ANL drawer | L3 | keep |
| 56 | StructureExplainViz | Hub-2 ANL drawer | L3 | keep |
| 57 | SourcePill | Hub-2 ANL inline | L2 | keep |
| 58 | SourceRow | Hub-2 ANL drawer | L3 | keep |
| 59 | VerdictCard | Hub-3 verdict + Hub-2 PAT drawer | L2/L3 | keep |
| 60 | VerdictHeader | Hub-3 verdict | L1 | keep |
| 61 | F60GateBar | Hub-2 status-bar mini + ANL drawer | L2/L3 | keep |
| 62 | FreshnessBadge | Hub-2 status-bar + per-data | L2 | keep |
| 63 | KpiCard | Hub-1 hero | L2 | keep |
| 64 | KpiStrip | Hub-1 today + Hub-2 stage-top | L2 | keep |
| 65 | AssetInsightCard | Hub-2 ANL drawer | L3 | keep |
| 66 | AnalyzePanel | Hub-2 AIAgentPanel ANL inline | L1 | keep |
| 67 | ScanPanel | Hub-2 AIAgentPanel SCN inline | L1 | keep |
| 68 | JudgePanel (workspace) | Hub-2 AIAgentPanel JDG inline | L1 | keep — DecideRightPanel 흡수 |
| 69 | JudgePanel (peek) | - | (workspace로 통합) | - | delete (dup) |
| 70 | LiveSignalPanel | Hub-2 ANL drawer | L3 | keep |
| 71 | aiQueryRouter | Hub-2 utility | structural | keep |
| 72 | aiSearchHistory | Hub-2 utility | structural | keep |
| 73 | parseAgentCommand | Hub-2 utility | structural | keep |
| 74 | PatternLibraryPanel | Hub-3 main + Hub-2 PAT drawer | L3 | keep |
| 75 | PatternSeedScoutPanel | Hub-3 main 좌측 | L2 | keep |
| 76 | PatternCard | Hub-3 grid | L2 | keep |
| 77 | PatternEquityCurve | Hub-3 detail | L2 | keep |
| 78 | PatternLifecycleCard | Hub-3 lifecycle tab | L2 | keep |
| 79 | PatternStatsCard | Hub-3 detail | L2 | keep |
| 80 | PhaseBadge | Hub-3 / Hub-2 inline | L2 | keep |
| 81 | PromoteConfirmModal | Hub-3 detail | L3 | keep |
| 82 | TradeHistoryTab | Hub-3 strategies tab | L2 | keep |
| 83 | TransitionRow | Hub-3 lifecycle | L2 | keep |
| 84 | IndicatorFilterPanel | Hub-3 list filter | L2 | keep |
| 85 | VerdictInboxSection (NEW) | Hub-3 우측 column + Hub-1 inbox section | L2 | keep ★ N12 |
| 86 | VerdictInboxPanel | Hub-2 PAT inline + Hub-1 | L1 | keep |
| 87 | DraftFromRangePanel | Hub-2 drawer (range save) | L3 | keep |
| 88 | SaveSetupModal | Hub-2 modal | L3 | keep |
| 89 | SaveStrip | Hub-2 stage 상단 우측 | L2 | keep |
| 90 | RangeActionToast | Hub-2 toast (drag-save trigger) | L1 | keep |
| 91 | CompareWithBaselineToggle | Hub-3 benchmark, Hub-4 backtest | L2 | keep |
| 92 | WorkspaceCompareBlock | Hub-3 benchmark | L2 | keep |
| 93 | PatternClassBreakdown | Hub-2 PAT drawer | L3 | keep |
| 94 | PineScriptGenerator (workspace) | - | (canonical PineGenerator로 통합) | - | absorb |
| 95 | PineGenerator (canonical) | Hub-4 lab pine tab | L2 | keep |
| 96 | StreakBadgeCard (NEW) | Hub-1 `/passport` + Hub-1 `/dashboard` hero | L1 | keep ★ N1 |
| 97 | WatchlistRail | Hub-2 left-rail | L1 | keep — foldable ⌘[ |
| 98 | WatchlistHeader | Hub-2 left-rail | structural | keep |
| 99 | WatchlistItem | Hub-2 left-rail row | structural | keep |
| 100 | WhaleWatchCard | Hub-2 watchlist 하단 collapsible + Hub-1 | L2 | keep |
| 101 | KimchiPremiumBadge | Hub-1 hero / Hub-2 status-bar | L2 | keep |
| 102 | shell.store | Hub-2 | global store | structural | keep — foldable state 추가 |
| 105 | workMode.store | Hub-2 | global store | structural | keep |
| 106 | cogochi.data.store | Hub-2 | shared data store | structural | keep |
| 107 | terminalLayoutController | Hub-2 | layout controller | structural | keep |
| 108 | panelAdapter | Hub-2 | VM adapter | structural | keep |
| 109 | terminalHelpers | Hub-2 | utils | structural | keep |
| 110 | design-tokens | global | tokens | structural | keep |
| 111 | telemetry | global | analytics | structural | keep |
| 112 | TradeMode | Hub-2 | stage mode | structural | keep |
| 113 | TrainMode | Hub-2 | stage mode | structural | keep |
| 114 | TrainStage | Hub-2 train | L1 | keep |
| 115 | FlywheelStage | Hub-2 fly mode | L1 | keep |
| 116 | RadialTopology | Hub-2 fly | L2 | keep |
| 117 | QuizCard | Hub-2 train | L1 | keep |
| 118 | RetrainCountdown | Hub-2 train | L2 | keep |
| 119 | TerminalHoldTimeAdapter | Hub-2 status-bar | structural | keep — N7 wiring |
| 120 | HoldTimeStrip (NEW) | Hub-2 status-bar | L2 | keep ★ N7 |
| 121 | UnverifiedDot | global header | L2 | keep |
| 122 | NewsFlashBar | Hub-1 dashboard 최근 활동 + Hub-2 (옵션 dismissable) | L2 | keep — primary mount는 Hub-1 (P-03) |
| 123 | TerminalHeaderMeta | Hub-2 | (TopBar 흡수) | - | absorb |
| 124 | TerminalContextPanel | Hub-2 | (AIAgentPanel ANL 흡수) | - | absorb |
| 125 | TerminalContextPanelSummary | Hub-2 | (ANL inline 흡수) | - | absorb |
| 126 | TerminalBottomDock | Hub-2 | (StatusBar 흡수) | - | absorb |
| 127 | TerminalCommandBar | Hub-2 | (CommandPalette ⌘K로 통합) | - | delete (commented) |
| 128 | TerminalLeftRail | Hub-2 | (WatchlistRail 통합) | - | delete |
| 129 | TerminalRightRail | Hub-2 | (AIAgentPanel 통합) | - | delete |
| 130 | CollectedMetricsDock | - | (StatusBar HoldTimeStrip로 대체) | - | delete |
| 131 | MarketDrawer | - | (NewsFlashBar로 흡수) | - | delete |
| 132 | WorkspaceStage | Hub-2 | stage container | structural | keep |
| 133 | SingleAssetBoard | Hub-2 | default mode board | structural | keep |
| 134 | WorkspaceGrid | Hub-2 | (옵션 multi-chart mode) | structural | keep |
| 135 | WorkspacePanel | Hub-2 | (ChartPane 흡수) | - | absorb |
| 136 | WorkspacePresetPicker | Hub-2 TopBar Mode menu | L3 | keep |
| 137 | peek/AIAgentPanel | - | (canonical AIAgentPanel) | - | delete (dup) |
| 138 | peek/CenterPanel | - | (workspace stage center) | - | delete (dup) |
| 139 | peek/IndicatorPanel | - | (PaneInfoBar 클릭 시) | - | delete (dup) |
| 140 | peek/JudgePanel | - | (workspace JudgePanel) | - | delete (dup) |
| 141 | peek/ModePill | - | (TabBar workMode) | - | delete (dup) |
| 142 | peek/PeekDrawer | - | (DrawerSlide canonical) | - | delete (dup) |
| 143 | peek/RightRailPanel | - | (AIAgentPanel) | - | delete (dup) |
| 144 | peek/ScanGrid | - | (ScanPanel) | - | delete (dup) |
| 145 | peek/VerdictInboxPanel | Hub-2 PAT inline + Hub-1 | L1 | keep — canonical 위치 옮기기 (panels/) |
| 146 | peek/WatchlistRail | - | (panels/WatchlistRail canonical) | - | delete (dup) |
| 147 | warroom/WarRoom | - | dead | - | delete |
| 148 | warroom/WarRoomFooterSection | - | dead | - | delete |
| 149 | warroom/WarRoomHeaderSection | - | dead | - | delete |
| 150 | warroom/WarRoomSignalFeed | - | dead | - | delete |
| 151 | connectors/GmxTradePanel | - | dead | - | delete (Frozen) |
| 152 | connectors/PolymarketBetPanel | - | dead | - | delete (Frozen) |
| 153 | IntelPanel | - | dead | - | delete |
| 154 | BottomPanel | Hub-2 | (StatusBar 흡수) | - | absorb |
| 155 | DashActivityGrid | Hub-1 dashboard | L1 | keep |
| 156 | WVPLCard | Hub-1 dashboard 통계 | L2 | keep |
| 157 | AppSurfaceHeader | Hub-1/3/4/5 surface 공통 헤더 | L1 | keep |
| 158 | LiveStatStrip | Hub-1 landing | L1 | keep |
| 159 | MiniLiveChart | Hub-1 landing | L2 | keep |
| 160 | LocaleToggle | global header | L2 | keep |
| 161 | FeedbackButton | global footer | L2 | keep |
| 162 | DogeOSWalletButton | TopBar 우측 | L1 | keep |
| 163 | TelegramConnectWidget | Hub-5 settings 알림 탭 | L2 | keep |
| 164 | TVImport/ConstraintLadder | Hub-4 research/import | L2 | keep |
| 165 | TVImport/HypothesisCard | Hub-4 research/import | L2 | keep |
| 166 | TVImport/IdeaTwinCard | Hub-4 research/import | L2 | keep |
| 167 | confluence/ConfluenceBanner | Hub-2 stage-top-strip / Hub-1 hero | L2 | keep |
| 168 | confluence/ConfluencePeekChip | Hub-2 ANL inline | L2 | keep |
| 169 | confluence/DivergenceAlertToast | Hub-2 toast | L1 | keep |
| 170 | indicators/IndicatorCatalogModal | Hub-2 IND drawer | L3 | keep ★ N4 |
| 171 | indicators/IndicatorCurve | inside indicator render | structural | keep |
| 172 | indicators/IndicatorDivergence | Hub-2 indicator render | structural | keep |
| 173 | indicators/IndicatorFallback | error boundary | structural | keep |
| 174 | indicators/IndicatorGauge | render | structural | keep |
| 175 | indicators/IndicatorHeatmap | render | structural | keep |
| 176 | indicators/IndicatorHistogram | render | structural | keep |
| 177 | indicators/IndicatorPane | render wrapper | structural | keep |
| 178 | indicators/IndicatorRegime | render | structural | keep |
| 179 | indicators/IndicatorRenderer | dispatcher | structural | keep |
| 180 | indicators/IndicatorSankey | render | structural | keep |
| 181 | indicators/IndicatorStratified | render | structural | keep |
| 182 | indicators/IndicatorTimeline | render | structural | keep |
| 183 | indicators/IndicatorVenueStrip | render | structural | keep |
| 184 | scroll/ScrollAnalysisCard | Hub-2 ANL drawer | L3 | keep |
| 185 | scroll/ScrollAnalysisDrawer | Hub-2 drawer | L3 | keep |
| 186 | search/SearchLayerBadge | global search results | L2 | keep |
| 187 | search/SearchResultCard | global search | L2 | keep |
| 188 | search/SearchResultList | global search | L2 | keep |
| 189 | search/SearchResultMiniChart | global search | L2 | keep |
| 190 | ui/Icon | global | structural | keep |
| 191 | ui/Tooltip | global | structural | keep |
| 192 | NEW: NavInboxBadge | global TopBar 우상단 | L2 | new ★ N3 — limit=10 unread count dot |
| 193 | NEW: DailyDigestSettings | Hub-5 settings 알림 탭 | L2 | new ★ N2 — toggle + 시각 |

(Helpers / utility files: structural — 직접 surface 등장 없음. 위 ~189 unique entries 충분.)

---

## 4. Scope (in/out)

### In-Scope

- 24 라우트 → 위 §1.9 결정 적용 (KEEP 21 / CONSOLIDATE 9 / REDIRECT 5 / DELETE 3)
- `/patterns` 4탭 라우터 통합 (sub-route → tab query param)
- `/scanner`, `/analyze`, `/terminal`, `/status`, `/lab/health` redirect
- IndicatorCatalogModal canonical 통합 (IndicatorLibrary 흡수)
- AIAgentPanel canonical 통합 (peek/AIAgentPanel + AIPanel 흡수)
- DecideRightPanel → JudgePanel JDG drawer 흡수
- peek/* 9개 dup 컴포넌트 삭제 + warroom/connectors/IntelPanel dead code 삭제 (총 14개)
- Terminal* 5개 (LeftRail/RightRail/CommandBar/CollectedMetricsDock/MarketDrawer) absorb/delete
- HoldTimeStrip → StatusBar mount 검증
- StreakBadgeCard → `/passport` 외 `/dashboard` hero 추가 mount
- VerdictInboxSection → `/patterns` 우측 column + `/dashboard` 추가 mount
- NavInboxBadge (신규 컴포넌트) → 글로벌 TopBar 우상단 (N3 inbox count dot)
- DailyDigestSettings (신규) → `/settings` 알림 탭 (N2 toggle)
- foldable panels (N8) shell.store persistence 검증
- IndicatorCatalogModal Recents/Favorites sections 검증 (N5)
- Multi-instance indicator config UX (PaneInfoBar에 instance label 표시, N6)
- shell.store 확장 (foldable state, instanceId map)
- Mobile bottom-sheet right-panel (5탭)
- Telemetry: workmode_switch / rightpanel_tab_switch / verdict_submit / topbar_tf_switch / streak_view / digest_toggle / inbox_dot_click
- 전 PR vitest + svelte-check + Playwright 검증

### Out-of-Scope

- 새 indicator 알고리즘 (registry 그대로, multi-instance만 활용)
- 새 AI 모델 / panelAdapter 변경
- 신규 backend endpoint (기존 50+ + W-0401에서 추가된 verdict/streak/digest 활용)
- 모바일 native rewrite
- copy_trading, leaderboard, AI 차트분석 generation, real-money auto-trading (Frozen)
- 새 메모리 stack (Frozen)
- TradingView Replay / Screenshot (후속 W)
- Drawing 영구 DB 저장 (현재 localStorage 그대로)

---

## 5. Non-Goals

- 페이지별 visual redesign (색/spacing tweak) — Wave 7 W-0405
- 새 페이지 추가 (현 24개 안에서 정리)
- 백엔드 schema 변경 (Wave 5 W-1003 결과 그대로)
- 사용자 데이터 마이그레이션 (저장된 indicator 설정은 그대로 호환 — IndicatorCatalogModal 흡수 시 keys 동일)
- TradingView library v5 마이그레이션 (별 wave)
- 5-Hub IA 자체 변경 (W-0374 머지 결과 그대로)

---

## 6. CTO 관점

### 6.1 Risk Matrix (≥ 12)

| ID | Risk | 확률 | 영향 | 완화 |
|---|---|---|---|---|
| R1 | redirect (/scanner /analyze /terminal /status /lab/health) 외부 북마크 깨짐 | M | L | 301 영구 + sitemap.xml 갱신 + analytics `legacy_alias` 30일 추적 |
| R2 | `/patterns/[sub]` consolidate 시 SEO 권한 손실 | M | M | 각 sub-page → 301 with query → 1주 search console reindex |
| R3 | peek/* 14개 삭제 시 import 누락된 살아있는 곳 발견 | M | M | 각 삭제 전 `grep -rn '<componentName>'` + CI build green + Playwright smoke |
| R4 | DecideRightPanel → JDG drawer 흡수 시 verdict 제출 회귀 | H | H | feature flag `decide_in_jdg=on`, 1주 카나리, e2e verdict submit ≥ 95% |
| R5 | IndicatorCatalogModal canonical 통합 시 favorites localStorage key 충돌 | M | M | migration shim: `cogochi.indicator.favorites.v2` (v1 read 후 변환 1회) |
| R6 | foldable panels persistence main browser tab 간 race | L | L | broadcastChannel sync, last-write-wins |
| R7 | NavInboxBadge limit=10 polling 부담 | L | L | SSE or 30s polling + dedup; visibility=hidden 시 정지 |
| R8 | StreakBadgeCard `/dashboard` hero에 두 번째 mount 시 query 중복 | L | L | shared store + single fetch (TanQuery 캐시) |
| R9 | DailyDigest toggle settings → backend cron 동기 | M | M | settings save → POST `/api/digest/preferences`; cron job read on tick |
| R10 | Multi-instance indicator (N6) state shape 호환 깨짐 | M | H | shell.store schema bump v3, migration shim 일회성 |
| R11 | Mobile bottom-sheet 5탭 swipe gesture 충돌 (chart pan과) | H | M | sheet visible 시 chart pan disable + swipe threshold 50px |
| R12 | `/patterns` tab router 구현 시 기존 `+page.svelte` URL state mismatch | M | M | searchParams `tab=` 표준화 + 각 sub-route page → load redirect |
| R13 | observe mode `.chart-header--tv` 숨김 regression (N9) | M | M | Playwright observe-mode 시각 회귀 테스트 추가 |
| R14 | 200+ 컴포넌트 import tree refactor 중 다른 worktree 충돌 | H | M | file-lock protocol (own.sh) + PR당 ≤ 8 files |
| R15 | bundle size 증가 (NavInboxBadge + DailyDigestSettings 신규) | L | L | dynamic import + bundle baseline 측정 |
| R16 | telemetry event 이름 충돌 (workmode_switch 기존 vs rev2) | L | L | 공통 namespace `wave6.*` 도입 후 dual-emit 1주 |
| R-17 | ChartBoardHeader CSS regression (W-0402 lesson) | M | H | observe-mode `.chart-header--tv` 숨김 금지 — preview server cwd 확인 필수; visual regression test on /cogochi route required in CI |

### 6.2 Dependencies

- **Upstream merged**: W-0374 5-Hub IA, W-0395B HoldTime, W-0399-P2 multi-instance, W-0400 Phase1+2 catalog, W-0401 P1-P4 streak/digest/inbox, W-0402 foldable panels — all main=`940e0955`
- **Internal libs**: lightweight-charts v4, Svelte 5 runes, TanQuery, Supabase client
- **External**: 없음 (모든 endpoint 기존 + W-0401 결과 활용)
- **Tooling**: Playwright (시각 회귀), vitest (≥ 1955 baseline), svelte-check (0 errors)

### 6.3 Rollback

- PR 단위 atomic revert
- Feature flag `wave6_decomposition=on` (PR4 부터, default off → 1주 카나리)
- localStorage migration v2→v3 reversible (v2 keys 보존 1주, ?legacy_keys=1 escape hatch)
- redirect 영구 keep (revert 시에도 alias 유지)

### 6.4 Files Touched

#### 신규 생성

- `app/src/lib/components/header/NavInboxBadge.svelte` (N3)
- `app/src/lib/components/settings/DailyDigestSettings.svelte` (N2)
- `app/src/routes/scanner/+page.server.ts` (redirect)
- `app/src/routes/analyze/+page.server.ts` (redirect)
- `app/src/routes/terminal/+page.server.ts` (redirect, exists; verify)
- `app/src/routes/status/+page.server.ts` (redirect)
- `app/src/routes/lab/health/+page.server.ts` (redirect)
- `app/src/routes/patterns/_tabs/{Library,Benchmark,Lifecycle,Strategies,Search}.svelte` (5 신규)
- `app/src/lib/hubs/terminal/migrations/indicatorFavoritesV2.ts` (one-shot migration)

#### 수정

- `app/src/lib/hubs/terminal/TopBar.svelte` (NavInboxBadge mount + IND trigger 정리)
- `app/src/lib/hubs/terminal/StatusBar.svelte` (HoldTimeStrip mount 검증)
- `app/src/lib/hubs/terminal/shell.store.ts` (foldable state + instanceId map)
- `app/src/lib/hubs/terminal/Splitter.svelte` (⌘[ ⌘] ⌘\\ ⌘0 wiring 검증)
- `app/src/lib/hubs/terminal/sheets/IndicatorLibrary.svelte` → rename `IndicatorCatalogModal.svelte` (또는 components/indicators canonical 사용)
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` (DecideRightPanel 흡수)
- `app/src/lib/hubs/terminal/workspace/JudgePanel.svelte` (decide drawer 통합)
- `app/src/routes/patterns/+page.svelte` (4탭 router)
- `app/src/routes/patterns/+layout.svelte` (TabBar)
- `app/src/routes/patterns/{benchmark,lifecycle,search,strategies}/+page.server.ts` (redirect)
- `app/src/routes/dashboard/+page.svelte` (StreakBadgeCard hero + VerdictInboxSection mount)
- `app/src/routes/passport/+page.svelte` (StreakBadgeCard 위치 검증)
- `app/src/routes/settings/+page.svelte` (DailyDigestSettings mount)
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (foldable wired + observe mode CSS regression test)

#### 폐기 (이동/통합 후 삭제)

- `app/src/lib/hubs/terminal/peek/{AIAgentPanel,CenterPanel,IndicatorPanel,JudgePanel,ModePill,PeekDrawer,RightRailPanel,ScanGrid,WatchlistRail}.svelte` (9개 dup)
- `app/src/lib/hubs/terminal/panels/warroom/{WarRoom,WarRoomFooterSection,WarRoomHeaderSection,WarRoomSignalFeed}.svelte` (4개 dead)
- `app/src/lib/hubs/terminal/panels/connectors/{GmxTradePanel,PolymarketBetPanel}.svelte` (2개 dead)
- `app/src/lib/hubs/terminal/panels/IntelPanel.svelte` (dead)
- `app/src/lib/hubs/terminal/workspace/{TerminalLeftRail,TerminalRightRail,TerminalCommandBar,CollectedMetricsDock,MarketDrawer}.svelte` (5)
- `app/src/lib/hubs/terminal/workspace/{TerminalContextPanel,TerminalContextPanelSummary,TerminalHeaderMeta,TerminalBottomDock,BottomPanel}.svelte` (5; absorb after verify)
- `app/src/lib/hubs/terminal/workspace/cogochi-components/DrawerSlide.svelte` (dup)
- `app/src/lib/hubs/terminal/workspace/PineScriptGenerator.svelte` (canonical PineGenerator 사용)
- `app/src/routes/patterns/filter-drag/+page.svelte` (실험)
- `app/src/routes/terminal/peek/+page.svelte` (peek 라우트 deprecate)

#### 보존 (no-op)

- 모든 chart 인프라 (`app/src/lib/hubs/terminal/CgChart.svelte` 등)
- indicator registry 전체
- 모든 API endpoint
- LiveDecisionHUD / panelAdapter (W-0309 wired)
- W-0395B/W-0399/W-0400/W-0401/W-0402 결과 그대로

---

## 7. AI Researcher 관점

### 7.1 Data Impact

| 데이터 | 변화 | 활용 |
|---|---|---|
| `page_view {route}` | redirect 후 alias 분포 변화 | session 합산 — `/cogochi` 단일 카운트 |
| `verdict_submit` | DecideRightPanel → JDG drawer 후 latency / completion | UX 변경 효과 검증 |
| `streak_view` (신규) | StreakBadgeCard `/dashboard` hero 추가 mount | streak 시인성 → 재방문 효과 |
| `digest_toggle` (신규) | settings에서 ON/OFF 전환 | digest opt-in rate |
| `inbox_dot_click` (신규) | NavInboxBadge 클릭 → /verdict 이동 | inbox conversion |
| `multi_instance_add` (신규) | IndicatorCatalogModal에서 instance 추가 | multi-instance 사용도 |
| `panel_fold_toggle` (신규) | ⌘[/]/\\/0 사용 분포 | foldable feature 사용도 |

### 7.2 Statistical Validation

- A/B: `wave6_decomposition=on` vs off, primary = D+7 cogochi 활성 사용자 수 (n ≥ 200)
- Secondary:
  - `/patterns` 탭 진입율 (consolidate 효과: ≥ 30% 목표)
  - verdict submit completion rate (regression 0 가정, ≥ 95% 유지)
  - streak >= 7d 사용자 비율 (StreakBadgeCard `/dashboard` 추가 mount 효과: +10% 목표)
  - digest opt-in rate (≥ 25% 목표 in 1주)
- Tertiary:
  - panel-fold 사용 분포 (≥ 30% 사용자가 1회 이상)
  - bundle size delta (≤ +30KB 목표; peek/* 삭제로 -50KB 기대 → net negative)

### 7.3 Failure Modes

- **F1 redirect 무한 루프**: `/scanner` → `/cogochi?panel=scn` 인데 cogochi가 panel param 무시 시 사용자 길을 잃음. mit: panel param 강제 default + 페이지 진입 후 SCN 탭 자동 선택.
- **F2 dup 삭제 후 unmount panic**: peek/AIAgentPanel 사라졌는데 어딘가 import 살아있음. mit: PR3에서 grep + tsc + Playwright smoke + 1주 sentry 모니터.
- **F3 favorites migration 실패**: v1 키 못 읽음 → 사용자 즐겨찾기 손실. mit: try/catch + fallback 빈 배열 + sentry 보고.
- **F4 foldable persist 깨짐**: ⌘\\ 후 새로고침했더니 panel 안 돌아옴. mit: localStorage schema 검증 + default reset on parse error.
- **F5 mobile bottom-sheet 5탭 사용 어려움**: tap target 너무 작음. mit: 44px 최소 target + horizontal scroll on overflow.
- **F6 NavInboxBadge polling 비용**: 30s polling × 1000 사용자 = backend 부담. mit: SSE 또는 visibility-aware polling + cache.

### 7.4 Research Priorities

1. multi-instance indicator usage data → 어떤 family가 다중으로 가장 자주 사용되는지 (VWAP D+W vs RSI 14+21)
2. panel-fold usage → chart full-screen mode 비율 (집중 분석 모드)
3. streak D+7 retention 효과 (StreakBadgeCard 추가 mount 정량화)
4. digest opt-in segmenting (Pro vs Free 차이)
5. consolidate 후 `/patterns` 탭 dwell time 분포

---

## 8. Decisions

### D-0403-1 right-panel tab 갯수
- **Yes**: 5탭 (AI / ANL / SCN / JDG / PAT) — PRODUCT-DESIGN-PAGES-V2 P-02 spec 준수
- Reject 3탭: AI/ANL/SCN/JDG/PAT 책임 모호해짐
- Reject 7탭: tab strip 280px에 안 맞음

### D-0403-2 detail expand UX
- **Yes**: drawer slide-out (320 → 480px, ease-out 200ms)
- Reject modal: 차트 가림 (사용자 피드백 W-0374 D-2와 동일)
- Reject full-page: 컨텍스트 손실

### D-0403-3 Timeframe picker 위치
- **Yes**: TopBar (글로벌 — 모든 hub에서 보임)
- Reject chart toolbar 단독: Hub-3에서도 TF context 필요
- Reject dual: 중복

### D-0403-4 Indicator Library trigger
- **Yes**: TopBar [IND] 버튼 + ⌘L → IndicatorCatalogModal (drawer 좌측 슬라이드)
- Reject sidebar 영구: 280px 영구 점유
- Reject modal 가운데: 차트 시야 가림

### D-0403-5 IndicatorCatalogModal 내 sections 순서
- **Yes**: Favorites → Recents → Categories
- 이유: 사용자 자주 쓰는 것 우선 (W-0400 Ph1C 결과)

### D-0403-6 drag-to-save UX (W-0374 D-6 재확인)
- **Yes**: RangeActionToast 5초 4-action (Save / Find Pattern / Draft Setup / Cancel)
- chart top-center toast (floating action 거절)

### D-0403-7 mobile bottom-sheet
- **Yes**: 5탭 horizontal scroll strip + swipe-up sheet
- Reject new route per tab: contextual loss

### D-0403-8 `/agent` fate
- **Yes**: KEEP (Phase 2 자동매매 marketing landing)
- Reject delete: 외부 marketing CTA target 필요

### D-0403-9 `/analyze` fate
- **Yes**: REDIRECT → `/cogochi?panel=anl`
- Reject keep: TradeMode AnalyzePanel와 중복

### D-0403-10 `/lab` fate
- **Yes**: KEEP (Pro+ 도구함, /lab/health만 흡수)
- Reject delete: research/import/lab analyze 책임 분명

### D-0403-11 `/passport` vs `/settings/passport`
- **Yes**: 둘 다 KEEP — `/passport` = my view (StreakBadgeCard ★), `/settings/passport` = 설정 form
- Reject 통합: 책임 다름 (view vs edit)

### D-0403-12 `/strategies` fate
- **Yes**: CONSOLIDATE → `/patterns?tab=strategies`
- Reject keep standalone: P-04 4탭 spec 위반

### D-0403-13 `/benchmark` fate
- **Yes**: CONSOLIDATE → `/patterns?tab=benchmark`
- 이유: P-04 spec

### D-0403-14 `/research/*` fate
- **Yes**: KEEP (전부) except `/research/ledger` → `/lab/ledger` (개발자 도구는 lab)
- Reject 일괄 삭제: research feature 책임 명확 (battle/cycle/diff/ensemble/import)

### D-0403-15 `/scanner` fate
- **Yes**: REDIRECT → `/cogochi?panel=scn` (ScanPanel SCN 탭 활성)
- Reject keep: ScanPanel SCN과 중복

### D-0403-16 `/status` vs `/settings/status` vs `/lab/health`
- **Yes**: `/settings/status` canonical, `/status` redirect, `/lab/health` redirect
- 이유: 사용자 관점 system health = settings 영역

### D-0403-17 `/patterns/filter-drag` fate
- **Yes**: DELETE — filter UX는 본 page tab의 IndicatorFilterPanel로 흡수
- Reject keep: 실험용 dead surface

### D-0403-18 `/terminal/peek` fate
- **Yes**: DELETE — peek/* 컴포넌트 9개 전부 dup으로 정리
- Reject keep: canonical AIAgentPanel/WatchlistRail로 책임 통합

### D-0403-19 NewsFlashBar 위치
- **Yes**: Hub-1 `/dashboard` 최근 활동 zone (canonical mount)
- Hub-2는 옵션 dismissable (현재 mount 유지)
- 이유: P-03 "recent activity"에 spec 명시 + cogochi chrome 가벼움

### D-0403-20 StreakBadgeCard 위치 (N1)
- **Yes**: Hub-1 `/passport` (canonical) + `/dashboard` Hero 추가 mount (시인성)
- shared store로 데이터 fetch dedup
- Reject 단일 mount: dashboard 첫 진입에서 streak 안 보이면 동기 부여 약함

### D-0403-21 Daily Digest delivery surface (N2)
- **Yes**: 이메일 + Telegram 둘 다 (백엔드 cron 그대로) + Hub-5 settings 알림 탭에 toggle + 시간 picker
- 표면 자체는 이메일/Telegram이지만 control은 settings에 있어야 함
- Reject /dashboard 표시: 매일 보는 거라 noise

### D-0403-22 Inbox count badge 위치 (N3)
- **Yes**: TopBar 우상단 NavInboxBadge (글로벌 — 모든 hub)
- 추가로 StatusBar mini "verdict<N>" 유지 (Hub-2 only)
- Reject TabBar 내부: 탭 전환 컨텍스트와 충돌

### D-0403-23 Multi-instance indicator UX (N6)
- **Yes**: PaneInfoBar에 instance label 명시 ("VWAP daily", "VWAP weekly"), IndicatorCatalogModal에서 "Add as new instance" 옵션
- shell.store에 `instanceId` map per pane
- Reject 동일 family 다중 추가 silent: 사용자가 어느 게 어느 건지 모름

### D-0403-24 Catalog Favorites/Recents (N5) — `/dashboard` quick-add 표면 추가 여부
- **No** — 현재 IndicatorCatalogModal 안에만 노출 (W-0400 결과 그대로)
- Reject `/dashboard` 노출: dashboard는 행동 유도판, indicator 추가는 Hub-2 컨텍스트

### D-0403-25 HoldTimeStrip 위치 (N7)
- **Yes**: StatusBar 안 (Hub-2 only)
- Reject TopBar: chrome 두꺼워짐

### D-0403-26 redirect 시 query string 보존
- **Yes**: 보존 (`/scanner?x=y` → `/cogochi?panel=scn&x=y`)
- 외부 deeplink 호환

---

## 9. Open Questions

| ID | 질문 | 결정 deadline |
|---|---|---|
| Q-0403-1 | NavInboxBadge polling 방식: SSE vs 30s polling vs WebSocket re-use? | PR4 시작 전 |
| Q-0403-2 | DailyDigest 시각 picker — 분 단위 vs 30분 단위 vs hour-only? | PR5 시작 전 |
| Q-0403-3 | `/research/ledger` 이전 시 기존 URL 어떻게 (301 vs 410)? | PR2 |
| Q-0403-4 | foldable 단축키 mac vs windows ⌘ vs Ctrl 분기? | PR3 |
| Q-0403-5 | Multi-instance instanceId naming 규칙 (`vwap_1` vs `vwap_daily` 사용자 입력 vs auto)? | PR6 |
| Q-0403-6 | StreakBadgeCard `/dashboard` hero에 어느 위치 (왼쪽 wallet 옆 vs 오른쪽 tier 옆)? | PR5 |
| Q-0403-7 | peek/* 14개 삭제를 한 PR로 vs 3그룹으로? | PR3 (현재 plan = 한 PR, 회귀 시 분할) |
| Q-0403-8 | DecideRightPanel JDG 흡수 시 deeplink `/cogochi?decide=verdictId` 유지? | PR7 |
| Q-0403-9 | `/patterns` tab=lifecycle/benchmark URL 진입 시 default sort 무엇? | PR2 |
| Q-0403-10 | Mobile bottom-sheet 5탭 swipe + chart pan 동시 — gesture 우선순위? | PR8 |
| Q-0403-11 | observe-mode `.chart-header--tv` regression — Playwright snapshot 기준 어디서 (preview vs prod)? | PR1 |
| Q-0403-12 | wave6 telemetry namespace `wave6.*` vs 기존 이름 유지 — dual-emit 1주 기간? | PR1 |
| Q-0403-13 | bundle size baseline = pre-PR1 main `940e0955` 그대로 vs PR3 dead-code 삭제 후? | PR3 |

---

## 10. PR Breakdown (≥ 8 PRs, shell → data → GTM → expand)

> 규칙: 각 PR 독립 deployable, ≤ 8 files, AC 수치 (PR1-2 est., PR3+ GTM data 활용), "검증 포인트" 1줄.

### PR 1 — shell: route redirects + telemetry namespace (Effort: S, est. 2일)

**목적**: 가장 작은 blast radius로 alias 분산 합산 시작.
**파일** (≤ 8):
- `app/src/routes/scanner/+page.server.ts` (redirect)
- `app/src/routes/analyze/+page.server.ts` (redirect)
- `app/src/routes/status/+page.server.ts` (redirect)
- `app/src/routes/lab/health/+page.server.ts` (redirect)
- `app/src/routes/terminal/+page.server.ts` (verify or add)
- `app/src/lib/hubs/terminal/telemetry.ts` (wave6.* namespace dual-emit)
- `app/src/app.html` 또는 sitemap (`app/src/routes/sitemap.xml/+server.ts`) — alias drop
- `work/log/<date>.md`

**Exit (est.)**:
- [ ] PR1-AC1: 5 alias 모두 301 → canonical (`curl -I` 검증)
- [ ] PR1-AC2: query string 보존 (`/scanner?x=y` → `/cogochi?panel=scn&x=y`)
- [ ] PR1-AC3: telemetry dual-emit (기존 + wave6.*) 작동
- [ ] PR1-AC4: CI green (App + Engine + Contract)

**검증 포인트**: alias 분산 합산 → cogochi 활성 사용자 단일 카운트로 D+1 베이스라인.

---

### PR 2 — shell: `/patterns` 4탭 router consolidate (Effort: M, est. 3일)

**목적**: P-04 4탭 spec 정착 + 4 sub-route → tab query 통합.
**파일** (≤ 8):
- `app/src/routes/patterns/+page.svelte` (탭 router)
- `app/src/routes/patterns/+layout.svelte` (TabBar)
- `app/src/routes/patterns/{benchmark,lifecycle,search,strategies}/+page.server.ts` (4 redirect)
- `app/src/routes/patterns/_tabs/Library.svelte` (신규 골조 — 빈 진입)
- `app/src/routes/strategies/+page.server.ts` (redirect → `/patterns?tab=strategies`)

**Exit (est.)**:
- [ ] PR2-AC1: 4 redirect 모두 301 + ?tab= 부착
- [ ] PR2-AC2: TabBar 4탭 표시 + URL `?tab=` 동기
- [ ] PR2-AC3: 기존 sub-route 진입 시 tab query 보존 redirect
- [ ] PR2-AC4: SEO sitemap 갱신
- [ ] PR2-AC5: CI green + Playwright `/patterns?tab=benchmark` smoke

**검증 포인트**: 4탭 진입율 분포 → 어느 탭이 사용자에게 가장 가치있는지 D+7 측정.

---

### PR 3 — data cleanup: peek/warroom/connectors/IntelPanel/Terminal* dead-code 삭제 (Effort: M, est. 3일)

**목적**: 14개 dup + dead 컴포넌트 제거, bundle 감소, GTM 베이스라인 emit 시작.
**파일** (≤ 8 — 삭제 위주, group A):
- `app/src/lib/hubs/terminal/peek/{AIAgentPanel,CenterPanel,IndicatorPanel,JudgePanel,ModePill,PeekDrawer,RightRailPanel,ScanGrid,WatchlistRail}.svelte` (9 delete)
- 두 번째 PR 또는 같은 PR로 분할: warroom 4 + connectors 2 + IntelPanel 1 (회귀 위험 시 PR 3a / 3b 분할)
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (import 정리)
- `app/src/routes/terminal/peek/+page.svelte` (delete)
- `work/log/<date>.md`

**Exit**:
- [ ] PR3-AC1: 14개 컴포넌트 파일 0 (`find ... -name '<name>.svelte'`)
- [ ] PR3-AC2: `pnpm build` green + bundle delta ≥ -40KB (실측 emit)
- [ ] PR3-AC3: import grep 0 hit on deleted names
- [ ] PR3-AC4: cogochi Playwright smoke (chart load + AIAgentPanel render)
- [ ] PR3-AC5: telemetry `wave6.cleanup_done` event emitted

**검증 포인트**: bundle size 실측 → PR4+ 추가 mount 비용 baseline.

---

### PR 4 — GTM: NavInboxBadge (N3) global TopBar mount (Effort: S, est. 2일)

**목적**: 글로벌 inbox count → /verdict 진입 funnel data 시작.
**파일** (≤ 8):
- `app/src/lib/components/header/NavInboxBadge.svelte` (신규)
- `app/src/lib/hubs/terminal/TopBar.svelte` (mount)
- `app/src/lib/components/surfaces/AppSurfaceHeader.svelte` (Hub-1/3/4/5 mount)
- `app/src/lib/hubs/terminal/telemetry.ts` (`inbox_dot_click` 이벤트)
- (필요 시) `app/src/routes/api/inbox/+server.ts` 또는 fetch wrapper
- 테스트 1-2개

**Exit**:
- [ ] PR4-AC1: 5 hub 모두 NavInboxBadge 표시 (실측 Playwright)
- [ ] PR4-AC2: limit=10 unread count fetch (cache 30s)
- [ ] PR4-AC3: 클릭 → /verdict 이동 + telemetry emit
- [ ] PR4-AC4: count = 0일 때 dot 숨김
- [ ] PR4-AC5: visibility=hidden 시 polling 정지

**검증 포인트**: inbox click conversion rate (PR3 baseline 대비).

---

### PR 5 — expand: StreakBadgeCard (N1) /dashboard hero + DailyDigestSettings (N2) (Effort: M, est. 3일)

**목적**: streak 시인성 ↑ + digest opt-in surface 제공.
**파일** (≤ 8):
- `app/src/routes/dashboard/+page.svelte` (Hero에 StreakBadgeCard mount)
- `app/src/routes/passport/+page.svelte` (위치 검증)
- `app/src/lib/components/passport/StreakBadgeCard.svelte` (shared store hook)
- `app/src/lib/components/settings/DailyDigestSettings.svelte` (신규 toggle + 시각)
- `app/src/routes/settings/+page.svelte` (mount)
- `app/src/lib/stores/streak.store.ts` (shared fetch dedup, 신규)
- (필요 시) `app/src/routes/api/digest/preferences/+server.ts`

**Exit**:
- [ ] PR5-AC1: `/dashboard` Hero에 StreakBadgeCard 렌더 (D-0403-20)
- [ ] PR5-AC2: shared store dedup → /passport와 /dashboard fetch 1회
- [ ] PR5-AC3: settings 알림 탭에 DailyDigestSettings (toggle + hour picker)
- [ ] PR5-AC4: toggle save → POST `/api/digest/preferences` 200
- [ ] PR5-AC5: telemetry `streak_view`, `digest_toggle` emit

**검증 포인트**: streak 7d+ 사용자 비율 D+7 변화 + digest opt-in rate.

---

### PR 6 — expand: IndicatorCatalogModal canonical 통합 + Multi-instance UX (N4/N5/N6) (Effort: L, est. 4일)

**목적**: indicator surface 단일화 + multi-instance label.
**파일** (≤ 8):
- `app/src/lib/components/indicators/IndicatorCatalogModal.svelte` (canonical, Favorites + Recents sections 검증)
- `app/src/lib/hubs/terminal/sheets/IndicatorLibrary.svelte` (deprecate 또는 thin wrapper)
- `app/src/lib/hubs/terminal/IndicatorSettingsSheet.svelte` (multi-instance config panel)
- `app/src/lib/hubs/terminal/sheets/IndicatorSettingsSheet.svelte` (dedupe)
- `app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte` (instance label)
- `app/src/lib/hubs/terminal/shell.store.ts` (instanceId map, schema v3)
- `app/src/lib/hubs/terminal/migrations/indicatorFavoritesV2.ts` (one-shot migration)
- `app/src/lib/hubs/terminal/TopBar.svelte` (IND 버튼 → IndicatorCatalogModal trigger)

**Exit**:
- [ ] PR6-AC1: TopBar IND + ⌘L → IndicatorCatalogModal 동일 surface
- [ ] PR6-AC2: Favorites + Recents sections 표시 (W-0400 Ph1C 동작 보존)
- [ ] PR6-AC3: 같은 family 2개 이상 추가 시 PaneInfoBar에 instance label
- [ ] PR6-AC4: shell.store schema migration v2→v3 무손실 (favorites 보존)
- [ ] PR6-AC5: 기존 IndicatorLibrary entry 0 import (grep)
- [ ] PR6-AC6: vitest pane stack ≥ 5 신규 테스트 pass

**검증 포인트**: multi-instance 추가 분포 (어느 family가 다중으로 가장 자주).

---

### PR 7 — expand: DecideRightPanel → JDG drawer 흡수 + AIAgentPanel canonical (Effort: L, est. 4일)

**목적**: TerminalHub isDecideMode 분기 제거, P-02 5탭 spec 정착.
**파일** (≤ 8):
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIAgentPanel.svelte` (DecideRightPanel 흡수)
- `app/src/lib/hubs/terminal/workspace/JudgePanel.svelte` (decide drawer integration)
- `app/src/lib/hubs/terminal/DecideRightPanel.svelte` (delete or thin wrapper)
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (isDecideMode 분기 제거)
- `app/src/lib/hubs/terminal/panels/AIAgentPanel/AIPanel.svelte` (legacy alias 흡수)
- `app/src/routes/cogochi/+page.svelte` (deeplink `?decide=verdictId` 처리)
- `app/src/lib/hubs/terminal/telemetry.ts` (`decide_drawer_open` 이벤트)
- 테스트 1-2

**Exit**:
- [ ] PR7-AC1: TerminalHub LoC ≥ -80
- [ ] PR7-AC2: JDG 탭 클릭 → DecisionHUD inline + 더보기 → drawer (DecideRightPanel content)
- [ ] PR7-AC3: `/cogochi?panel=jdg&decide=<id>` deeplink 동작
- [ ] PR7-AC4: verdict submit e2e ≥ 95% (Playwright)
- [ ] PR7-AC5: feature flag `decide_in_jdg=on` 토글 가능

**검증 포인트**: verdict completion rate regression 0 + TerminalHub 단순화 확인.

---

### PR 8 — expand: Foldable persistence + observe-mode regression test + StatusBar HoldTimeStrip 검증 (Effort: M, est. 3일)

**목적**: W-0402/W-0395B 결과 안정화 + Wave 6 final polish.
**파일** (≤ 8):
- `app/src/lib/hubs/terminal/shell.store.ts` (foldable state schema)
- `app/src/lib/hubs/terminal/Splitter.svelte` (⌘[ ⌘] ⌘\\ ⌘0 wiring 검증)
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (foldable 적용 + observe `.chart-header--tv` regression test 추가)
- `app/src/lib/hubs/terminal/StatusBar.svelte` (HoldTimeStrip mount 검증)
- `app/src/lib/components/shared/HoldTimeStrip.svelte` (props 검증)
- `app/tests/e2e/observe-mode-chart-header.spec.ts` (Playwright)
- `app/tests/e2e/foldable-panels.spec.ts` (Playwright)
- `work/log/<date>.md`

**Exit**:
- [ ] PR8-AC1: ⌘[ ⌘] ⌘\\ ⌘0 모두 동작 + localStorage persist
- [ ] PR8-AC2: 새로고침 후 fold state 복원
- [ ] PR8-AC3: observe mode `.chart-header--tv` Playwright snapshot 통과 (regression 차단)
- [ ] PR8-AC4: StatusBar에 HoldTimeStrip p50/p90 표시
- [ ] PR8-AC5: telemetry `panel_fold_toggle` emit
- [ ] PR8-AC6: vitest + svelte-check + Playwright all green

**검증 포인트**: panel-fold 사용 분포 + HoldTime 시인성.

---

(추가 PR 후보 — 위 8개로 ≤ 8 files 룰 만족 못 할 시 분할)

### PR 9 (옵션) — Mobile bottom-sheet 5탭 polish

**목적**: mobile UX 정렬.

### PR 10 (옵션) — `/dashboard` VerdictInboxSection mount + NewsFlashBar primary mount 이전

**목적**: P-03 spec 일치.

---

## 11. Wave-Level Exit Criteria (≥ 25 ACs)

- [ ] WAC-1: 24 라우트 → 결정대로 (KEEP 21 / CONSOLIDATE 9 / REDIRECT 5 / DELETE 3) 적용 100%
- [ ] WAC-2: 5 redirect alias 모두 301 작동
- [ ] WAC-3: `/patterns` 4탭 router 작동 (Library/Benchmark/Lifecycle/Strategies)
- [ ] WAC-4: peek/* 9개 + warroom 4개 + connectors 2개 + IntelPanel = 16개 컴포넌트 삭제 완료
- [ ] WAC-5: Terminal* 5개 (LeftRail/RightRail/CommandBar/CollectedMetricsDock/MarketDrawer) 흡수/삭제 완료
- [ ] WAC-6: bundle size delta ≤ +30KB (peek 삭제 후 net negative 기대)
- [ ] WAC-7: NavInboxBadge 5 hub 모두 mount + limit=10 count 표시
- [ ] WAC-8: StreakBadgeCard `/dashboard` Hero + `/passport` 모두 렌더 (shared store dedup)
- [ ] WAC-9: DailyDigestSettings settings 알림 탭에 toggle + hour picker
- [ ] WAC-10: IndicatorCatalogModal canonical, Favorites + Recents sections 작동
- [ ] WAC-11: Multi-instance indicator instance label PaneInfoBar 표시
- [ ] WAC-12: shell.store v2→v3 migration 무손실
- [ ] WAC-13: foldable ⌘[ ⌘] ⌘\\ ⌘0 동작 + persist
- [ ] WAC-14: HoldTimeStrip StatusBar mount + p50/p90 표시
- [ ] WAC-15: DecideRightPanel JDG drawer 흡수 + TerminalHub LoC -80
- [ ] WAC-16: AIAgentPanel canonical 5탭 (AI/ANL/SCN/JDG/PAT) 모두 inline + drawer
- [ ] WAC-17: verdict submit e2e ≥ 95% completion
- [ ] WAC-18: observe mode `.chart-header--tv` Playwright snapshot 통과
- [ ] WAC-19: cogochi p50 LCP ≤ 2.5s (PR8 D+7 실측)
- [ ] WAC-20: INP ≤ 200ms p75 (탭 전환, drawer expand, TF 변경)
- [ ] WAC-21: CLS = 0 모든 hub
- [ ] WAC-22: vitest ≥ 1955 baseline + 신규 ≥ 25 추가 pass
- [ ] WAC-23: svelte-check 0 errors
- [ ] WAC-24: telemetry `wave6.*` namespace dual-emit 1주, 이후 legacy 정리
- [ ] WAC-25: streak D+7 7일+ 사용자 비율 baseline 측정 emit (효과 검증 데이터 확보)
- [ ] WAC-26: digest opt-in rate baseline 측정
- [ ] WAC-27: `/patterns` 4탭별 진입율 분포 측정
- [ ] WAC-28: panel-fold 사용 분포 측정
- [ ] WAC-29: 8 PR atomic merge + 각 PR ≤ 8 files
- [ ] WAC-30: CURRENT.md SHA wave6 머지 후 갱신 + sweep 8 항목

---

## 12. Owner

**app** — hjj032549@gmail.com

PR 분할 ≥ 8개. 검증 protocol: 각 PR 종료 시 vitest + svelte-check + Playwright (해당 hub 시각 회귀) + telemetry verify.

---

## 13. Facts (실측 path proof)

### 13.1 Top-level dirs

- `app/src/routes/` — 38 path (24 user-facing + api/healthz/readyz/sitemap/robots/+page/+layout)
- `app/src/lib/hubs/terminal/` — TerminalHub, TopBar, StatusBar, TabBar, BottomSheet, CgChart, DecideRightPanel, IndicatorSettingsSheet, MobileTopBar, ModeSheet, PhaseChart, Splitter, SymbolPickerSheet (top-level)
- `app/src/lib/hubs/terminal/L1/` — 5 shells
- `app/src/lib/hubs/terminal/panels/` — AIAgentPanel/, BottomPanel, DrawingRail, FlywheelStage, IntelPanel, QuizCard, RetrainCountdown, TerminalHoldTimeAdapter, TrainStage, WatchlistRail/, connectors/, warroom/
- `app/src/lib/hubs/terminal/peek/` — 9 dup files (정리 대상)
- `app/src/lib/hubs/terminal/sheets/` — AIParserModal, IndicatorLibrary, IndicatorSettingsSheet, ModeSheet
- `app/src/lib/hubs/terminal/workspace/` — ~70 components (실측 §1.1-1.7 표)

### 13.2 신규 since 2026-05-01 실측 (PR 머지)

- W-0395B (#?) HoldTimeStrip — `app/src/lib/components/shared/HoldTimeStrip.svelte`
- W-0399-P2 (#1042) multi-instance — VWAP daily+weekly, RSI 14+21
- W-0400 Ph1B (#?) IndicatorCatalogModal — `app/src/lib/components/indicators/IndicatorCatalogModal.svelte`
- W-0400 Ph1C (#1024) Catalog Favorites — localStorage `cogochi.indicator.favorites`, `cogochi.indicator.recents`
- W-0401-P1 (#1028, #1060) Streak — `app/src/lib/components/passport/StreakBadgeCard.svelte`
- W-0401-P2 (#1032) Inbox count — limit=10 nav dot
- W-0401-P3 (#1032) Daily digest — backend cron + email
- W-0402 (#1072, #1074) Foldable panels + ChartBoardHeader CSS + dev auth bypass
- W-0402 (#1066) Pattern Library auto-open removal

### 13.3 Verified counts

- 24 user-facing routes (excluding api/healthz/readyz/sitemap/robots)
- 200+ Svelte components in app/src/lib (full grep)
- 70+ indicator registry (W-0400 expansion to 30+ realized, target 70)
- 50+ API endpoints (§1.11)
- main SHA at design time: `940e0955`
- vitest baseline: ≥ 1955 pass (W-0395B 결과 기준)

---

END
