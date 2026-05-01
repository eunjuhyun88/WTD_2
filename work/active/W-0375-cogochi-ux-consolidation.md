# W-0375 — Cogochi UX Consolidation: Redundancy Purge + TradingView Density Pass

> Wave: 5 | Priority: P1 | Effort: L (30h)
> Charter: In-Scope — Frozen 전면 해제 (2026-05-01), TradingView parity 포함
> Status: 🟡 Design Draft
> Issue: #843
> Created: 2026-05-01
> Depends: W-0374 Phase D-0~D-3 ✅ merged (#839)
> See also: work/active/PRODUCT-DESIGN-PAGES-V2.md — 전체 페이지 설계

## Goal

사용자가 cogochi에 진입하면 차트 데이터가 80% 이상 viewport를 차지하고, 같은
컨트롤(symbol/TF/charttype)이 화면에서 딱 한 곳만 존재한다. TradeMode 4258줄
모놀리스 → AnalyzePanel/ScanPanel/JudgePanel 컴포넌트 분리.

## Owner

app

## Scope

파일:

- `app/src/lib/cogochi/AppShell.svelte` — 레이아웃 재구성 (CommandBar 제거, StatusBar 추가)
- `app/src/lib/cogochi/TopBar.svelte` — price + change% 흡수 (chart-header에서 이전)
- `app/src/lib/cogochi/CommandBar.svelte` — unused 마킹 (다음 정리 PR에서 삭제)
- `app/src/lib/cogochi/TabBar.svelte` — workMode 버튼 제거 (88-201줄), tab + split-mode만 남김
- `app/src/lib/cogochi/AIAgentPanel.svelte` — 5탭 재편 (AI/ANL/SCN/JDG/PAT)
- `app/src/lib/cogochi/StatusBar.svelte` — 신규, workMode 토글 (OBS/ANL/EXE) + 상태 표시
- `app/src/lib/cogochi/shell.store.ts` — RightPanelTab 타입 변경 + localStorage migration
- `app/src/lib/cogochi/cogochi.css` — 밀도 토큰 패스
- `app/src/lib/cogochi/modes/TradeMode.svelte` — chart-header 심볼/TF 제거, Analyze/Scan/Judge 인라인 영역 → 컴포넌트 import로 교체
- `app/src/lib/cogochi/modes/AnalyzePanel.svelte` — 신규 추출 (TradeMode drawerTab=analyze 영역)
- `app/src/lib/cogochi/modes/ScanPanel.svelte` — 신규 추출 (TradeMode scan 루프 UI)
- `app/src/lib/cogochi/modes/JudgePanel.svelte` — 신규 추출 (TradeMode judge plan UI)

API: 없음 (UI 전용)

## Non-Goals

- Indicator drawer (W-0374 D-4 별도)
- Drawing toolbar (W-0374 D-5 별도)
- MultiPaneChart 내부 변경 (W-0304)
- 모바일 — Phase 2 (이번 PR은 desktop ≥1280px만)
- AnalyzePanel/ScanPanel/JudgePanel 기능 추가 (W-0376/W-0377 후속)
- engine API 변경

## Layout V2 (Wireframe)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ TopBar [28px]  BTC▾ 4H │ 1m 5m 15m 1h 4h 1D │ CNDL│LINE│HA│BAR │ 77,270 +1.2% IND ⚙ │
├────────────────────────────────────────────────────────────────────────────────┤
│ TabBar [24px]  BTC×│TRAIN×│+        ░░░░░░░░░░░░░░░░░░░  │ ⊞ split │
├──────┬───────────────────────────────────────────────────┬────────────────────┤
│Watch │                                                   │ AIAgent Panel      │
│Rail  │           Chart (full bleed)                      │ 280px              │
│160px │           indicators overlay                      │ AI│ANL│SCN│JDG│PAT │
│      │           drawing tools (left edge auto-show)     │                    │
│ BTC  │                                                   │ tab content        │
│ ETH  │                                                   │                    │
├──────┴───────────────────────────────────────────────────┴────────────────────┤
│ StatusBar [22px]  net✓ feed✓ │ verdict 17 │ flywheel 47% │  OBS │ ANL │ EXE  │
└────────────────────────────────────────────────────────────────────────────────┘
```

Chrome 합계: 28+24+22 = 74px (vs 현재 chart-header 포함 ~120px). chart 영역 +46px.

## Facts

- TradeMode.svelte = 4258줄
- `<div class="chart-header">` = 1294줄 (symbol + TF + price + indicators)
- TabBar.svelte OBS/ANL/EXE 버튼 = 88-201줄
- TradeMode drawerTab 분기: analyze(1549줄~) / scan(~1760줄~) / judge(~1900줄~)
- AIAgentPanel.svelte 현재 탭: decision/pattern/verdict/research/judge (310줄)
- TopBar.svelte 현재 탭: symbol/TF strip/chartType/IND (160줄)

## Canonical Files

```
app/src/lib/cogochi/modes/TradeMode.svelte
app/src/lib/cogochi/modes/AnalyzePanel.svelte  (신규)
app/src/lib/cogochi/modes/ScanPanel.svelte     (신규)
app/src/lib/cogochi/modes/JudgePanel.svelte    (신규)
app/src/lib/cogochi/AppShell.svelte
app/src/lib/cogochi/TopBar.svelte
app/src/lib/cogochi/TabBar.svelte
app/src/lib/cogochi/AIAgentPanel.svelte
app/src/lib/cogochi/StatusBar.svelte           (신규)
app/src/lib/cogochi/shell.store.ts
app/src/lib/cogochi/cogochi.css
```

## Assumptions

- W-0374 D-0~D-3 (TopBar, AIAgentPanel 5탭, shell.store extensions) ✅ main에 있음
- desktop ≥1280px 기준 레이아웃, 모바일은 별도
- AnalyzePanel/ScanPanel/JudgePanel props 시그니처: TradeMode에서 넘기는 state 그대로 (깊은 리팩토링 없음)

## CTO 관점

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| TradeMode 4258줄 분해 중 회귀 | 중 | 고 | Phase-by-phase: chart-header 먼저 → 컴포넌트 추출 → tab 정리 순서. 각 Phase 후 svelte-check |
| workMode StatusBar 이전 시 UX 혼란 | 저 | 중 | StatusBar amber accent, 첫 진입 1회 tooltip |
| AIAgentPanel 탭 rename (research→AI, verdict→JDG) | 중 | 중 | localStorage normalizeShellState fallback (research→'decision' alias) |
| desktop ≥1280px 가정 → 노트북 1366×768 | 중 | 고 | min-width 1280px 가드, <1280 시 right panel collapse |
| svelte-check regression | 저 | 저 | CI matrix |

### Dependencies / Rollback / Files Touched

- Depends on: W-0374 Phase D-0~D-3 ✅ merged (#839)
- Blocks: W-0374 D-4 (IndicatorLibrary) — D-4는 이 PR 후 시작
- Rollback: 단일 PR squash → revert 1 commit. CommandBar.svelte는 삭제 대신 unused 처리 → 안전
- Files Touched: 수정 8 + 신규 4 (AnalyzePanel/ScanPanel/JudgePanel/StatusBar)

## AI Researcher 관점

### Data Impact

- verdict 입력 위치 변경(JDG 탭 → 우측 패널) → 이벤트 로깅 키 동일 (captures.user_verdict) → 학습 데이터 연속성 ✅
- workMode (OBS/ANL/EXE) → StatusBar 이전. shellStore에 그대로 → 텔레메트리 연속

### Statistical Validation

- 본 PR은 데이터/알고리즘 변경 없음 (UI only). 통계 유효성 영향 없음.

### Failure Modes

- TF 변경 응답시간 회귀 (TopBar single source) — perf budget: TF click → chart re-render < 200ms
- AIAgentPanel 탭 rename 시 localStorage 잘못된 값 → normalizeShellState fallback 'decision'

## Decisions

- [D-0001] CommandBar — unused 마킹 (다음 PR 삭제). 거절: 유지 = 60px chrome 낭비.
- [D-0002] ~~workMode → StatusBar~~ **폐기** — StatusBar 이미 8슬롯 가득. → D-0010으로 대체.
- [D-0003] AIAgentPanel 5탭 = AI / ANL / SCN / JDG / PAT. 거절: 6탭 = 9px 폰트 강제.
- [D-0004] TradeMode → AnalyzePanel/ScanPanel/JudgePanel 추출 ✅. 4258줄 → ≤2000줄.
- [D-0005] price + change% TopBar 흡수. liveTickStore, 색상 pos/neg/g6.
- [D-0006] AIAgentPanel width 320→280px. 차트 +40px 확보.
- [D-0007] mode(trade/train/fly) vs workMode(obs/anl/exe) **분리 유지** — 다른 추상화 레벨.
- [D-0008] TradingView **parity** 목표 (density 차용 아님) — Frozen 2026-05-01 전면 해제.
- [D-0009] 즉시 cutover + **`?cogochi_legacy=1` 7일 escape hatch** — 베타 ≤30명, A/B 불필요.
- [D-0010] workMode 위치 = **TabBar 우측 끝** (⌘1/2/3, amber active). StatusBar 충돌 해소.

## Open Questions

- ~~[Q-0001]~~ **확정**: `research→'decision'`, `verdict→'judge'`, migration version key v2
- ~~[Q-0002]~~ **확정**: 즉시 cutover + D-0009 escape hatch
- [Q-0003] AnalyzePanel props — 객체 묶음 vs 개별. Phase 2 spike 첫 30분에 결정.
- [Q-0004] JudgePanel EXECUTE 버튼 — Phase 2 (자동매매) 배선 W별도. 이번 PR: placeholder만.

## Implementation Plan

**Phase 1 — TopBar 흡수 (4h)**
1. TopBar: price(liveTickStore) + change%(dailyChangePct) 추가, 색상 pos/neg/g6
2. TradeMode 1294줄 `chart-header`: symbol button + TF span 제거
3. 잔존: funding, OI/CVD/Fund toggles, microstructure toggle, evidence badge, conf bar, SAVE RANGE → class rename "chart-controls-bar", height 28px
4. svelte-check pass

**Phase 2 — cogochi.data.store + 컴포넌트 추출 (10h)**
1. `cogochi.data.store.ts` 신규 — analyzeData/scanCandidates/entryPlan/domLadderRows/phaseTimeline
2. TradeMode → store.set() producer로 전환
3. `AnalyzePanel.svelte` 신규 (~1549-1760줄 추출), store consumer
4. `ScanPanel.svelte` 신규 (~1760-1900줄 추출), store consumer
5. `JudgePanel.svelte` 신규 (~1900-2000줄 추출), store consumer + EXECUTE placeholder
6. TradeMode import + props 연결 → ≤2000줄

**Phase 3 — AIAgentPanel 재편 + analytics (8h)**
1. shell.store `RightPanelTab` = `'decision'|'analyze'|'scan'|'judge'|'pattern'`
2. localStorage migration v2: `research→'decision'`, `verdict→'judge'`
3. AIAgentPanel 탭 (AI/ANL/SCN/JDG/PAT) + cogochi.data.store consumer
4. `analytics.ts` 신규: 6 PostHog events 배선
5. AppShell: `?cogochi_legacy=1` escape hatch (7일)

**Phase 4 — TabBar workMode 이전 (4h)**
1. TabBar 88-201줄 OBS/ANL/EXE 구버전 제거
2. TabBar 우측 끝: workMode 3-toggle (amber, ⌘1/2/3, 첫 진입 amber pulse 1.5s)
3. CommandBar.svelte: `// UNUSED — W-0375` 마킹
4. AppShell: CommandBar 렌더 제거

**Phase 5 — 빈 상태 + 밀도 토큰 + CI (4h)**
1. ANL/SCN/JDG 빈/에러/로딩 3-state (PRODUCT-DESIGN-PAGES-V2.md P-02 spec)
2. `cogochi.css`: `--zone-top-bar:32px`, `--zone-tab-bar:24px`, `--zone-status-bar:24px`
3. WatchlistRail 178→160px, AIAgentPanel 320→280px
4. padding/gap: 1/2/4/6/8px 5단계만
5. ⌘[/] AIAgentPanel 탭 사이클 shortcut
6. `pnpm typecheck` 0 errors + `./tools/verify.py` PASS + PR

## Exit Criteria

- [ ] AC1: TradeMode.svelte ≤ 2000줄
- [ ] AC2: AnalyzePanel/ScanPanel/JudgePanel 3개 파일 + cogochi.data.store.ts 존재
- [ ] AC3: AIAgentPanel ANL/SCN/JDG 탭 → 추출 컴포넌트 렌더 (stub X)
- [ ] AC4: symbol + TF TopBar 1곳만 (chart-header 없음)
- [ ] AC5: chrome = TopBar(32) + TabBar(24) + StatusBar(24) = **80px**
- [ ] AC6: typecheck 0 errors + verify.py PASS
- [ ] AC7: ANL/SCN/JDG 빈/에러/로딩 3-state 구현
- [ ] AC8: PostHog 6 events 전송 확인 (analytics.ts)
- [ ] AC9: workMode ⌘1/2/3 + TabBar 우측 + 첫 진입 amber pulse
- [ ] AC10: localStorage v2 migration (research/verdict 자동 변환)
- [ ] AC11: `?cogochi_legacy=1` escape hatch 동작
- [ ] CI green, PR merged, CURRENT.md SHA 업데이트

## Handoff Checklist

- [ ] Phase 1: chart-header 심볼/TF 제거 + TopBar price 추가 완료
- [ ] Phase 2: 3개 컴포넌트 추출 + TradeMode ≤2000줄
- [ ] Phase 3: AIAgentPanel 탭 재편 + localStorage migration
- [ ] Phase 4: StatusBar 신설 + TabBar workMode 제거
- [ ] Phase 5: 밀도 토큰 + CI 통과
- [ ] CommandBar unused 마킹
- [ ] Q-0001 localStorage 정책 확정
