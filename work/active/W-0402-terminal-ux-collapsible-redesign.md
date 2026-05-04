# W-0402 — Terminal/Cogochi UX 재설계 (Collapsible Panels + AI Agent 통합)

> Wave: 7 | Priority: P0 | Effort: L
> Charter: In-Scope (Frozen 전면 해제 — 2026-05-01)
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Issue: #1058
> Owner: Sonnet (구현)

## Goal

사용자가 차트와 AI 판단을 한 화면에서 동시에 보면서, 좌/우 패널을 자유롭게 접어 차트 영역을 최대화할 수 있다. 푸터에 분산된 정보(뉴스/고래/판정/액션)는 우측 AI Agent 패널 한 곳으로 통합된다. cogochi/terminal 두 surface가 home과 동일한 디자인 토큰으로 일관된다.

## Scope

**포함**
- Terminal Hub 레이아웃 전면 재구조 (3-column collapsible)
- 푸터 (`TerminalBottomDock`) 제거 + 정보 우측 AI Agent 패널로 흡수
- cogochi 페이지 home 디자인 토큰 (rose/peach palette, surface card pattern) 적용
- 좌/우 collapse 상태 localStorage persist (`terminal:layout:v1`)
- 모바일 단일 컬럼 + bottom sheet AI Agent

