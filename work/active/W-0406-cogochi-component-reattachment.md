# W-0406 — Cogochi/Terminal UIUX 진단 (세션 기록)

> **Status**: design / session log
> **Created**: 2026-05-04
> **세션에서 한 일만 기록** — 다른 세션·다른 에이전트 산출물 제외.

---

## 이 세션에서 한 일

### 1. PR #1148 머지 (`/설계` multi-role 시스템)
`/설계` 슬래시 커맨드를 single-blob에서 multi-role auto-dispatch로 분해:
- `.claude/commands/설계.md` (router)
- `.claude/commands/설계-{uiux,gtm,아키}.md` (entry points 3개)
- `.claude/commands/_design-{shared,router,uiux,gtm,아키}.md` (rules 5개)

9 files, +637/-179. CI 1개 fail("Verify PR links Issue", 의도된 design meta) → admin merge.
커밋: `b9142517`.

### 2. `/설계 uiux` 호출로 cogochi 진단
brief: "터미널/cogochi UIUX 전체 개편, 헤더/왼쪽/중간/오른쪽/푸터 기준 재배치".

**진단 결과 — "디자인 별로"의 진짜 원인은 시각 위계가 아니라 구조 문제**:

#### A. 정보 중복 source (한 데이터 → 5곳 표시)
| 데이터 | 표시 위치 5곳 |
|---|---|
| Symbol | TopBar / WatchlistRail / ChartBoard header / SymbolPicker / mobile strip |
| Timeframe | TopBar TF strip / ChartToolbar / ChartBoardHeader / MobileChart / shellStore |
| Verdict | DecideRightPanel / VerdictInbox / VerdictBanner / StatusBar mini / DecisionHUD |

#### B. Mode 5축 동시작동 (서로 직교하지 않음 → 사용자 클릭 결과 예측 불가)
- `workMode`: TRADE / TRAIN / FLY / analyze / decide
- `rightPanelTab`: DEC / PAT / VER / RES / JDG
- `mobileMode`: chart / ver / res / judge
- `workspaceMode`: single / split-2 / quad
- `chartType`: candle / HA / bar / line / area

#### C. UI 진영 분기 (같은 기능, 다른 컴포넌트 두 벌)
| 기능 | 진영 1 | 진영 2 |
|---|---|---|
| Drawing 도구 8개 | `panels/DrawingRail.svelte` (좌 36px) | `workspace/DrawingToolbar.svelte` (Chart 내부 32px) |
| Chart 컨트롤 | TopBar (TF/Type) | ChartBoardHeader (Studies/Scale/Type) |
| Multi-pane | WorkspaceStage (single/split-2/quad) | ChartGridLayout (6 프리셋) |
| AI 진입점 | AIAgentPanel / DecideRightPanel / ChatThread / AskInput (4개) |

### 3. 컴포넌트 인벤토리
- `app/src/lib/hubs/terminal/` 90개 svelte 파일
- `/cogochi` 페이지 entry에서 transitively reach: 58개
- Orphan (0 import): 30개

**Zero-import dead code 후보 (~6.5K LoC)**:
IntelPanel(2839) / AIPanel(803) / WarRoom(739) / CgChart(615) / MultiPaneChart(562) / BottomPanel(400) / RangeActionToast(300) / ChatThread(204) / PatternLibraryPanelAdapter(89)

**핵심 컴포넌트 (≥3 imports, 변경 시 광범위 영향)**:
ChartBoard(2775) / TopBar(601) / SymbolPicker(545) / DecisionHUD(544) / PaneInfoBar(168) / VerdictCard(124) / EvidenceCard(94) / VerdictHeader(60) / SourcePill(57) / FreshnessBadge(52) / EvidenceGrid(21) / SourceRow(20)

---

## 미완료 / 새 세션 시작점

- 진단만 했고 **PR 분해·구현 미시작**
- Step C (Issue 생성 + work item commit) 미실행 → 이 문서가 그 대체
- 사용자 결정 대기 항목:
  - 30개 orphan 처리 방향 (재배치 / 삭제 / 보존)
  - Mode 5축 → 몇 축으로 단순화할지
  - 4개 진영 분기 중 어느 쪽을 source-of-truth로

---

## 별도 우려사항

- `app/src/hooks.server.ts` 변경분이 stash에 남아있음 — 본 작업과 무관, pop 금지 (사용자 지시)
