# Component Map — app/src/

> Generated: 2026-04-30 | Branch: feat/W-0353-composite-score
> Classification: USED / UNUSED(orphan) / PARTIAL(conditional)

---

## 폴더 구조 설명

### `app/src/components/` — 페이지에 직접 마운트되는 UI 컴포넌트

| 폴더 | 역할 |
|---|---|
| `terminal/` | 터미널 화면 전체. 하위 폴더로 분리됨 (아래 참고) |
| `terminal/chart/` | 차트 캔버스 위에 올라가는 레이어들 — CanvasHost(렌더링 루프), CaptureAnnotationLayer(캡처 마커), CaptureReviewDrawer(캡처 리뷰 슬라이드인), overlay/ |
| `terminal/mobile/` | 모바일 뷰포트 전용 화면 — ModeRouter가 Chart/Detail/Judge/Scan 4개 모드 중 하나 표시 |
| `terminal/peek/` | 슬라이드인/오버레이 패널 — CenterPanel(차트+분석 중앙), RightRailPanel(우측 verdict+신호), ScanGrid, JudgePanel, VerdictInboxPanel, PeekDrawer |
| `terminal/research/` | 리서치 탭 안에 들어가는 블록 컴포넌트들 — DualPaneFlow, Heatmap, InlinePrice, MetricStrip |
| `terminal/shell/` | 뷰포트별 껍데기 — TerminalShell이 DESKTOP/TABLET/MOBILE 분기, 각각 DesktopShell/TabletShell/MobileShell로 위임 |
| `terminal/warroom/` | WarRoom 화면 서브컴포넌트 (Header/SignalFeed/Footer) — 현재 WarRoom.svelte가 고아라 미사용 상태 |
| `terminal/workspace/` | 터미널 핵심 패널 — ChartBoard(OHLCV 멀티패인), TerminalContextPanel(분석 상세), DecisionHUD, WhaleWatchCard, ResearchPanel 등 |
| `chart/` | `routes/analyze` 전용 독립 차트 — ChartStage + DualPaneFlow/Heatmap/Price 렌더러 |
| `cogochi/` | Cogochi AI 어시스턴트 진입 UI — AlphaMarketBar(마켓 펄스 바), CgChart 등 |
| `dashboard/` | 관리자/내부 대시보드 컴포넌트 |
| `home/` | 랜딩 페이지 섹션들 — Hero, LearningLoop, SurfaceCards, FinalCta, SiteFooter, WebGLAscii 배경 |
| `lab/` | 백테스팅 랩 UI — Chart, Toolbar, RefinementPanel, ResultPanel, StrategyBuilder, PositionBar |
| `layout/` | 앱 공통 레이아웃 — Header, AppNavRail, AppTopBar, MobileBottomNav, ProfileDrawer |
| `modals/` | 전역 모달 — WalletModal(지갑 연결), PassportModal(멤버십), SettingsModal |
| `settings/` | 설정 화면 컴포넌트 |
| `shared/` | 앱 전체에서 재사용되는 공통 UI — ToastStack, NotificationTray, CookieConsent, EmptyState, StaleState, P0Banner |
| `states/` | 로딩/에러/연결끊김/스테일 상태 전용 화면 |
| `wallet-intel/` | 지갑 인텔리전스 화면 쉘 |

---

### `app/src/lib/` — 로직, 타입, 서버사이드, 재사용 컴포넌트

> `components/`가 "페이지가 직접 가져다 쓰는 것"이라면, `lib/`는 "내부 로직, 공유 컴포넌트, 서버 코드"