**파일 (실측 줄 수)**
- `app/src/lib/hubs/terminal/TerminalHub.svelte` (736L) — 신규 Shell로 이전
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` (2720L) — **이번 Wave 분해 X** (PR4+)
- `app/src/lib/hubs/terminal/workspace/TerminalBottomDock.svelte` — **삭제**
- `app/src/lib/hubs/terminal/workspace/JudgePanel.svelte` (203L) — Agent panel Verdict 탭으로 wrap
- `app/src/lib/hubs/terminal/workspace/ScanPanel.svelte` (150L) — Agent panel Scan 탭으로 이동
- `app/src/lib/hubs/terminal/workspace/AnalyzePanel.svelte` (866L) — Agent panel Why 탭으로 흡수
- `app/src/routes/cogochi/+page.svelte` — Shell 마운트 + home 토큰
- 신규: `TerminalShell.svelte`, `TerminalLeftDrawer.svelte`, `TerminalAgentPanel.svelte`, `terminalLayoutStore.svelte.ts`

## Non-Goals

- ChartBoard.svelte 2720L 분해 → PR4+ (회귀 위험 격리)
- 새 데이터 소스 추가 → 기존 정보의 재배치만
- 차트 라이브러리 교체 → lightweight-charts 유지
- 실시간 chat agent 백엔드 변경 → 기존 ResearchPanel 재사용
- Trade/Train mode 독립 surface → 본 Wave는 cogochi 단일 진입

---

## 정보 인벤토리 (전수 — 60+ 컴포넌트 카테고리화)

### A. 차트 코어 (항상 중앙, collapse 불가)

| 컴포넌트 | 데이터/역할 |
|---|---|
| ChartBoard (2720L) | 메인 컨테이너 (분해 보류) |
| ChartCanvas | OHLCV 캔들/라인/area 렌더 |
| ChartPane | 단일 페인 (메인+서브) |
| MultiPaneChart / MultiPaneChartAdapter | 다중 페인 (price + indicator) |
| ChartGridLayout | 멀티 차트 그리드 |
| IndicatorPaneStack | 인디케이터 페인 스택 (RSI/MACD 등) |
| MiniIndicatorChart | 인디케이터 미니 프리뷰 |
| DrawingCanvas | 트렌드라인/피보 드로잉 오버레이 |
| Sparkline | 마이크로 차트 (카드 내부) |
| ChartMetricStrip | 차트 하단 OHLCV/vol/Δ% 스트립 (32px 고정) |
| ChartToolbar | TF/심볼/타입 인라인 툴바 |
| ChartBoardHeader | 차트 보드 상단 메타 |
| BoardToolbar | 보드 레벨 액션 (snapshot/share) |
| DrawingToolbar | 드로잉 도구 팔레트 |

### B. 컨텍스트 / 메타 (TopBar + LeftDrawer 상단)

| 컴포넌트 | 데이터/역할 |
|---|---|
| TerminalHeaderMeta | 심볼명, 거래소, lastPrice, %chg |
| TerminalContextPanel | 현재 셀렉션의 컨텍스트 메타 |
| TerminalContextPanelSummary | 컨텍스트 요약 |
| SymbolPicker | 심볼 검색/선택 |
| FreshnessBadge | 데이터 신선도 |
| SourcePill | 데이터 출처 chip |
| SourceRow | 출처 + 타임스탬프 행 |
| PaneInfoBar | 페인별 메타바 |

### C. 평가 / 판정 (AgentPanel → Verdict 탭)

| 컴포넌트 | 데이터/역할 |
|---|---|
| JudgePanel (203L) | LONG/SHORT/HOLD verdict + confidence |
| VerdictCard | 단건 verdict 카드 |
| VerdictHeader | verdict 헤더 (timestamp + tag) |
| DecisionHUD / DecisionHUDAdapter | 최종 결정 HUD overlay |
| F60GateBar | F60 gate score 진행바 |
| KpiCard / KpiStrip | 핵심 지표 (Sharpe/win-rate 등) |

### D. 스캔 / 패턴 (AgentPanel → Scan 탭)

| 컴포넌트 | 데이터/역할 |
|---|---|
| ScanPanel (150L) | 스캔 매칭 결과 리스트 |
| PatternLibraryPanel | 패턴 라이브러리 (head&shoulders 등) |
| PatternSeedScoutPanel | 시드 패턴 스카우터 |
| RadialTopology | 자산/패턴 관계 토폴로지 (탭 내 expand) |
| StructureExplainViz | 구조 해설 시각화 (탭 내 expand) |

### E. 뉴스 / 외부 (AgentPanel → News 탭) ← 푸터에서 이동

| 컴포넌트 | 데이터/역할 |
|---|---|
| NewsFlashBar | 실시간 뉴스 플래시 (현재 푸터) |
| WhaleWatchCard | 고래 거래 알림 (현재 푸터) |
| MarketDrawer | 시장 전체 드로어 |
| AssetInsightCard | 자산 인사이트 카드 |

### F. 분석 / 연구 (AgentPanel → Why 탭 + Chat 탭)

| 컴포넌트 | 데이터/역할 |
|---|---|
| AnalyzePanel (866L) | 종합 분석 패널 (Why 탭으로) |
| ResearchPanel | LLM 연구 채팅 → Chat 탭 wrap |
| WhyPanel | verdict 근거 설명 |
| EvidenceCard | 단건 증거 카드 |
| EvidenceGrid | 증거 그리드 |
| WorkspaceCompareBlock | 비교 블록 |
| CompareWithBaselineToggle | 베이스라인 비교 토글 |
| DraftFromRangePanel | 범위에서 초안 작성 |
| RangeActionToast | 범위 선택 액션 토스트 |

### G. 액션 / 컨트롤 (LeftDrawer + TopBar inline)

| 컴포넌트 | 배치 |
|---|---|
| TerminalCommandBar | TopBar 슬래시 커맨드 |
| ActionStrip | TopBar 우측 액션 |
| SaveStrip / SaveSetupModal | TopBar [저장] 버튼 |
| IndicatorLibrary | LeftDrawer 섹션 (즐겨찾기 6개 + "전체" → modal) |
| WorkspacePresetPicker | TopBar mode dropdown |
| WorkspaceStage / WorkspaceGrid / WorkspacePanel | Shell 내부 컨테이너 |
| SingleAssetBoard | Shell 내부 |
| TradeMode / TrainMode | TopBar mode dropdown |
| PineScriptGenerator | modal (LeftDrawer 액션) |
| CollectedMetricsDock | AgentPanel Verdict 탭 하단 |

### H. 상태 / 시스템 (AgentPanel 상단 status row)

| 컴포넌트 | 처리 |
|---|---|
| TerminalBottomDock | **삭제** — 정보 E/C 카테고리로 분배 |
| TerminalLeftRail | **대체** → TerminalLeftDrawer |
| TerminalRightRail | **대체** → TerminalAgentPanel |

---

## 와이어프레임

### 데스크톱 (≥1280px) — Default State

```
╔══════╦════════════════════════════════════════════════════════╦══════════════════════╗
║ Nav  ║ TOP BAR                                      48px     ║  AGENT PANEL  360px  ║
║ Rail ║ [≡] [AAPL ▼] [$182.34 +1.2%] [1m 5m 1h 4h ▼] [Mode▼]║  [Verdict|Scan|News| ║
║      ║ [⌘K Command...]                    [📌 저장 ...]       ║   Why  |Chat  ]      ║
║  52  ╠═══════╦════════════════════════════════════════════════║                      ║
║      ║ LEFT  ║                                                ║  ┌──────────────────┐║
║ [🏠] ║ DRAW  ║                                                ║  │ ◉ LONG  0.87     │║
║ [⎈]  ║  ER   ║         C H A R T   C A N V A S               ║  │ F60 ████████░ 78 │║
║ [◇]  ║       ║         flex-grow / ResizeObserver             ║  │ KPI: SR 1.42     │║
║ [◎]  ║  240  ║                                                ║  └──────────────────┘║
║ [⊕]  ║  px   ║  [캔들 + 인디케이터 오버레이]                  ║  ┌──────────────────┐║
║ [⚙]  ║       ║  [드로잉 레이어]                               ║  │ Why:             │║
║      ║ ┌───┐ ║  [패턴 하이라이트]                             ║  │ • RSI 과매도 지역 │║
║      ║ │SYM│ ║                                                ║  │ • 지지선 반등     │║
║      ║ │PIK│ ║                                                ║  └──────────────────┘║
║      ║ │ER │ ║                                                ║  ┌──────────────────┐║
║      ║ ├───┤ ║                                                ║  │ 📰 CPI beat...   │║
║      ║ │IND│ ║                                                ║  │ 🐋 1.2k BTC →   │║
║      ║ │FAV│ ║                                                ║  └──────────────────┘║
║      ║ │★×6│ ║                                                ║  ┌──────────────────┐║
║      ║ │[+]│ ║                                                ║  │ > 분석 질문...   │║
║      ║ ├───┤ ║                                                ║  └──────────────────┘║
║      ║ │PAT│ ║                                                ║                      ║
║      ║ │LIB│ ║                                                ║  [<<] collapse       ║
║      ║ ├───┤ ║════════════════════════════════════════════════║  (→ 480px expand)    ║
║      ║ │RCT│ ║ METRIC  O:181.2  H:184.5  L:180.1  32px       ║                      ║
║      ║ └───┘ ║ C:182.34  Vol:48.2M  Δ+1.2% (+$2.14)         ║                      ║
║      ║  [<<] ║                            FreshnessBadge: 3s ║                      ║
╚══════╩═══════╩════════════════════════════════════════════════╩══════════════════════╝
  52px   32-240px        flex (최소 480px)                         360-480px
