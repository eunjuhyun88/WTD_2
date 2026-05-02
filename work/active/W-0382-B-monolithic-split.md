# W-0382-B — Phase B: Monolithic Split (거대 컴포넌트 분할)

> Parent: W-0382 | Priority: P1
> Status: 🔴 Blocked (W-0382-A merged 필요)
> Pre-conditions: W-0382-A merged + Playwright baseline 캡처
> Estimated files: ~60 신규 | Estimated time: 8~12시간

---

## 이 Phase가 하는 일

"단일 책임 + Props ≤8 + 독립 테스트 가능" 기준으로 거대 컴포넌트를 분할한다.
각 분할 후 behavior parity 확인 (visual diff).

**분할 대상:**

| 파일 (after Phase A 경로) | 현재 LOC | 분할 기준 위반 |
|---|---|---|
| `hubs/terminal/workspace/ChartBoard.svelte` | 2588 | 책임 5개 (렌더/데이터/UI/events/scan) |
| `hubs/terminal/workspace/TradeMode.svelte` | 3233 | 책임 6개 (레이아웃/차트/주문/scan/judge/keyboard) |
| `hubs/terminal/workspace/ResearchPanel.svelte` | 1051 | 책임 3개 (데이터 조회/차트/표) |
| `hubs/terminal/workspace/TerminalContextPanel.svelte` | 944 | 책임 3개 |
| `hubs/terminal/workspace/TrainMode.svelte` | 1344 | 책임 4개 |
| `hubs/terminal/workspace/AnalyzePanel.svelte` | 1014 | 책임 4개 |
| `hubs/terminal/workspace/SaveStrip.svelte` | 688 | 책임 2개 — 경계선 |
| `hubs/terminal/workspace/PatternSeedScoutPanel.svelte` | 682 | 책임 2개 — 경계선 |
| `hubs/terminal/panels/AIAgentPanel/AIPanel.svelte` | 803 | 책임 3개 |
| `hubs/terminal/panels/WatchlistRail/WatchlistRail.svelte` | 701 | 책임 3개 |
| `routes/lab/+page.svelte` | 810 | route가 비즈니스 로직 보유 |
| `routes/patterns/+page.svelte` | 647 | route가 비즈니스 로직 보유 |
| `routes/settings/+page.svelte` | 706 | route가 비즈니스 로직 보유 |

---

## Pre-conditions Checklist

- [ ] W-0382-A merged
- [ ] Playwright baseline 캡처 완료 (아래 명령어 실행):
```bash
# baseline 스크린샷 저장 (dev server 실행 중 필요)
mkdir -p /tmp/baseline-W-0382-B
# 각 페이지 스크린샷 (Playwright 없으면 수동)
# /cogochi, /dashboard, /patterns, /lab, /settings
```
- [ ] `git checkout -b feat/W-0382-B-monolithic-split` (W-0382-A HEAD 기준)
- [ ] `pnpm svelte-check` 0 errors 확인

---

## 분할 방법론

```
1. 원본 파일 그대로 유지
2. 신규 파일 생성 (해당 책임 로직 이동)
3. 원본에서 해당 블록 제거, 신규 컴포넌트 import + 사용
4. svelte-check 0 errors 확인
5. visual 확인 후 원본 삭제 (필요 시)
```

---

## 컴포넌트별 분할 명세

### 1. ChartBoard.svelte (2588 LOC)

**현재 책임 (실측):**
- 차트 캔버스 렌더링
- 멀티-pane 레이아웃
- 차트 데이터 fetch/SSE
- 스캔 상태 관리
- HUD/DecisionHUD

**분할 후:**

