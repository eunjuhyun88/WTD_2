# W-0405 — Cogochi/Terminal 컴포넌트 재배치 (Orphan Reattachment + 중복 정리)

> **Status**: design (handoff for new session)
> **Created**: 2026-05-04
> **Parent context**: W-0402/W-0403 Terminal/Cogochi UIUX 재설계의 후속 — "디자인 별로" 원불만의 진짜 원인 식별 후, 삭제·머지가 아닌 **재배치** 방향으로 전환됨.

---

## Goal

기존 컴포넌트 90개 중 페이지에 연결된 58개 / orphan 30개를 분석해서:
1. orphan 중 **재사용 가능한 것**을 적절한 페이지에 mount
2. **명백한 중복 진영** 정리 (Drawing/Chart controls/Multi-pane/Mode 5축/AI 진입점)
3. **삭제·머지 금지** — 데이터/기능 자체는 유지, source-of-truth만 단일화

## Non-Goals

- 기능 삭제 (사용자 명시: "왜 맘대로 지움")
- 시각 위계 토큰화 (W-0403에서 별도)
- Mobile 분기 재작성 (별도 work item)

---

## 진단 — 진짜 원인

"디자인 별로" = visual hierarchy 문제 **아님**. 실제 원인:

### A. 정보 중복 source (한 데이터 → 5곳 표시)
| 데이터 | 표시 위치 |
|---|---|
| Symbol | TopBar / WatchlistRail / ChartBoard header / SymbolPicker / mobile strip |
| Timeframe | TopBar TF strip / ChartToolbar / ChartBoardHeader / MobileChart / shellStore |
| Verdict | DecideRightPanel / VerdictInbox / VerdictBanner / StatusBar mini / DecisionHUD |

### B. Mode 5축 동시작동 (서로 직교하지 않음)
- `workMode`: TRADE / TRAIN / FLY / analyze / decide
- `rightPanelTab`: DEC / PAT / VER / RES / JDG
- `mobileMode`: chart / ver / res / judge
- `workspaceMode`: single / split-2 / quad
- `chartType`: candle / HA / bar / line / area

→ 사용자 한 번 클릭에 5축 중 어느 게 바뀌는지 예측 불가능.

### C. UI 진영 분기 (같은 기능, 다른 컴포넌트)
| 기능 | 진영 1 | 진영 2 |
|---|---|---|
| Drawing 도구 8개 | `panels/DrawingRail.svelte` (좌 36px) | `workspace/DrawingToolbar.svelte` (Chart 내부 32px) |
| Chart 컨트롤 | TopBar (TF/Type) | ChartBoardHeader (Studies/Scale/Type) |
| Multi-pane | WorkspaceStage (single/split-2/quad) | ChartGridLayout (6 프리셋) |
| AI 진입점 | AIAgentPanel | DecideRightPanel | ChatThread | AskInput |

---

## 30 Orphan 재배치 플랜

### Tier 1 — 즉시 마운트 (16개, safe)

**TerminalHub 추가 (5개)**:
- PatternLibraryPanelAdapter → AIAgentPanel `pattern` 탭 drawer
- ScrollAnalysisDrawer → AIAgentPanel `research` 탭 drawer
- VerdictBanner → StatusBar 좌측 mini-verdict 영역
- ModeToggle → TopBar 우측 mode strip
- ChatThread → AIAgentPanel `research-full` drawer

**모바일 (4개)**:
- MobileSymbolStrip / BottomTabBar / ModeRouter / MobilePromptFooter → MobileLayout

**다른 페이지 (7개)**:
- SearchResultList + SearchLayerBadge → `/patterns?tab=search`
- CopyTradingLeaderboard → `/patterns?tab=copy`
- ResearchBlockRenderer → LabHub
- PineGenerator → LabHub
- PatternClassBreakdown → `/patterns/[slug]`
- LiveSignalPanel → Dashboard

### Tier 2 — 결정 필요 (6개) ⚠️ 새 세션 시작점

| 컴포넌트 | LoC | 충돌 대상 | 결정 필요 |
|---|---|---|---|
| CgChart | 615 | ChartBoard (2775) | 폐기 / 특수 용도 분리 / 머지? |
| MultiPaneChart | 562 | ChartBoard (sub-pane) | 폐기 / Lab 전용? |
| SplitPaneLayout | ? | WorkspaceStage | 폐기 / 다른 용도? |
| BottomPanel | 400 | (구형 store) | 폐기 / 새 store로 마이그? |
| RangeActionToast | 300 | SaveRangeToast v2 | 폐기 / v2가 v1 흡수? |
| AIOverlayCanvas | ? | (없음, 미연결) | 어디에 mount? |