| 폴더 | 역할 |
|---|---|
| `lib/components/` | 여러 페이지에서 재사용되는 공통 컴포넌트 모음 |
| `lib/components/terminal/` | 터미널 공용 컴포넌트 — SplitPaneLayout, ModeToggle, hud/(DecisionHUD 서브카드들) |
| `lib/components/live/` | 실시간 신호 표시 — LiveSignalPanel |
| `lib/components/patterns/` | 패턴 카드/라이프사이클/Verdict 섹션 |
| `lib/components/indicators/` | 지표 패인 렌더러 |
| `lib/components/market/` | 마켓 데이터 표시 컴포넌트 |
| `lib/components/search/` | 검색 결과 리스트 |
| `lib/components/confluence/` | 멀티타임프레임 컨플루언스 표시 |
| `lib/components/ui/` | 버튼, 인풋 등 원시 UI 조각 |
| `lib/cogochi/` | Cogochi 앱 쉘 전체 — AppShell, WorkspaceStage, Sidebar, CommandBar, TabBar, modes/(Trade/Train/Radial), sections/ |
| `lib/chart-engine/` | 캔버스 차트 렌더링 엔진 — core(렌더루프), adapters(데이터 어댑터), contracts(타입계약), utils |
| `lib/engine/` | Python 엔진 API 클라이언트 — opportunityScanner, 이벤트, 메트릭, cogochi 연동 |
| `lib/data-engine/` | 프론트 데이터 파이프라인 — providers(CMC/Binance 등), cache, normalization, alignment, scheduler |
| `lib/server/` | SvelteKit 서버사이드 전용 코드 — `+server.ts` 에서만 import 가능. analyze/auth/scan/opportunity/pine/RAG/exchange 등 도메인별 분리 |
| `lib/stores/` | Svelte 스토어 — 터미널 상태, 모달 열림, 선택된 심볼 등 전역 상태관리 |
| `lib/contracts/` | 데이터 계약/타입 정의 — agent, facts, surface, search, runtime |
| `lib/confluence/` | MTF 컨플루언스 계산 로직 |
| `lib/guardrails/` | 결정 안전장치 — core, decision, runtime, transport |
| `lib/indicators/` | 지표 계산 (EMA, RSI 등) |
| `lib/intel/` | 인텔리전스 레이어 (기회 스코어, 시그널 분류) |
| `lib/research/` | 리서치 파이프라인 — baselines, evaluation, pipeline, source |
| `lib/terminal/` | 터미널 전용 로직 (상태 머신 등) |
| `lib/features/` | 피처 플래그 |
| `lib/types/` | 전체 공용 타입 정의 |
| `lib/utils/` | 날짜/숫자/문자열 유틸 |
| `lib/trade/` | 트레이딩 실행 로직 (GMX, Polymarket 등) |
| `lib/wallet/` | 지갑 연결/서명 로직 |
| `lib/wallet-intel/` | 온체인 지갑 분석 |
| `lib/webgl/` | WebGL 배경 애니메이션 (홈 페이지) |
| `lib/i18n/` | 국제화 — locales/ko, en |
| `lib/styles/` | 글로벌 CSS + 디자인 토큰 |
| `lib/api/` | HTTP API 클라이언트 래퍼 |
| `lib/config/` | 앱 설정값 (환경 분기 등) |
| `lib/market/` | 마켓 데이터 로직 |
| `lib/navigation/` | 라우팅/네비게이션 헬퍼 |
| `lib/seo/` | SEO 메타태그 |
| `lib/lab/` | 랩 백테스팅 로직 |

---

## Terminal Layout Architecture (실제 마운트 트리)