```

### 양측 Collapse 상태 (차트 최대화)

```
╔══════╦══╦════════════════════════════════════════════════════╦══╗
║ Rail ║ L║ TOP BAR  [≡] [AAPL ▼] ...                         ║R ║
║      ║ I║══════════════════════════════════════════════════  ║ I║
║      ║ C║                                                    ║ C║
║      ║ O║      C H A R T   (100% 폭 — rail 제외)            ║ O║
║      ║ N║      인디케이터 full / 드로잉 full                  ║ N║
║      ║  ║                                                    ║  ║
║      ║  ║════════════════════════════════════════════════════║  ║
║      ║  ║ METRIC STRIP                                       ║  ║
╚══════╩══╩════════════════════════════════════════════════════╩══╝
  52     32              flex (calc 100vw - 52 - 64)              32
  키보드 [ = Left toggle  /  ] = Right toggle  /  Cmd+0 = 양측 리셋
```

### 모바일 (<768px)

```
┌─────────────────────────────┐
│ [≡] AAPL  $182.34  +1.2%   │  TopBar 48px
│                  [Mode ▼]   │
├─────────────────────────────┤
│                             │
│    ChartCanvas  ~50vh       │  터치 pan/pinch
│    인디케이터 오버레이       │
│                             │
├─────────────────────────────┤
│ O:181 H:184 L:180 V:48.2M  │  MetricStrip 32px
├─────────────────────────────┤
│ ◉ LONG  0.87  F60: 78      │  Verdict 요약 고정 카드
│ RSI과매도·지지선반등  [↑AI] │  ← 탭하면 bottom sheet
└─────────────────────────────┘

    ↓ [↑AI] 탭 시 슬라이드업