| 신규 파일 | 책임 (한 문장) | Props 인터페이스 | 목표 LOC |
|---|---|---|---|
| `ChartBoard.svelte` | 레이아웃 조율, 하위 컴포넌트 마운트 | `{ symbol: string; timeframe: string; mode: ChartMode }` | ~300 |
| `ChartDataLayer.svelte` | engine SSE 연결, 데이터 fetch, store 업데이트 | `{ symbol: string; timeframe: string; onData: (p: ChartPayload) => void }` | ~400 |
| `ChartRenderLayer.svelte` | 순수 캔버스 렌더링 (데이터 받아서 그리기만) | `{ payload: ChartPayload; config: ChartRenderConfig }` | ~500 |
| `ChartPaneStack.svelte` | 멀티-pane 분할 레이아웃 | `{ panes: PaneConfig[]; focusedPane: number }` | ~200 |
| `ChartHUDLayer.svelte` | HUD 오버레이 (DecisionHUD, KpiStrip 등) | `{ hudData: HUDData; onVerdict: VerdictFn }` | ~300 |

**분할 절차:**
```bash
# 1. 신규 파일 생성
touch app/src/lib/hubs/terminal/workspace/ChartDataLayer.svelte
touch app/src/lib/hubs/terminal/workspace/ChartRenderLayer.svelte
touch app/src/lib/hubs/terminal/workspace/ChartPaneStack.svelte
touch app/src/lib/hubs/terminal/workspace/ChartHUDLayer.svelte

# 2. ChartBoard에서 데이터 로직 추출 → ChartDataLayer
# 3. 렌더 로직 추출 → ChartRenderLayer
# 4. pane 레이아웃 추출 → ChartPaneStack
# 5. HUD 추출 → ChartHUDLayer
# 6. ChartBoard는 조율만 (~300 LOC)
```

---

### 2. TradeMode.svelte (3233 LOC)

**현재 책임 (실측 grep 기반):**
- 레이아웃 구성 (3-rail desktop, mobile 분기)
- 차트 데이터 연결 + SSE
- Judge 패널 (판정 UI)
- Scan 기능 (scan state, candidates)
- Keyboard shortcuts
- Workspace 탭 제어

**분할 후:**

| 신규 파일 | 책임 | Props 인터페이스 | 목표 LOC |
|---|---|---|---|
| `TradeMode.svelte` | 레이아웃 조율, 상태 라우팅 | `{ symbol: string; timeframe: string; mobileView?: string }` | ~300 |
| `TradeModeData.svelte` | 차트 데이터 fetch + SSE 연결 | `{ symbol: string; timeframe: string; onReady: (data: TradeData) => void }` | ~400 |
| `TradeModeJudge.svelte` | Judge 패널 (판정 submit/결과) | `{ captureId: string; onJudge: JudgeFn }` | ~300 |
| `TradeModeScanner.svelte` | Scan 기능 (상태, candidates, progress) | `{ symbol: string; onSelect: (c: ScanCandidate) => void }` | ~350 |
| `TradeModeKeyboard.ts` | 키보드 단축키 정의 + 핸들러 | (export: `bindTradeKeys(handlers)`) | ~100 |
| `TradeModeWorkspace.svelte` | 워크스페이스 탭 제어 (verdict/research/judge) | `{ activeTab: WorkspaceTab; onTabChange: TabFn }` | ~200 |

---

### 3. ResearchPanel.svelte (1051 LOC)

| 신규 파일 | 책임 | 목표 LOC |
|---|---|---|
| `ResearchPanel.svelte` | 패널 레이아웃 + 탭 | ~200 |
| `ResearchDataFetcher.svelte` | API 호출 + 로딩 상태 | ~250 |
| `ResearchResultsGrid.svelte` | 결과 테이블/카드 렌더 | ~350 |
| `ResearchDetailView.svelte` | 상세 보기 (클릭 시) | ~250 |

---

### 4. TerminalContextPanel.svelte (944 LOC)

| 신규 파일 | 책임 | 목표 LOC |
|---|---|---|
| `TerminalContextPanel.svelte` | 패널 shell + 탭 제어 | ~150 |
| `ContextSummaryTab.svelte` | 요약 섹션 | ~250 |
| `ContextEvidenceTab.svelte` | Evidence cards | ~300 |
| `ContextWhyTab.svelte` | Why 설명 | ~250 |

---

### 5. TrainMode.svelte (1344 LOC)