```
routes/terminal/+page.svelte
└── TerminalShell (shell/TerminalShell.svelte)
    ├── DesktopShell / TabletShell / MobileShell
    ├── TerminalCommandBar
    ├── AlphaMarketBar          ← cogochi/AlphaMarketBar.svelte
    ├── NewsFlashBar
    ├── SplitPaneLayout         ← lib/components/terminal/SplitPaneLayout.svelte
    │   ├── CenterPanel         ← peek/CenterPanel.svelte
    │   │   ├── ChartBoard      ← workspace/ChartBoard.svelte
    │   │   │   ├── chart/CanvasHost.svelte
    │   │   │   ├── chart/CaptureAnnotationLayer.svelte
    │   │   │   └── chart/CaptureReviewDrawer.svelte (conditional)
    │   │   ├── TerminalContextPanel ← workspace/TerminalContextPanel.svelte
    │   │   │   ├── VerdictHeader, ActionStrip, EvidenceGrid
    │   │   │   ├── WhyPanel, StructureExplainViz, SourceRow
    │   │   ├── ScanGrid        ← peek/ScanGrid.svelte
    │   │   └── JudgePanel      ← peek/JudgePanel.svelte
    │   └── RightRailPanel      ← peek/RightRailPanel.svelte  ← 실제 우측 레일
    │       ├── DecisionHUD     ← lib/components/terminal/hud/DecisionHUD.svelte
    │       ├── WhaleWatchCard  ← workspace/WhaleWatchCard.svelte
    │       ├── LiveSignalPanel ← lib/components/live/LiveSignalPanel.svelte
    │       └── PatternClassBreakdown
    ├── TerminalLeftRail        ← workspace/TerminalLeftRail.svelte (≥1280px)
    ├── MarketDrawer            ← workspace/MarketDrawer.svelte (tablet/mobile overlay)
    └── PatternLibraryPanel     ← workspace/PatternLibraryPanel.svelte (modal)
```

---

## USED Components (임포트 확인됨)

### Terminal — Core
| 파일 | 임포트처 |
|---|---|
| `peek/RightRailPanel.svelte` | terminal route |
| `peek/CenterPanel.svelte` | terminal route |
| `peek/VerdictInboxPanel.svelte` | terminal route |
| `peek/ScanGrid.svelte` | terminal route, peek route |
| `peek/JudgePanel.svelte` | terminal route, peek route |
| `peek/PeekDrawer.svelte` | terminal/peek route |
| `workspace/TerminalContextPanel.svelte` | terminal route, peek route |
| `workspace/ChartBoard.svelte` | peek route |
| `workspace/WorkspacePanel.svelte` | terminal route (conditional) |
| `workspace/TerminalLeftRail.svelte` | terminal route |
| `workspace/TerminalCommandBar.svelte` | terminal route, peek route |
| `workspace/MarketDrawer.svelte` | terminal route (conditional) |
| `workspace/PatternLibraryPanel.svelte` | terminal route (conditional) |

### Terminal — Chart
| 파일 | 임포트처 |
|---|---|
| `chart/CanvasHost.svelte` | ChartBoard |
| `chart/CaptureAnnotationLayer.svelte` | ChartBoard |
| `chart/CaptureReviewDrawer.svelte` | ChartBoard (conditional modal) |

### Terminal — HUD / Verdict
| 파일 | 임포트처 |
|---|---|
| `workspace/DecisionHUD.svelte` | RightRailPanel, terminal route |
| `lib/components/terminal/hud/DecisionHUD.svelte` | terminal route |
| `lib/components/terminal/hud/ActionsCard.svelte` | DecisionHUD |
| `lib/components/terminal/hud/EvidenceCard.svelte` | DecisionHUD |
| `lib/components/terminal/hud/PatternStatusCard.svelte` | DecisionHUD |
| `lib/components/terminal/hud/RiskCard.svelte` | DecisionHUD |
| `lib/components/terminal/hud/TransitionCard.svelte` | DecisionHUD |
| `workspace/WhaleWatchCard.svelte` | RightRailPanel |
| `lib/components/live/LiveSignalPanel.svelte` | RightRailPanel |
| `lib/components/patterns/PatternClassBreakdown.svelte` | RightRailPanel |
| `terminal/DirectionBadge.svelte` | 4곳 |
| `terminal/VerdictCard.svelte` | 2곳 |

### Terminal — Workspace Detail
| 파일 | 임포트처 |
|---|---|
| `workspace/VerdictHeader.svelte` | TerminalContextPanel |
| `workspace/ActionStrip.svelte` | TerminalContextPanel |
| `workspace/EvidenceGrid.svelte` | TerminalContextPanel |
| `workspace/WhyPanel.svelte` | TerminalContextPanel |
| `workspace/StructureExplainViz.svelte` | TerminalContextPanel |
| `workspace/SourceRow.svelte` | TerminalContextPanel |
| `workspace/EvidenceCard.svelte` | EvidenceGrid |
| `workspace/FreshnessBadge.svelte` | 여러 곳 |
| `workspace/SourcePill.svelte` | SourceRow |
| `workspace/SymbolPicker.svelte` | 1곳 |
| `workspace/ResearchPanel.svelte` | WorkspacePanel |
| `workspace/SaveSetupModal.svelte` | ChartBoard (conditional) |