┌─────────────────────────────┐
│ ▬▬▬ (드래그 핸들)            │
│ Verdict │ Scan │ News │ Why │ Chat
├─────────────────────────────┤
│                             │
│  (90vh, touch-scroll)       │  Bottom Sheet
│  body scroll lock 적용       │
│                             │
└─────────────────────────────┘
```

---

## Home 디자인 패턴 매핑

| Home 토큰/패턴 | Terminal 적용 위치 |
|---|---|
| `--sc-radius` (HomeSurfaceCards) | AgentPanel 카드, LeftDrawer 섹션 |
| `--sc-shadow` (HomeSurfaceCards) | AgentPanel 카드 |
| HomeHero `letter-spacing` + font tokens | TopBar 심볼명 표시 |
| `rgba(219,154,159,*)` rose | Verdict LONG, AppNavRail active |
| `rgba(249,216,194,*)` peach | Verdict HOLD, FreshnessBadge fresh |
| WebGLAsciiBackground | AgentPanel empty state (optional) |
| HomeTicker 패턴 | NewsFlashBar 카드 형식 |
| HomeLearningLoop 카드 spacing | Why/Evidence 카드 그리드 |

토큰은 `app/src/app.css` 기존 정의 재사용 — 신규 변수 추가 없음.

---

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| ChartBoard 2720L 동작 회귀 | 중 | 높음 | PR1: Shell만 교체, ChartBoard 그대로 마운트. 분해는 PR4+ |
| TerminalBottomDock 삭제로 정보 누락 | 높음 | 높음 | PR2 description에 정보 1:1 매핑 표 필수. 삭제 전 검증 |
| Collapsible state localStorage 충돌 | 낮음 | 중 | 신규 키 `terminal:layout:v1`, invalid → default fallback |
| Svelte 5 rune + CSS collapse 시 re-mount | 중 | 중 | width transform만 (display:none 회피), re-mount X |
| lightweight-charts resize 미호출 | 높음 | 중 | ResizeObserver → `chart.resize()` 어댑터 (PR1 AC) |
| 60+ 컴포넌트 dead code 양산 | 중 | 낮음 | PR마다 `grep -r ComponentName app/src` 후 미사용 즉시 삭제 |
| 모바일 sheet + 차트 pan 충돌 | 낮음 | 중 | sheet open 시 차트 인터랙션 pointer-events:none |

### Dependencies
- Wave 6 완료 (W-0395, W-0399, W-0400, W-0401 모두 merged) ✅
- ChartCanvas ResizeObserver 어댑터 신규 필요
- localStorage 기존 키와 충돌 없음 (신규 네임스페이스)

### Rollback
- PR1: Shell → TerminalHub mount 1줄 revert
- PR2: `git revert` (파일 삭제 PR이므로 복원)
- PR3: telemetry emit만 → 비즈니스 영향 없음

---

## AI Researcher 관점

### Data Impact
- 정보 밀도: 항상 노출 N개 → 사용자 의도 기반 탭 1개 (주의 분산 감소)
- AgentPanel 탭 클릭률로 어느 정보가 실제 가치 있는지 정량화 (PR3)

### Statistical Validation
- D+1 panel re-engagement: collapsed/expanded ratio
- ChartFocus duration: cursor in-bounds 시간 (proxy for chart utility)
- Tab usage distribution: Verdict vs Scan vs News vs Why vs Chat

### Failure Modes
- AgentPanel 탭 데이터 fetch 실패 → 탭별 error state + retry button
- LeftDrawer 인디케이터 검색 0건 → "No indicators found" + clear
- 모바일 sheet scroll lock 해제 실패 → unmount 시 강제 해제

---

## Decisions

| ID | 결정 | 거절 옵션 | 이유 |
|---|---|---|---|
| D-7001 | 좌·우 패널 모두 collapsible | 좌만/우만 | 사용자 "양쪽 패널은 가려질 수 있게" 명시 |
| D-7002 | 푸터 완전 제거, AgentPanel 흡수 | 푸터 슬림화 | 사용자 "왜 자꾸 푸터에 넣는지 모르겠다" |
| D-7003 | 차트 영역 flex-grow | 고정 max-width | 양측 collapse 시 wide-display 최대 활용 |
| D-7004 | Home 디자인 토큰 재사용 | terminal 별도 design system | 사용자 "home 디자인패턴과 동일" |
| D-7005 | ChartBoard 분해 PR4+ 격리 | 본 Wave 포함 | 2720L 분해 중 회귀 위험 격리 |
| D-7006 | AgentPanel 5탭 (Verdict/Scan/News/Why/Chat) | 단일 스크롤 / 7탭+ | 인지 부하 vs 접근성 균형 |
| D-7007 | ResearchPanel → Chat 탭 wrap | 신규 chat 컴포넌트 | 백엔드 변경 0 |
| D-7008 | localStorage `terminal:layout:v1` 단일 키 | 키 분리 | migration 단순화 |
| D-7009 | LeftDrawer collapse → 32w icon-bar | 0w 완전 hidden | 재진입 클릭 1회, 진입점 유지 |
| D-7010 | ChartMetricStrip 차트 하단 32px 고정 | Verdict 탭으로 이동 | OHLCV는 차트 읽기 핵심, 항상 가시 |
| D-7011 | RadialTopology/StructureExplainViz Scan 탭 내 expand | 별도 modal | modal이 차트를 가림, 패널 폭 확장으로 해결 |
| D-7012 | TradeMode/TrainMode → TopBar mode dropdown | 별도 라우트 | 라우트 이동 시 차트 상태 초기화 위험 |
| D-7013 | 모바일 AgentPanel → bottom sheet | 별도 라우트 | 차트 컨텍스트 유지하며 정보 확인 |
| D-7014 | IndicatorLibrary → LeftDrawer 섹션 (즐겨찾기 6 + modal) | modal only | TradingView 패턴, Drawer 열어서 바로 추가 |

---

## PR 분해 계획

> 각 PR은 독립 배포 가능. shell → data → GTM → 확장 순서 고정.
> AC 수치 중 "(est.)"는 배포 전 추정값.

### PR 1 — Shell + Collapsible Layout (M, 6-8 파일)

**목적**: 새 3-column 레이아웃 + 좌우 collapse 토글 + ResizeObserver (mock 데이터 OK)
**검증 포인트**: 토글 동작 / 차트 flex resize / chart.resize() 자동 호출

신규
- `app/src/lib/hubs/terminal/TerminalShell.svelte`
- `app/src/lib/hubs/terminal/TerminalLeftDrawer.svelte`
- `app/src/lib/hubs/terminal/TerminalAgentPanel.svelte`
- `app/src/lib/hubs/terminal/terminalLayoutStore.svelte.ts`

수정
- `app/src/lib/hubs/terminal/TerminalHub.svelte` — Shell 마운트로 simplify
- `app/src/routes/cogochi/+page.svelte` — Shell + home 토큰
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte` — ResizeObserver hook 추가 (분해 X)

