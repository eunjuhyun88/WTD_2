# W-0403 — Cogochi Surface Decomposition (V2 spec parity)

> Wave: 6 | Priority: P0 | Effort: L
> Charter: In-Scope (페이지 분리 설계 강제)
> Status: 🟡 Design Draft
> Created: 2026-05-04
> Depends on: PRODUCT-DESIGN-PAGES-V2.md (2026-05-01) — 7-surface 설계
> Supersedes intent of: 누적된 cogochi 단일 페이지 모델

## Owner
app — hjj032549@gmail.com

## Goal
PRODUCT-DESIGN-PAGES-V2.md가 7개 페이지(`/`, `/cogochi`, `/dashboard`, `/patterns`, `/patterns/[slug]`, `/verdict`, `/settings`)로 정의한 surface를 실제 라우트와 일치시키고, cogochi에 누적된 17개의 디자인 외 컴포넌트를 정리하여 cogochi가 **TRADE/TRAIN/FLY 3-mode 터미널**의 단일 책임만 갖도록 한다.

## Scope (감사 결과 기준)

### KEEP — cogochi에 남는다 (22개)
TopBar, TabBar, WatchlistRail, DrawingRail, WorkspaceStage, TradeMode, TrainMode+TrainStage, FlywheelStage, AIAgentPanel + AI/ANL/SCN/JDG/PAT 5탭, StatusBar, SymbolPickerSheet, IndicatorLibrary, IndicatorSettingsSheet, ChartBoard, ChartToolbar(L1+workspace), RangeSelectionPanel, ModeSheet, MobileTopBar, BottomSheet, CommandPalette, RetrainCountdown.

### MOVE — 다른 surface로 이전 (4개)
| Component | 현재 위치 | 이전 대상 | 이유 |
|---|---|---|---|
| `NewsFlashBar` | cogochi top/canvas 사이 | `/dashboard` | P-03 "recent activity" zone 적합 |
| `DecideRightPanel` | cogochi right (decide mode) | `/verdict` | P-06 verdict 제출 워크플로우 |
| `MultiPaneChartAdapter` | cogochi center (decide mode) | `/verdict` | DecideRightPanel과 짝 |
| `ResearchPanel` + `PatternLibraryPanel(+Adapter)` | cogochi 차트 우측 오버레이 / 모달 | `/patterns` | P-04 패턴 라이브러리 본진 |

### DELETE — 디자인에 없는 누적물 (17개)
PineScriptGenerator, WhaleWatchCard, KpiStrip, WorkspaceCompareBlock, AssetInsightCard, F60GateBar (paywall은 /settings로), CollectedMetricsDock (StatusBar 중복), DraftFromRangePanel (RangeSelectionPanel 중복), SaveSetupModal (SaveStrip로 충분), TerminalBottomDock, TerminalCommandBar (이미 주석처리됨), TerminalContextPanel(+Summary), TerminalLeftRail, TerminalRightRail, TerminalHeaderMeta, MarketDrawer, IntelPanel + WarRoom + GmxTradePanel + PolymarketBetPanel (전부 import 안 되는 dead code).

### ROUTE 정리 (3개)
| 라우트 | 조치 | 이유 |
|---|---|---|
| `/terminal` | **삭제** + 301 redirect → `/cogochi` | cogochi/+page.svelte 그대로 클론, SEO/analytics 분산 |
| `/benchmark` | `/patterns?tab=benchmark`로 통합 | P-04 spec에 `[목록][벤치마크][라이프사이클][전략]` 4탭 명시됨 |
| `/strategies` | `/patterns?tab=strategies`로 통합 | 위와 동일 |

추가 검토 필요 (이번 wave 밖):
- `/agent`, `/analyze`, `/lab`, `/passport`, `/status` — V2 spec에 없음. `/agent`는 Phase 2 자동매매 marketing landing이라 KEEP 가능, `/status`는 `/settings` 시스템상태 zone으로 통합 검토.