### Terminal — Shell
| 파일 | 임포트처 |
|---|---|
| `shell/TerminalShell.svelte` | terminal layout |
| `shell/DesktopShell.svelte` | TerminalShell |
| `shell/MobileShell.svelte` | TerminalShell |
| `shell/TabletShell.svelte` | TerminalShell |

### Terminal — Mobile (viewport MOBILE만)
| 파일 | 임포트처 |
|---|---|
| `mobile/ModeRouter.svelte` | MobileShell |
| `mobile/ChartMode.svelte` | ModeRouter |
| `mobile/DetailMode.svelte` | ModeRouter |
| `mobile/JudgeMode.svelte` | ModeRouter |
| `mobile/ScanMode.svelte` | ModeRouter |
| `mobile/BottomTabBar.svelte` | ModeRouter |
| `mobile/MobileEmptyState.svelte` | MobileShell |
| `mobile/MobileOnboardingOverlay.svelte` | MobileShell |
| `mobile/MobilePromptFooter.svelte` | DetailMode/JudgeMode/ScanMode |
| `mobile/MobileSymbolStrip.svelte` | ChartMode |

### Terminal — Chart Pane
| 파일 | 임포트처 |
|---|---|
| `workspace/ChartPane.svelte` | ChartBoard |
| `workspace/ChartToolbar.svelte` | ChartPane |
| `workspace/PaneInfoBar.svelte` | ChartPane |
| `workspace/DrawingCanvas.svelte` | ChartPane |
| `workspace/DrawingToolbar.svelte` | ChartPane |

### Research Blocks
| 파일 | 임포트처 |
|---|---|
| `terminal/research/DualPaneFlowChartBlock.svelte` | ResearchPanel |
| `terminal/research/HeatmapFlowChartBlock.svelte` | ResearchPanel |
| `terminal/research/InlinePriceChartBlock.svelte` | ResearchPanel |
| `terminal/research/MetricStripBlock.svelte` | ResearchPanel |

### Global Layout
| 파일 | 임포트처 |
|---|---|
| `layout/Header.svelte` | +layout |
| `layout/AppNavRail.svelte` | +layout |
| `layout/AppTopBar.svelte` | +layout |
| `layout/MobileBottomNav.svelte` | +layout |
| `layout/ProfileDrawer.svelte` | +layout |
| `shared/ToastStack.svelte` | +layout |
| `shared/NotificationTray.svelte` | +layout |
| `shared/CookieConsent.svelte` | +layout |
| `modals/WalletModal.svelte` | +layout |
| `cogochi/AlphaMarketBar.svelte` | terminal route |

---

## UNUSED Components (고아 — 0 importers)

### 🔴 Terminal Root 고아
| 파일 | 비고 |
|---|---|
| `terminal/IntelPanel.svelte` | W-0350/W-0353 데이터 있음, 마운트 미연결 |
| `terminal/WarRoom.svelte` | 내부 subcomponent 존재하나 shell 없음 |
| `terminal/BottomPanel.svelte` | |
| `terminal/SingleAssetBoard.svelte` | |
| `terminal/VerdictBanner.svelte` | |
| `terminal/StrategyCard.svelte` | |
| `terminal/CompareWithBaselineToggle.svelte` | |
| `terminal/WorkspaceCompareBlock.svelte` | |