### 명백한 처리 (4개)
- AppSurfaceHeader → 중복, **삭제**
- MobileFooter → 중복, **삭제**
- ChartSvg → 보존 (특수 렌더)
- Icon → 자연 사용중

### Dead code 후보 (0 imports, ~6.5K LoC)
IntelPanel(2839) / AIPanel(803) / WarRoom(739) / CgChart(615) / MultiPaneChart(562) / BottomPanel(400) / RangeActionToast(300) / ChatThread(204) / PatternLibraryPanelAdapter(89)

→ Tier 1·2 결정 후 잔존분만 삭제 PR.

---

## 명백한 중복 정리 (별도 PR)

### PR-D1: Drawing 단일화
- DrawingRail (좌 36px) **유지** — 화면 전체 좌측 rail
- DrawingToolbar (Chart 내부 32px) **삭제** — DrawingRail이 chart 영역도 커버
- 같은 8 tools 두 곳 정의 → shellStore.drawingTool 단일 source

### PR-D2: Chart 컨트롤 단일화
- TopBar: Symbol / TF / mode (사용자 navigation)
- ChartBoardHeader: Studies / Scale / Type (chart 전용 옵션)
- 중복 TF/Type → ChartBoardHeader에서 제거, TopBar에만

### PR-D3: Multi-pane 단일화
- WorkspaceStage **유지** (Splitter 기반, 동적)
- ChartGridLayout (6 프리셋) **삭제** 또는 WorkspaceStage 옵션으로 흡수

---

## Mode 5축 단순화 (별도 작업)

현재 5축 → 목표 2축:
- **workMode** 단일화: { TRADE, TRAIN, FLY } 3개만 (analyze/decide → rightPanelTab으로 흡수)
- **rightPanelTab**: { DEC, PAT, VER, RES, JDG } 5개 유지 (AI 패널 내부 탭)
- mobileMode 폐기 → workMode + viewport 분기
- workspaceMode → WorkspaceStage 내부 상태로 격하
- chartType → ChartBoardHeader 내부 상태로 격하

---

## PR 분해 (새 세션에서 진행)

1. **PR1 (shell)**: Tier 2 6개 결정 후 → Tier 1 16개 마운트
2. **PR2 (cleanup)**: PR-D1 Drawing 단일화
3. **PR3 (cleanup)**: PR-D2 Chart 컨트롤 단일화
4. **PR4 (cleanup)**: PR-D3 Multi-pane 단일화
5. **PR5 (data/store)**: Mode 5축 → 2축 단순화
6. **PR6 (확장)**: dead code 잔존분 삭제

---

## Open Questions (새 세션 시작점)

1. **Tier 2 6개 컴포넌트 처리** — 위 표 참조, 각 행 결정 필요
2. CgChart vs ChartBoard — 같은 차트인데 왜 둘 다 있는지 git log로 origin 확인 필요
3. BottomPanel "구형 store" — 어떤 store? 마이그 비용?
4. AIOverlayCanvas mount 위치 — ChartBoard z:20 layer로 통합?

---

## Hard Constraints

- 기능 삭제 금지 (재배치만)
- source-of-truth 단일화는 데이터 path만 변경, UI 표시 위치는 유지 가능
- Tier 2 결정 전 Tier 1 마운트 시작 가능 (독립적)

---

## 진행 상태 (handoff)

- ✅ 90개 컴포넌트 인벤토리 완료
- ✅ 58 reached / 30 orphan 분류 완료
- ✅ 중복 진영 5종 식별 완료
- ✅ Mode 5축 진단 완료
- ⏸ Tier 2 6개 결정 — **새 세션 시작점**
- ⏸ Tier 1 16개 구현 미시작
- ⏸ PR-D1~D3 미시작

## 별도 우려사항

- `app/src/hooks.server.ts` 변경분이 stash에 남아있음 — 본 작업과 무관, pop 금지 (사용자 지시)
- PR #1148 (`/설계` multi-role system) 머지 완료 — 본 work item은 그 시스템으로 생성된 첫 산출물