### MISSING — 디자인됐지만 미구현 (별도 W로 분리)
1. `cogochiDataStore` (`app/src/lib/cogochi/cogochi.data.store.ts`) 정식 추출
2. LocalStorage migration shim (`cogochi.migration.v=2`, RIGHT_PANEL_MIGRATION map)
3. WorkMode 첫 진입 amber pulse 온보딩
4. StatusBar 3-day 스트릭 amber-dot 훅
5. FLYWHEEL recommended action card
6. AIAgentPanel SCN 빈상태 countdown
7. `?cogochi_legacy=1` 7-day expiry 로직

→ 본 W-0403 외 별도 W-0404로 묶는다.

## Non-Goals
- 개별 페이지 와이어프레임 신규 디자인 — **본 doc은 분해/이전만**. 와이어프레임은 Step 2 별도 doc.
- 위 MISSING 7개 — 별도 W-0404
- IntelPanel/WarRoom 등 dead code의 git 히스토리 보존 — `git log -- <path>`로 충분, 단순 삭제

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| `/terminal` 삭제 시 외부 북마크/링크 broken | 중 | 저 | 301 redirect 영구 유지 |
| `/benchmark`+`/strategies` 통합 시 분석 이벤트 단절 | 중 | 중 | `page_view {route}` 이벤트에 `legacy_alias` 필드 추가, 30일 추적 후 정리 |
| Decide 모드 이전 시 verdict 제출 흐름 회귀 | 고 | 고 | PR 단위 e2e 테스트 + feature flag로 단계 롤아웃 |
| 17개 DELETE 중 import 누락된 게 실제로 살아있던 경우 | 중 | 중 | 각 DELETE 전 `grep -rn <component>` 확인 + CI build green 확인 |
| 작업 중 다른 워크트리에서 같은 파일 수정 충돌 | 고 | 중 | file-lock protocol (own.sh) 준수, PR당 파일 8개 이하 |

### Dependencies
- PRODUCT-DESIGN-PAGES-V2.md (canonical surface 정의)
- W-0395B 머지 완료 (cogochi/AIAgentPanel/StatusBar 안정화)
- W-0400 머지 완료 (indicator catalog modal — DELETE 대상과 무관)
- 이번 세션 머지 #1065 (rune fix), #1066 (foldable panels)

### Rollback
각 PR 단위 revert. PR 1(라우트 삭제)은 redirect 추가만 되돌림. PR 6(MOVE)는 컴포넌트 이전이라 revert 시 두 곳에 잠시 공존.

## AI Researcher 관점

### Data Impact
- `page_view`, `cta_click`, `workmode_switch` 이벤트의 `route` 분포 변화 추적
- `/terminal` → `/cogochi` 통합 후 cogochi 활성 사용자 수 합산 가능
- DecideRightPanel을 `/verdict`로 이전 후 verdict 제출 latency / completion rate 비교

### Statistical Validation
- Before/After D+7 비교 지표:
  - cogochi p50 TTI (불필요 17개 컴포넌트 제거 효과)
  - Bundle size delta (KB)
  - `/patterns` 진입율 (benchmark/strategies 흡수 효과)
  - verdict 제출 완료율

### Failure Modes
- `/verdict` 분리 후 사용자가 cogochi에서 결정 흐름을 못 찾음 → cogochi에 "Submit Verdict" CTA를 명확히 배치 (P-02 spec엔 PAT 탭 verdict 제출 있음)
- DELETE 컴포넌트가 사실 다른 페이지에서 import되고 있던 경우 → 빌드 실패. CI로 차단.