| 신규 파일 | 책임 | 목표 LOC |
|---|---|---|
| `TrainMode.svelte` | 레이아웃 + 시나리오 라우팅 | ~200 |
| `TrainScenarioPicker.svelte` | 시나리오 선택 UI | ~300 |
| `TrainPlayback.svelte` | 재생/일시정지/시간 제어 | ~300 |
| `TrainEvalPanel.svelte` | 평가 결과 + 점수 | ~300 |
| `TrainStore.svelte.ts` | 훈련 세션 상태 | ~150 |

---

### 6. AnalyzePanel.svelte (1014 LOC)

| 신규 파일 | 책임 | 목표 LOC |
|---|---|---|
| `AnalyzePanel.svelte` | shell + 필터 제어 | ~200 |
| `AnalyzeFilters.svelte` | 필터 UI (날짜/패턴/지표 선택) | ~300 |
| `AnalyzeResultsGrid.svelte` | 결과 그리드 렌더 | ~350 |
| `AnalyzeDetailDrawer.svelte` | 상세 drawer | ~200 |

---

### 7. AIPanel.svelte (803) + AIAgentPanel.svelte (628) — Q-2 답변 반영

**결정: AIPanel 흡수 → AIChatTab으로 통합** (2026-05-02 확정)

현재 AIAgentPanel이 AIPanel을 import해서 사용하는 부모-자식 구조.
AIPanel 파일 삭제 → 로직을 AIChatTab.svelte 로 흡수.

| 신규 파일 | 책임 | 목표 LOC |
|---|---|---|
| `AIAgentPanel.svelte` (shell 유지) | 5-tab 구조 조율, 탭 전환만 | ~200 |
| `AIChatTab.svelte` | 구 AIPanel 로직 흡수 (AI 입력/카드/intent 분류) | ~350 |
| `AIPatternTab.svelte` | Pattern 탭 내용 | ~200 |
| `VerdictInboxPanel.svelte` | Verdict 탭 (이미 독립 파일, 이동만) | 유지 |
| `ResearchPanel` | Research 탭 (분할은 위 §3에서 처리) | 유지 |
| `JudgePanel.svelte` | Judge 탭 (이미 독립 파일, 이동만) | 유지 |

삭제: `AIPanel.svelte` (AIAgentPanel에 흡수 완료 후)

---

### 8. WatchlistRail.svelte (701 LOC)

| 신규 파일 | 책임 | 목표 LOC |
|---|---|---|
| `WatchlistRail.svelte` | 전체 rail shell, 스크롤 | ~150 |
| `WatchlistRow.svelte` | 한 행 렌더 (심볼/가격/변화율) | `{ item: WatchItem; onTap: () => void }` | ~120 |
| `WhaleAlertStrip.svelte` | 상단 고래 알림 배너 | `{ alerts: WhaleAlert[] }` | ~130 |
| `WatchlistFilters.svelte` | 필터/정렬 컨트롤 | `{ value: FilterState; onChange: (f: FilterState) => void }` | ~100 |

---

### 9. routes/lab/+page.svelte (810 LOC) → `lib/hubs/lab/` 로 비즈니스 로직 이주

```bash
# 현재 +page.svelte에 있는 로직 → hub 컴포넌트로 이동
# +page.svelte 목표: ≤80 LOC (LabHub 마운트 + load 함수만)
```

| 신규 파일 | 이주 내용 | 목표 LOC |
|---|---|---|
| `lib/hubs/lab/LabHub.svelte` | 탭 제어, 레이아웃 | ~150 |
| `lib/hubs/lab/panels/LabRunPicker.svelte` | 실행 선택 UI | ~250 |
| `lib/hubs/lab/panels/LabResultsPanel.svelte` | 결과 표시 | ~300 |
| `lib/hubs/lab/panels/LabComparePanel.svelte` | 비교 뷰 | ~200 |

---

### 10. routes/patterns/+page.svelte (647 LOC) → `lib/hubs/patterns/`