Exit Criteria
- [ ] AC1-1: 좌/우 토글 동작 + `terminal:layout:v1` localStorage persist
- [ ] AC1-2: 양측 collapse 시 ChartCanvas 100% 폭 + `chart.resize()` 자동 호출
- [ ] AC1-3: 모바일 ≤768px 단일 컬럼 + Verdict 요약 카드 + sheet trigger
- [ ] AC1-4: 키보드 `[`, `]`, `Cmd+0` 동작
- [ ] AC1-5: vitest 5케이스 (store toggle/persist/restore/invalid/default) PASS
- [ ] CI green

### PR 2 — Footer 제거 + AgentPanel 5탭 데이터 통합 (M, 8 파일)

**목적**: TerminalBottomDock 삭제, 모든 정보를 AgentPanel 5탭으로 wiring
**검증 포인트**: 정보 손실 0 / empty state / 탭 전환 시 차트 re-render 0

신규
- `app/src/lib/hubs/terminal/agent/VerdictTab.svelte`
- `app/src/lib/hubs/terminal/agent/ScanTab.svelte`
- `app/src/lib/hubs/terminal/agent/NewsTab.svelte`
- `app/src/lib/hubs/terminal/agent/WhyTab.svelte`
- `app/src/lib/hubs/terminal/agent/ChatTab.svelte` (ResearchPanel wrap)