## Decisions
- [D-0403-1] 이전(MOVE) 우선, 삭제(DELETE)는 빌드 검증 후. 거절: 일괄 삭제 — import 누락 발견 못 하면 외주 페이지가 죽음.
- [D-0403-2] `/terminal`은 SvelteKit `redirect(301, '/cogochi')`로 처리. 거절: alias mount — 두 라우트 분석 이벤트가 계속 분리됨.
- [D-0403-3] `/benchmark`+`/strategies`는 `/patterns` 4탭 모델로 통합. 거절: 그대로 두기 — P-04 spec 위반 명백, 사용자 제기한 핵심 불만.
- [D-0403-4] decide mode를 `/verdict`로 옮기되 cogochi에서 deep-link 가능하게 유지. 거절: cogochi에 그대로 두기 — TerminalHub 분기 코드 최대 비대 원인.
- [D-0403-5] MISSING 7개는 W-0404로 분리. 거절: 본 W에 포함 — 분해와 신규 빌드는 다른 work, blast radius 분리.

## Open Questions
- [ ] [Q-0403-1] `/agent`, `/analyze`, `/lab`, `/passport`는 keep/delete? CPO 결정 필요.
- [ ] [Q-0403-2] `/status`를 `/settings` zone으로 합칠지 별도 admin-only 라우트로 둘지?
- [ ] [Q-0403-3] DecideRightPanel을 `/verdict`로 전체 이전 vs 일부만 (HUD는 cogochi 유지) 결정?

## PR 분해 계획

> 각 PR 독립 머지 가능. 디자인-파괴 위험 낮은 순서로.
> PR 1-3은 ROUTE 정리 (가장 작은 blast radius), PR 4는 DELETE 정리, PR 5-6은 MOVE.

### PR 1 — `/terminal` 라우트 삭제 + redirect (Effort: S)
**목적**: cogochi 클론 라우트 1개 제거.
**검증**: `/terminal` 접근 시 301 → `/cogochi`. 분석 이벤트 합산 시작.
**신규**: `app/src/routes/terminal/+page.server.ts` (redirect)
**삭제**: `app/src/routes/terminal/+page.svelte`
**Exit**:
- [ ] AC1-1: `curl -I /terminal` → 301 Location: /cogochi
- [ ] AC1-2: `page_view {route:'cogochi'}` 카운트 증가 확인 (D+1)
- [ ] CI green

### PR 2 — `/benchmark` → `/patterns?tab=benchmark` 통합 (Effort: M)
**목적**: P-04 spec 4탭 중 `[벤치마크]` 활성화.
**검증**: 기존 benchmark 페이지 기능이 patterns 탭으로 동작.
**신규**: `app/src/routes/patterns/_tabs/Benchmark.svelte`, `app/src/routes/benchmark/+page.server.ts` (redirect with `?tab=benchmark`)
**수정**: `app/src/routes/patterns/+page.svelte` (탭 라우터 + 쿼리파람 핸들링)
**삭제**: `app/src/routes/benchmark/+page.svelte`
**Exit**:
- [ ] AC2-1: `/benchmark` → `/patterns?tab=benchmark` redirect
- [ ] AC2-2: backtest equity-curve 비교 동작 동일
- [ ] AC2-3: API 호출 변화 없음 (`fetchPatternBacktest` 동일)
- [ ] CI green

### PR 3 — `/strategies` → `/patterns?tab=strategies` 통합 (Effort: M)
**목적**: P-04 4탭 중 `[전략]` 활성화.
**검증**: Sharpe/APR/win-rate 정렬 + 드릴다운 동작 patterns 탭에서 가능.
**신규**: `app/src/routes/patterns/_tabs/Strategies.svelte`, `app/src/routes/strategies/+page.server.ts` (redirect)
**수정**: `app/src/routes/patterns/+page.svelte` (PR 2 탭 라우터에 추가)
**삭제**: `app/src/routes/strategies/+page.svelte`
**Exit**:
- [ ] AC3-1: `/strategies` → `/patterns?tab=strategies`
- [ ] AC3-2: 정렬/드릴다운 회귀 없음
- [ ] CI green