### 🔴 Workspace 고아 (~17개)
| 파일 |
|---|
| `workspace/BoardToolbar.svelte` |
| `workspace/ChartCanvas.svelte` |
| `workspace/ChartMetricStrip.svelte` |
| `workspace/ChartBoardHeader.svelte` |
| `workspace/CollectedMetricsDock.svelte` |
| `workspace/DraftFromRangePanel.svelte` |
| `workspace/F60GateBar.svelte` (shared/ 중복) |
| `workspace/IndicatorPaneStack.svelte` |
| `workspace/MultiPaneChart.svelte` |
| `workspace/PatternSeedScoutPanel.svelte` |
| `workspace/TerminalBottomDock.svelte` |
| `workspace/TerminalHeaderMeta.svelte` |
| `workspace/TerminalRightRail.svelte` (RightRailPanel으로 대체됨) |
| `workspace/WorkspaceGrid.svelte` |
| `workspace/KpiCard.svelte` |
| `workspace/KpiStrip.svelte` |
| `workspace/IndicatorLibrary.svelte` |
| `workspace/MiniIndicatorChart.svelte` |
| `workspace/TerminalContextPanelSummary.svelte` |

### 🟡 Mobile 고아
| 파일 |
|---|
| `mobile/MobileCommandDock.svelte` |
| `mobile/TerminalShell.svelte` (shell/TerminalShell.svelte와 중복?) |

### 🟡 Chart Overlay 고아
| 파일 |
|---|
| `chart/overlay/PhaseBadge.svelte` |
| `chart/overlay/RangeModeToast.svelte` |

### 🟡 Research 고아
| 파일 |
|---|
| `terminal/research/ResearchBlockRenderer.svelte` |

### 🟡 Modal 고아 (store 직접 제어 — import 없음)
| 파일 | 비고 |
|---|---|
| `modals/PassportModal.svelte` | store 시그널로만 제어? |
| `modals/SettingsModal.svelte` | store 시그널로만 제어? |

### 🟡 Cogochi 고아
| 파일 |
|---|
| `components/cogochi/DataCard.svelte` |
| `components/cogochi/QuickPanel.svelte` |
| `lib/cogochi/ChartSvg.svelte` |
| `lib/cogochi/CopyTradingLeaderboard.svelte` |
| `lib/cogochi/MobileFooter.svelte` |

### 🟡 기타
| 파일 |
|---|
| `shared/F60GateBar.svelte` (workspace/에 중복) |
| `home/MobileHomeHero.svelte` |
| `layout/BottomBar.svelte` |
| `settings/KillSwitchToggle.svelte` |
| `states/DisconnectedState.svelte` |
| `states/LoadingState.svelte` |
| `states/StaleState.svelte` |
| `dashboard/AdapterDiffPanel.svelte` |
| `wallet-intel/WalletIntelShell.svelte` |
| `lab/AdapterFingerprint.svelte` |
| `lab/CycleSelector.svelte` |
| `lib/components/search/SearchResultList.svelte` |

---

## PARTIAL Components (임포트됐으나 조건부 렌더링)

| 파일 | 조건 |
|---|---|
| `workspace/PatternLibraryPanel.svelte` | `showPatternLibrary` store |
| `workspace/MarketDrawer.svelte` | `showLeftRail` store (tablet/mobile) |
| `workspace/SaveSetupModal.svelte` | capture save modal |
| `chart/CaptureReviewDrawer.svelte` | `selectedCapture !== null` |
| `lib/components/terminal/hud/DecisionHUD.svelte` | `lastSavedCaptureId` exists |
| `workspace/WorkspacePanel.svelte` | `applyModePreset(terminalMode).showWorkspace` |
| `peek/RightRailPanel.svelte` | `applyModePreset(terminalMode).showRightRail` |

---

## 주요 발견 사항

1. **IntelPanel.svelte** — 완전 미연결. compositeScore(W-0353) + sector_score(W-0350) 데이터가 준비됐으나 마운트 없음. **RightRailPanel 하단 또는 TerminalContextPanel 새 탭**이 적합한 위치.
2. **TerminalRightRail.svelte** — RightRailPanel로 대체된 것으로 보임. 미사용.
3. **workspace/ 고아 ~17개** — 리팩토링 중 제거 안 된 잔재.
4. **F60GateBar 중복** — `shared/`와 `workspace/` 두 곳. workspace 버전 미사용.
5. **Modal orphans** — PassportModal, SettingsModal은 store 방식으로 제어하는 경우 import 없이 직접 마운트될 수 있음 — 별도 확인 필요.