삭제
- `TerminalBottomDock.svelte`
- `TerminalLeftRail.svelte` (TerminalLeftDrawer로 대체)
- `TerminalRightRail.svelte` (TerminalAgentPanel로 대체)

Exit Criteria
- [ ] AC2-1: 푸터 정보 전부 AgentPanel 표시 (PR description에 1:1 매핑 표)
- [ ] AC2-2: 탭별 loading / empty / error state
- [ ] AC2-3: 탭 전환 시 ChartCanvas re-render 0 (DOM detach 없음)
- [ ] AC2-4: vitest 8케이스 PASS
- [ ] CI green

### PR 3 — Telemetry / GTM (S, 3-4 파일)

**목적**: 토글·탭 사용·차트 focus duration 측정 → D+1 retention proxy 수집
**검증 포인트**: ⟵ 이 PR 1주 후 실측으로 D+1 target 확정

신규
- `app/src/lib/hubs/terminal/telemetry.ts` (Zod + track wrapper)
- `app/src/lib/hubs/terminal/__tests__/telemetry.test.ts`

이벤트
- `terminal_panel_toggle` `{ side: 'left'|'right', state: 'expanded'|'collapsed' }`
- `terminal_agent_tab_select` `{ tab: 'verdict'|'scan'|'news'|'why'|'chat' }`
- `terminal_chart_focus_duration` `{ ms: number }` (10초 미만 drop)
- `terminal_layout_restore` `{ left, right, activeTab }`

Exit Criteria
- [ ] AC3-1: vitest 5케이스 (schema valid/invalid/edge) PASS
- [ ] AC3-2: 0 PII (심볼/userId 미포함)
- [ ] AC3-3: dev console에서 이벤트 fire 확인
- [ ] CI green

### PR 4+ — Home 토큰 정밀 적용 + ChartBoard 분해 (L)

**조건**: PR3 telemetry 1주 데이터 후 착수 (탭 사용률 기반 우선순위)
**범위**: ChartBoard 2720L → 6-8 모듈 + Home 디자인 토큰 정밀 매핑
**Exit Criteria**: PR3 실측 후 W-0403으로 분리 spec 작성

---

## 전체 Exit Criteria

- [ ] PR1+PR2+PR3 모두 merged
- [ ] AgentPanel D+1 re-engagement ≥ 40% (PR3 실측 1주 후, 미달 시 retro)
- [ ] 모든 푸터 정보 AgentPanel에 1:1 매핑 (PR2 description 표)
- [ ] cogochi ↔ home 디자인 토큰 일치 (visual diff 첨부)
- [ ] CI green (App + Engine + Contract)
- [ ] CURRENT.md main SHA 업데이트