### PR 4 — DELETE 17개 dead/feature-creep 컴포넌트 정리 (Effort: M)
**목적**: cogochi import 트리에서 디자인 외 컴포넌트 제거.
**검증**: 빌드 사이즈 감소, CI green, cogochi 페이지 동작 동일.
**삭제 (3그룹으로 PR 분할 가능; 일단 한 PR로 시도)**:
- Dead code (mounted 안 됨): IntelPanel, WarRoom*, GmxTradePanel, PolymarketBetPanel, TerminalCommandBar, TerminalContextPanel(+Summary), TerminalLeftRail, TerminalRightRail, TerminalHeaderMeta
- 디자인 외 (mounted): PineScriptGenerator, WhaleWatchCard, KpiStrip, WorkspaceCompareBlock, AssetInsightCard, F60GateBar, CollectedMetricsDock, DraftFromRangePanel, SaveSetupModal, TerminalBottomDock, MarketDrawer
**Exit**:
- [ ] AC4-1: `pnpm build` green
- [ ] AC4-2: `app/build/` size delta ≥ -50KB (est.)
- [ ] AC4-3: cogochi 정상 렌더 (Playwright smoke)
- [ ] CI green

### PR 5 — `NewsFlashBar` cogochi → `/dashboard` 이전 (Effort: S)
**목적**: P-03 "recent activity" zone 채움.
**신규/수정**: `/dashboard/+page.svelte`에 NewsFlashBar mount
**수정**: `TerminalHub.svelte`에서 NewsFlashBar 제거
**Exit**:
- [ ] AC5-1: cogochi에서 NewsFlash 안 보임
- [ ] AC5-2: dashboard에서 동일 데이터 표시
- [ ] CI green

### PR 6 — Pattern overlay/library cogochi → `/patterns` 이전 (Effort: M)
**목적**: ResearchPanel + PatternLibraryPanel(+Adapter) cogochi에서 제거, /patterns에 이식.
**검증**: cogochi에서 Pattern Library 모달 자동 오픈 가능성 0 (이미 #1066에서 제거됨, 잔재 정리).
**수정**: `app/src/routes/patterns/+page.svelte` (record viewer mount)
**삭제**: `app/src/lib/hubs/terminal/PatternLibraryPanelAdapter.svelte`, `app/src/lib/hubs/terminal/workspace/ResearchPanel.svelte`, `PatternLibraryPanel.svelte`는 patterns로 이동
**Exit**:
- [ ] AC6-1: cogochi에서 PatternLibrary import 트리 0
- [ ] AC6-2: /patterns에서 capture record 50개 이상 렌더
- [ ] CI green

### PR 7 — Decide mode (`DecideRightPanel`+`MultiPaneChartAdapter`) → `/verdict` 이전 (Effort: L)
**목적**: TerminalHub 최대 분기 제거, P-06 verdict 흐름 본진화.
**검증**: cogochi에서 isDecideMode 분기 코드 제거, /verdict deep-link로 동일 UX.
**수정**: `/verdict/+page.svelte`에 panel + adapter mount, `TerminalHub.svelte`에서 isDecideMode 분기 삭제
**삭제**: cogochi 트리에서 두 컴포넌트 import 제거
**Exit**:
- [ ] AC7-1: TerminalHub LoC -100 이상
- [ ] AC7-2: /verdict?id={verdictId}로 deep-link 동작
- [ ] AC7-3: verdict 제출 e2e 테스트 PASS
- [ ] CI green

## 전체 Exit Criteria (W-0403)
- [ ] 14개 라우트 → 11개 (terminal/benchmark/strategies 정리)
- [ ] cogochi 컴포넌트 import 트리 KEEP 22개만 남음
- [ ] cogochi p50 TTI 측정값 (PR 7 D+7 실측)
- [ ] CI green (App + Engine + Contract)
- [ ] PR merged + CURRENT.md SHA 업데이트
- [ ] PRODUCT-DESIGN-PAGES-V2.md "Frozen 전면 해제" 명시 부분에 "W-0403 분해 완료" 표기

## 다음 Wave
- **W-0404 — Cogochi V2 spec 미구현 7개 빌드** (cogochiDataStore, migration shim, onboarding pulse 등)
- **W-0405 — 페이지별 와이어프레임 재디자인** (Step 2: 본 분해 후 visual redesign)