| 신규 파일 | 목표 LOC |
|---|---|
| `lib/hubs/patterns/PatternsHub.svelte` | ~150 |
| `lib/hubs/patterns/L1/PatternsSearchBar.svelte` | ~120 |
| `lib/hubs/patterns/panels/PatternsLibraryGrid.svelte` | ~250 |
| `lib/hubs/patterns/sheets/PatternsDetailDrawer.svelte` | ~200 |

---

### 11. routes/settings/+page.svelte (706 LOC) → `lib/hubs/settings/sections/`

```bash
# 각 섹션을 독립 파일로 분리
touch app/src/lib/hubs/settings/sections/ProfileSection.svelte      # ~150
touch app/src/lib/hubs/settings/sections/SubscriptionSection.svelte # ~120
touch app/src/lib/hubs/settings/sections/NotificationsSection.svelte # ~120
touch app/src/lib/hubs/settings/sections/AISection.svelte           # ~150
touch app/src/lib/hubs/settings/sections/ConnectorsSection.svelte   # ~100
touch app/src/lib/hubs/settings/sections/SecuritySection.svelte     # ~80
```

`lib/hubs/settings/SettingsHub.svelte` 에서 섹션들 조립. `routes/settings/+page.svelte` 는 ≤80 LOC.

---

## Verification Commands

```bash
# 1. svelte-check 0 errors
cd app && pnpm svelte-check 2>&1 | grep "^Error" | wc -l
# 결과: 0

# 2. 모든 분할 대상이 단일 책임 기준 통과 (수동 확인)
wc -l app/src/lib/hubs/terminal/workspace/ChartBoard.svelte    # ≤400
wc -l app/src/lib/hubs/terminal/workspace/TradeMode.svelte     # ≤400
wc -l app/src/lib/hubs/terminal/workspace/ResearchPanel.svelte # ≤400
wc -l app/src/routes/lab/+page.svelte                          # ≤100
wc -l app/src/routes/patterns/+page.svelte                     # ≤100
wc -l app/src/routes/settings/+page.svelte                     # ≤100

# 3. 빌드 성공
cd app && pnpm build 2>&1 | tail -5

# 4. Visual diff (baseline 대비 회귀 없음)
# Playwright: 각 허브 로드 + 주요 인터랙션 확인
```

---

## Commit & PR

```bash
git add app/src/lib/hubs/ app/src/routes/

git commit -m "refactor(W-0382-B): monolithic split — ChartBoard/TradeMode/ResearchPanel + 3 routes

- ChartBoard 2588 → 5 components
- TradeMode 3233 → 6 components
- ResearchPanel 1051 → 4 components
- TerminalContextPanel 944 → 4 components
- TrainMode 1344 → 5 components
- AnalyzePanel 1014 → 4 components
- WatchlistRail 701 → 4 components
- AIPanel+AIAgentPanel → unified 6 components
- routes/{lab,patterns,settings} ≤100 LOC each"

gh pr create \
  --title "[W-0382-B] Phase B: Monolithic split" \
  --body "$(cat <<'EOF'
## Summary
Split 13 monolithic components to single-responsibility files.
No behavior changes — all splits are logic extraction with prop-passing.

## Behavior parity
- [ ] Playwright baseline comparison
- [ ] svelte-check 0 errors
- [ ] pnpm build success

Closes part of #ISSUE_NUM
EOF
)"
```

---

## Exit Criteria

- [ ] AC-B1: `wc -l hubs/terminal/workspace/ChartBoard.svelte` ≤ 400
- [ ] AC-B2: `wc -l hubs/terminal/workspace/TradeMode.svelte` ≤ 400
- [ ] AC-B3: `wc -l routes/lab/+page.svelte` ≤ 100
- [ ] AC-B4: `wc -l routes/patterns/+page.svelte` ≤ 100
- [ ] AC-B5: `wc -l routes/settings/+page.svelte` ≤ 100
- [ ] AC-B6: `pnpm svelte-check` 0 errors
- [ ] AC-B7: visual diff PASS (주요 5 허브 화면)
- [ ] PR merged
