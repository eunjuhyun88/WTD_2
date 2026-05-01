# W-0372 Phase D — Cogochi Terminal 이식 고도화 (Architecture · Perf · UX · Chart)

> Wave: 5 | Priority: P1 | Effort: M-L (8-10일)
> Charter: §In-Scope (IA Consolidation + Chart UX). 차트 Frozen 2026-05-01 해제됨.
> Status: 🟡 Design Draft
> Parent: W-0372 (Phase A/B ✅, Phase C PR #830 OPEN)
> Issue: #833
> Created: 2026-05-01
> Owner: app

---

## 0. Goal

> **사용자가 cogochi 한 화면에서 차트 → 패턴 → 판정 → 결정 → 기록까지 — terminal보다 빠르고 매끄럽게.**

수치 목표:
- LCP ≤ 2.5s (p75, /cogochi)
- CLS = 0 (mode 전환 / 차트 swap)
- INP ≤ 200ms (HUD 토글, j/k nav)
- Bundle size +30% 이내 (Phase C baseline)
- 100항목 VerdictInbox 60fps
- lightweight-charts heap delta ≤ 5% (5회 mode 전환)

---

## 1. Scope

3축 + 1축(Architecture / Perf / UX / Data) 동시 충족. 차트 UX 개선 항목 자유롭게 포함 가능 (Charter 해제 후).

### 1.1 Architecture 축

#### A1. shell.store 확장 (single source of truth)

현재 shell.store.ts (597L):
```typescript
export type WorkspacePanelId = 'analyze' | 'scan' | 'judge';
export type WorkspaceStageMode = 'single' | 'split-2' | 'grid-4';
export type ShellWorkMode = 'observe' | 'analyze' | 'execute';
```

확장:
```typescript
export type ShellWorkMode = 'observe' | 'analyze' | 'execute' | 'decide'; // 'decide' 추가

export interface ShellTabState {
  // ... 기존 ...
  decisionBundle: PanelViewModel | null;     // panelAdapter 결과
  hudVisible: boolean;                        // DecisionHUD 토글
  panelData: {
    chartSeries: ChartSeriesPayload | null;
    patternRecallMatches: PatternRecallMatch[] | null;
    rerankedEvidence: EvidenceItem[] | null;
  };
  paneIndicators: PaneIndicatorMap;          // W-0304 통합
  selectedVerdictId: string | null;          // VerdictInboxPanel j/k nav
}
```

새 액션: `setDecisionBundle`, `toggleHud`, `setPaneIndicators`, `selectVerdict`, `enterDecideMode`
새 derived: `currentDecisionBundle`, `isDecideMode`, `selectedVerdict`

회귀 방지:
- 기존 derived 5개(`activeTab`, `activeMode`, `allVerdicts`, `verdictCount`, `modelDelta`) 시그니처 불변
- 휘발성: `decisionBundle`, `panelData` (persist 안 함)
- persist: `paneIndicators`, `hudVisible`만

#### A2. panelAdapter 호출 경로 정형화

`lib/terminal/panelAdapter.ts` exports:
- `PanelViewModel`, `PanelHeaderModel`
- `buildTerminalDecisionBundle(input)`
- `rerankEvidenceWithMemory(evidence, memory)`
- `buildPatternRecallMatches(input)`

호출 위치:
- **WorkspaceStage**가 analyze panel mount/refresh 시 dispatch
- AppShell은 subscribe만 (`currentDecisionBundle`)
- 단일 책임: WorkspaceStage = fetch, AppShell = display

#### A3. 컴포넌트 props 어댑팅

| 컴포넌트 | 줄수 | 어댑팅 |
|---|---|---|
| DecisionHUD | 544 | `bundle: PanelViewModel` prop, dispatch는 부모 |
| MultiPaneChart | 548 | `series, paneIndicators` props, internal store 분리 |
| PatternLibraryPanel | 100 | `items, onSelect, query, filters` props |
| VerdictInboxPanel | 601 | `verdicts, selectedId, onSelect, onWatchHit` props, virtualization 내부 |

원칙: unstyled-first, cogochi 토큰 안에서 CSS 적용, 글로벌 :root 의존 제거.

### 1.2 Perf 축

#### P1. Dynamic Import

| 컴포넌트 | 트리거 | 형태 |
|---|---|---|
| DecisionHUD | activeMode='decide' 첫 진입 | `await import('$lib/terminal/...')` |
| MultiPaneChart | useMultiPane=true 첫 mount | dynamic |
| VerdictInboxPanel | scroll 진입 (IntersectionObserver) | dynamic |
| PatternLibraryPanel | LibrarySection mount | static (100L 작음) |

`{#await}` + skeleton, 차트는 ChartSvg fallback 즉시 페인트.

#### P2. Virtualization

- **VerdictInboxPanel**: `svelte-virtual-list` (16KB gz, 의존성 1) — 50+ 항목
- **PatternLibraryPanel**: 동일 — 100+ 항목 (저빈도)
- 결정 D-5: svelte-virtual-list (자체 구현 maintenance 부담 회피)

#### P3. Memoization

- `buildTerminalDecisionBundle` 결과 LRU(16) 캐시
- key = `(symbol, lastBarTime, evidenceIds.join(','))`
- panelData 동일 시 dispatch skip

#### P4. WS Throttle

- WatchlistRail sparkline ≥ 100ms (rAF + last-write-wins)
- DecisionHUD evidence 도착 ≥ 250ms debounce

#### P5. Bundle Budget

- baseline: `pnpm --filter app build && du -sk build/_app/immutable/chunks/cogochi-*.js`
- 목표: +30% 이내 (Phase C 기준)
- Vite manualChunks: `terminal-*` 별도 chunk

#### P6. Web Vitals 계측

- `@web-vitals` 통합 (W-0364와 공유, 없으면 D-8 도입)
- LCP/CLS/INP 로그 → `/api/metrics` 또는 console.table
- D-8 PR 본문 baseline / after 표 의무

### 1.3 UX 축 (차트 Frozen 해제 후 확장)

#### U1. DecisionHUD 결정 흐름

- 'decide' mode 진입 시 AIPanel 우측 collapsible drawer (≥150ms ease-in-out)
- 우측 위→아래 스택: header / verdict / pattern recall / evidence list
- collapsed 상태: 우측 끝 16px 핀 (클릭 시 expand)
- skeleton (3 row) / empty ("판정 데이터 없음 — analyze 먼저") / error (재시도) 3 상태

#### U2. MultiPaneChart in WorkspaceStage

- `useMultiPane` flag, default OFF → measure → flip ON in D-8
- mode 전환 시 인스턴스 dispose (cleanup hook 필수)
- LCP/CLS 측정 후 default ON

**차트 UX 개선 (Frozen 해제 후 신규 가능)**:
- pane 간 drag-resize handle (8px hit area)
- pane 더블클릭 시 maximize/restore
- pane별 indicator badge (좌측 상단, click → IndicatorSettingsSheet)
- mode 전환 애니메이션 (≤200ms ease)
- 차트 hover crosshair sync (multi-pane 시 X축 동기화)

#### U3. PatternLibraryPanel

- 검색 input (debounce 200ms)
- 필터 chip: winrate ≥ 0.55 / sample ≥ 30
- 100+ 항목 가상화
- 키보드: 위/아래/Enter

#### U4. VerdictInboxPanel

- VerdictsSection 내부 wrap
- `j` (next) / `k` (prev) / Enter (open) — W-0361 인프라 재사용
- watch-hit 클릭 → 기존 endpoint POST (Q-3 확인)
- mobile bottom-sheet (스와이프 down 닫기)

#### U5. Mobile 분기 (`useMobile()` derived 단일 진실)

<768px:
- WatchlistRail → SymbolPickerSheet bottom drawer
- DecisionHUD → bottom sheet (drag handle, 60%/90% snap)
- MultiPaneChart → 단일 pane (split-2/grid-4 비활성)
- VerdictInboxPanel → bottom sheet, j/k 비활성

데스크탑: 기존 3-column 유지.

#### U6. Skeleton/Empty/Error (4개 컴포넌트 의무)

- skeleton: 3-5 lines pulse (≤200ms 후 표시)
- empty: 한 줄 안내 + CTA
- error: 메시지 + Retry + 로그 expand

#### U7. ★★ 4개 이식

| 컴포넌트 | 위치 | UX |
|---|---|---|
| NewsFlashBar | CommandBar 상단 28px | dismissable, throttle 1/3s |
| JudgePanel | TradeMode 내부 | 진입/회피 결과 카드 |
| ScanGrid | TabBar 'scan' panel | 8×N grid, 셀 64px cap |
| ResearchPanel | AIPanel 하단 expandable | freeform 노트, persist |

#### U8. Lab Hub PineScript 탭

- `/lab/pinescript` 골조 (탭 + page)
- 백테스트 endpoint은 별도 W (Q-9)

#### U9. 차트 UX 추가 (Frozen 해제 후 가능)

- TradingView 스타일 keyboard shortcut (이미 W-0361)
- crosshair info bar (pane 위 OHLCV + indicator value)
- timeframe quick switcher (1m/5m/15m/1h/4h/1D)
- volume profile overlay 옵션
- price alert 마커 (간단한 horizontal line + 알림)

(D-3 PR 범위 안에 포함, 단 항목별 separate commit으로 검토 용이성 확보)

### 1.4 Data 축

#### Migration 041

```sql
-- supabase/migrations/041_user_watchlist.sql
CREATE TABLE IF NOT EXISTS user_watchlist (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, symbol)
);

CREATE INDEX user_watchlist_user_pos_idx ON user_watchlist(user_id, position);

ALTER TABLE user_watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_watchlist_select_own" ON user_watchlist
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_watchlist_modify_own" ON user_watchlist
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

Down script (필수):
```sql
-- supabase/migrations/041_user_watchlist_down.sql
DROP POLICY IF EXISTS "user_watchlist_modify_own" ON user_watchlist;
DROP POLICY IF EXISTS "user_watchlist_select_own" ON user_watchlist;
DROP INDEX IF EXISTS user_watchlist_user_pos_idx;
DROP TABLE IF EXISTS user_watchlist;
```

#### API

- `GET /api/watchlist` — 본인 목록 (RLS)
- `PATCH /api/watchlist` — `{ add?, remove?, reorder? }` atomic transaction

#### Migration 로직 (offline-first)

```typescript
async function migrateLocalWatchlistToSupabase() {
  const local = JSON.parse(localStorage.getItem('cogochi:watchlist:v1') ?? '[]');
  if (!local.length || localStorage.getItem('cogochi:watchlist:migrated')) return;

  const remote = await fetch('/api/watchlist').then(r => r.json());
  if (remote.length === 0 && local.length > 0) {
    await fetch('/api/watchlist', { method: 'PATCH', body: JSON.stringify({ add: local }) });
  }
  localStorage.setItem('cogochi:watchlist:migrated', '1');
  // localStorage 유지 (offline fallback)
}
```

원칙:
- Supabase 실패 → localStorage offline 모드 (silent)
- Add/Remove optimistic, 실패 시 rollback + toast

### 1.5 Non-Goals

- /terminal 라우트 코드 **삭제** (소스 in-place 보존)
- 컴포넌트 자체 리디자인 (props/CSS 토큰 미세 조정만)
- copy_trading / leaderboard / 실자금 자동매매 (여전히 Frozen)
- 새 백테스트 알고리즘 / 새 인디케이터 알고리즘 (Phase D 밖)
- DrawingCanvas / F60GateBar (★ 후속 W로 분리)

---

## 2. CTO 관점

### 2.1 Risk Matrix

| # | Risk | 확률 | 영향 | 완화 |
|---|---|---|---|---|
| R1 | lightweight-charts 멀티 인스턴스 메모리 누수 (split-2/grid-4 반복) | 중 | 큼 | mount/destroy hook 명시, heap snapshot 5회 검증 (AC4) |
| R2 | shell.store 확장 시 기존 derived 회귀 | 중 | 중 | 시그니처 불변, vitest 1955+ 의무, D-1 PR 단독 |
| R3 | VerdictInboxPanel 601L 비가상화 시 모바일 lag | 높음 | 큼 | svelte-virtual-list 의무, 100항목 60fps (AC9) |
| R4 | panelAdapter 호출 위치 충돌 (WorkspaceStage/AppShell 중복) | 중 | 중 | 단일 책임: WorkspaceStage만 dispatch (D-2) |
| R5 | dynamic import FOUC | 높음 | 작음 | ChartSvg fallback + skeleton 우선 |
| R6 | WatchlistRail Supabase migration 데이터 손실 | 낮음 | 큼 | localStorage 유지 (offline), migrated flag 멱등 |
| R7 | Mobile DecisionHUD ↔ keyboard shortcut 충돌 | 중 | 작음 | mobile 환경 단축키 비활성, useMobile() 분기 |
| R8 | ★★ 4개 이식 시 store 의존성 추가 발견 | 중 | 중 | D-6 PR 의존성 그래프 첨부 |
| R9 | bundle size +30% 초과 | 중 | 중 | manualChunks, dynamic import 의무, analyzer 첨부 |
| R10 | RLS 비인증 사용자 401 → UX 저해 | 낮음 | 작음 | silent fallback, localStorage 단독 |
| R11 | crosshair sync 차트 멀티 pane 시 perf 저하 | 중 | 중 | rAF throttle, hover sample rate 60Hz cap |

### 2.2 Dependencies

- ✅ Phase A (PR #826): AppNavRail / MobileBottomNav
- ✅ Phase B (PR #829): hub layouts + Home + redirects
- 🟡 Phase C (PR #830 OPEN): WatchlistRail fold/add/delete + cleanup — **머지 후 시작**
- 🟢 W-0364 perf hardening (병행): @web-vitals, bundle analyzer
- 🟢 W-0304 per-pane indicator (paneIndicators 공유)
- ✅ W-0331 LiveDecisionHUD canonical path
- ✅ W-0361 keyboard shortcut infra
- ✅ W-0356 cogochi 3-column always-visible

### 2.3 Rollback

PR 분할 atomic, 각 단계 revert 가능:

| Step | Rollback |
|---|---|
| D-1 store | revert PR → 기존 ShellWorkMode 복귀 |
| D-2 HUD | feature flag `useDecisionHud=false` |
| D-3 Chart | flag `useMultiPane=false` → ChartSvg 자동 |
| D-4 Library | LibrarySection 원본 복원 |
| D-5 VerdictInbox | VerdictsSection 원본 복원 |
| D-6 ★★4 | 컴포넌트별 flag 4개 |
| D-7 Supabase | down script + API 비활성 → localStorage 단독 |

### 2.4 Files Touched (실측)

#### 신규 (NEW)

```
app/src/lib/cogochi/sections/PatternLibraryWrap.svelte
app/src/lib/cogochi/sections/VerdictInboxWrap.svelte
app/src/lib/cogochi/modes/DecideMode.svelte
app/src/lib/cogochi/utils/useMobile.ts
app/src/lib/cogochi/utils/migrateWatchlist.ts
app/src/routes/api/watchlist/+server.ts
app/src/routes/lab/pinescript/+page.svelte
supabase/migrations/041_user_watchlist.sql
supabase/migrations/041_user_watchlist_down.sql
app/tests/cogochi/decide-mode.test.ts
app/tests/cogochi/watchlist-migration.test.ts
```

#### 수정 (MODIFIED)

```
app/src/lib/cogochi/shell.store.ts
app/src/lib/cogochi/AppShell.svelte
app/src/lib/cogochi/WorkspaceStage.svelte
app/src/lib/cogochi/AIPanel.svelte
app/src/lib/cogochi/CommandBar.svelte
app/src/lib/cogochi/TabBar.svelte
app/src/lib/cogochi/WatchlistRail.svelte
app/src/lib/cogochi/MobileBottomNav.svelte
app/src/lib/cogochi/sections/LibrarySection.svelte
app/src/lib/cogochi/sections/VerdictsSection.svelte
app/src/lib/cogochi/modes/TradeMode.svelte
app/src/routes/cogochi/+page.svelte
vite.config.ts
work/active/CURRENT.md
```

#### 보존 (PRESERVED — 절대 삭제 금지)

```
app/src/lib/terminal/DecisionHUD.svelte
app/src/lib/terminal/MultiPaneChart.svelte
app/src/lib/terminal/PatternLibraryPanel.svelte
app/src/lib/terminal/VerdictInboxPanel.svelte
app/src/lib/terminal/NewsFlashBar.svelte
app/src/lib/terminal/JudgePanel.svelte
app/src/lib/terminal/ScanGrid.svelte
app/src/lib/terminal/ResearchPanel.svelte
app/src/lib/terminal/panelAdapter.ts
app/src/lib/chart/paneIndicators.ts
app/src/lib/api/terminalBackend.ts
app/src/routes/terminal/+page.svelte (Phase C에서 301)
```

---

## 3. AI Researcher 관점

### 3.1 Data Impact

| 데이터 | 변화 |
|---|---|
| decision ledger | DecisionHUD 항상 노출 → 빈도 증가, 품질·밀도 향상 |
| indicator usage | MultiPaneChart pane 활용 패턴 수집 가능 |
| verdict transition latency | j/k → watch-hit 까지 ms 측정 |
| symbol preference | Supabase user_watchlist → universe 선호도 |
| mode 전환 패턴 | observe ↔ analyze ↔ decide ↔ execute 시퀀스 funnel |
| mobile vs desktop | useMobile() 분기로 디바이스별 행동 분리 |

### 3.2 Statistical Validation

- Web Vitals (LCP/CLS/INP): p50/p75/p95 보고
- 컴포넌트 mount 시간: Performance.measure
- A/B 가능: useMultiPane flag → 50/50 또는 query param
- Memory profiling: heap snapshot manual 또는 Playwright `page.metrics()`

### 3.3 Failure Modes & Fallback

| 실패 | Fallback |
|---|---|
| panelAdapter 데이터 없음 | DecisionHUD placeholder + analyze CTA |
| 차트 import 실패 | ChartSvg 정적 fallback + retry |
| Supabase 401/5xx | localStorage 단독 (silent) |
| 신규 사용자 (Supabase 200 + empty) | localStorage 1회 PATCH |
| VerdictInbox 빈 상태 | 안내 + analyze CTA |
| WS disconnect | 마지막 값 freeze + reconnect indicator |
| ★★ 컴포넌트 렌더 에러 | error boundary → 해당 섹션만 비활성 |

---

## 4. Decisions

### D-1. shell.store에 'decide' mode 추가
**채택**: ShellWorkMode에 'decide' 추가, decisionBundle/hudVisible/panelData 필드.
**거절**: 별도 hud.store (cross-store sync 비용), boolean만 (race risk).

### D-2. panelAdapter 호출 — WorkspaceStage
**채택**: WorkspaceStage가 dispatch, AppShell subscribe만.
**거절**: AppShell mount 시 호출 (책임 도치), DecisionHUD 자체 fetch (props-only 원칙 위반).

### D-3. MultiPaneChart 도입 — feature flag
**채택**: `useMultiPane` prop default OFF → measure → D-8에서 ON.
**거절**: 즉시 replace (R1 미검증), per-user flag (인프라 부재).

### D-4. Lazy load — component-level dynamic import
**채택**: SvelteKit `{#await import(...)}` 컴포넌트 별.
**거절**: route-level만 (LCP 악화), preload on hover (복잡도).

### D-5. VerdictInbox virtualization — svelte-virtual-list
**채택**: 16KB gz, 의존성 1.
**거절**: 자체 IntersectionObserver (maintenance), @tanstack/virtual (60KB+).

### D-6. Keyboard nav — j/k vim 스타일
**채택**: j (down) / k (up) / Enter (action), W-0361 재사용.
**거절**: arrow (차트 pan 충돌), tab (폼 충돌).

### D-7. Mobile DecisionHUD — bottom sheet
**채택**: 60%/90% snap, drag handle.
**거절**: full-screen modal (컨텍스트 단절), 우측 fly-in (가독성).

### D-8. WatchlistRail 마이그레이션 — 자동 1회
**채택**: 첫 로그인 시 PATCH, migrated flag 멱등.
**거절**: 사용자 수동 (UX 마찰), dual-write (복잡도).

### D-9. PR 분할 — 7개 atomic (D-1 ~ D-7) + D-8 QA
**채택**: 단계별 atomic merge.
**거절**: 통합 1PR (리뷰/rollback 부담), 더 잘게 (코스트 비효율).

### D-10. lightweight-charts 라이프사이클 — per-pane
**채택**: pane 별 인스턴스, mount/dispose hook.
**거절**: shared instance (API 한계), pool (복잡도).

### D-11. PatternLibrary 검색/필터 — client-side
**채택**: 50-200 항목 가정, props로.
**거절**: server endpoint (불필요), URL query (탭 다중과 복잡).

### D-12. ★★ 4개 순서 — NewsFlashBar 우선
**채택**: NewsFlashBar (1) → JudgePanel (2) → ScanGrid (3) → ResearchPanel (4).
**근거**: 의존성 단순도 + 시각 효과 순.

### D-13. 차트 UX 개선 (Frozen 해제 후 신설)
**채택**: D-3 PR에 다음 5개 포함:
1. pane drag-resize handle
2. pane 더블클릭 maximize/restore
3. pane별 indicator badge
4. mode 전환 애니메이션 ≤200ms
5. multi-pane crosshair X축 동기화

**거절**:
- (a) 차트 UX는 후속 W로 — 거절: Charter 해제 후 통합 처리가 효율적, MultiPaneChart 이식과 자연스러운 묶음
- (b) 모든 TradingView 기능 — 거절: 본 Phase 범위 초과, drawing/replay/alert 등은 후속

---

## 5. Open Questions

- [ ] **Q-1** panelAdapter buildTerminalDecisionBundle 호출 빈도? 가설: analyze 완료 + WS evidence, debounce 250ms
- [ ] **Q-2** lightweight-charts 인스턴스 정리 타이밍? 가설: unmount + 재mount, 누수 측정 후 캐시 검토
- [ ] **Q-3** VerdictInboxPanel watch-hit endpoint? `/api/captures/hit` vs `/api/watchlist/hit` — terminal 코드 grep 확인 필요
- [ ] **Q-4** Mobile drawer backdrop blur perf — iOS Safari 60fps 유지? 측정 필요
- [ ] **Q-5** Supabase RLS 비인증 fallback — silent (가설) vs toast 알림
- [ ] **Q-6** ScanGrid 'scan' panel과 'scan' mode 차이 — 현 가설: panel만, mode 추가 불필요
- [ ] **Q-7** ResearchPanel ↔ AIPanel 중복 — 현 가설: AIPanel 하단 expandable 흡수
- [ ] **Q-8** Bundle baseline 수치 — D-1 PR 함께 측정 첨부
- [ ] **Q-9** PineScript 백테스트 endpoint — 별도 W 발행 필요

---

## 6. Implementation Plan

### D-1 — shell.store 확장 (1일)

**Files**: shell.store.ts (수정), tests/cogochi/decide-mode.test.ts (신규)

**Tasks**:
1. `ShellWorkMode` 'decide' 추가
2. `ShellTabState` 5개 필드 추가
3. 액션 5개: setDecisionBundle / toggleHud / setPaneIndicators / selectVerdict / enterDecideMode
4. derived 3개: currentDecisionBundle / isDecideMode / selectedVerdict
5. localStorage hydrate: paneIndicators, hudVisible만 persist
6. vitest: 새 8+ 테스트, 기존 derived 5개 시그니처 검증

**Exit**: vitest 1955+ pass, 회귀 0건.

### D-2 — DecisionHUD 이식 + lazy (1.5일)

**Files**: AppShell.svelte (수정), AIPanel.svelte (수정), modes/DecideMode.svelte (신규), WorkspaceStage.svelte (수정), utils/useMobile.ts (신규)

**Tasks**:
1. DecideMode.svelte: dynamic import DecisionHUD, props=bundle, skeleton/empty/error
2. AIPanel 우측 collapsible drawer (≥150ms ease)
3. WorkspaceStage analyze 변경 → buildTerminalDecisionBundle → setDecisionBundle dispatch (debounce 250ms)
4. useMobile() derived (<768px)
5. mobile bottom sheet (drag handle, 60%/90% snap)
6. shortcut: H 토글 (W-0361)

**Exit**: 'decide' mode → HUD, mobile bottom sheet, shortcut 작동.

### D-3 — MultiPaneChart 이식 + 차트 UX 개선 (2.5일)

**Files**: WorkspaceStage.svelte (수정), vite.config.ts (수정 manualChunks)

**Tasks**:
1. WorkspaceStage `useMultiPane` prop, default OFF
2. dynamic import MultiPaneChart, props=series/paneIndicators
3. mode 전환 시 인스턴스 cleanup hook
4. paneIndicators shell.store 연결 (W-0304)
5. ChartSvg fallback 유지
6. **차트 UX 개선 (Charter 해제)**:
   - pane drag-resize (8px hit area)
   - pane 더블클릭 maximize/restore
   - pane별 indicator badge (좌측 상단, click → IndicatorSettingsSheet)
   - mode 전환 애니메이션 ≤200ms ease
   - multi-pane crosshair X축 동기화 (rAF throttle)
7. heap snapshot 5회 mode 전환 측정 (PR 본문)
8. LCP/CLS 측정
9. flag default ON 토글 (D-8 단계)

**Exit**: useMultiPane=ON 차트 정상, 누수 없음, CLS=0, 차트 UX 개선 5개 작동.

### D-4 — PatternLibraryPanel 이식 (0.5일)

**Files**: sections/LibrarySection.svelte (수정), sections/PatternLibraryWrap.svelte (신규)

**Tasks**:
1. LibrarySection 안 PatternLibraryWrap
2. 검색 input (debounce 200ms)
3. 필터 chip (winrate ≥ 0.55 / sample ≥ 30)
4. virtualized (svelte-virtual-list, 50+)
5. 키보드 nav (위/아래/Enter)

**Exit**: 검색/필터 동작, 100항목 60fps.

### D-5 — VerdictInboxPanel 이식 + virtualization (1.5일)

**Files**: sections/VerdictsSection.svelte (수정), sections/VerdictInboxWrap.svelte (신규)

**Tasks**:
1. VerdictsSection 안 VerdictInboxWrap
2. svelte-virtual-list 의존성 추가
3. j/k keyboard nav (W-0361 재사용)
4. watch-hit POST (Q-3 확인)
5. mobile bottom-sheet
6. 100항목 60fps 측정 (Performance.measure)

**Exit**: 60fps, j/k 동작, watch-hit 정상.

### D-6 — ★★ 4개 + Lab PineScript 골조 (1.5일)

**Files**: CommandBar.svelte (수정), modes/TradeMode.svelte (수정), TabBar.svelte (수정), AIPanel.svelte (수정), routes/lab/pinescript/+page.svelte (신규)

**Tasks**:
1. NewsFlashBar: CommandBar 상단 28px, throttle 1/3s
2. JudgePanel: TradeMode 내부
3. ScanGrid: 'scan' panel wrap (Q-6)
4. ResearchPanel: AIPanel 하단 expandable
5. 컴포넌트별 feature flag 4개
6. Lab PineScript 페이지 골조

**Exit**: 4개 정상 표시, 라우트 추가.

### D-7 — Supabase watchlist (1.5일)

**Files**: supabase/migrations/041_*.sql (신규), routes/api/watchlist/+server.ts (신규), utils/migrateWatchlist.ts (신규), WatchlistRail.svelte (수정), tests/cogochi/watchlist-migration.test.ts (신규)

**Tasks**:
1. migration 041 + RLS + index + down
2. API GET/PATCH atomic transaction
3. migrateWatchlist (offline-first, 멱등)
4. WatchlistRail optimistic, 실패 rollback + toast
5. RLS 401 → silent localStorage (Q-5)
6. 디바이스 2개 동기 테스트

**Exit**: migration apply, 동기화, offline fallback.

### D-8 — Perf QA + Mobile QA + 머지 정리 (1일)

**Tasks**:
1. bundle analyzer baseline vs after, +30% 이내 (PR 본문)
2. Web Vitals p50/p75 표 첨부
3. Mobile QA (iOS Safari, Android Chrome): safe-area-inset / 44px / drag handle
4. shortcut 충돌 검증 (B/Esc/slash/Cmd+K + j/k + H)
5. useMultiPane default ON 토글
6. CURRENT.md SHA 갱신
7. work item completed 이동

**Exit**: 모든 AC 통과.

---

## 7. Exit Criteria

| AC | 기준 | 측정 |
|---|---|---|
| AC1 | ★★★ 4개 이식 (DecisionHUD/MultiPaneChart/PatternLibraryPanel/VerdictInboxPanel) | 시각 + DOM grep |
| AC2 | ★★ 4개 이식 (NewsFlashBar/JudgePanel/ScanGrid/ResearchPanel) | 시각 |
| AC3 | shell.store 'decide' 모드, 회귀 0건 | vitest 1955+ pass |
| AC4 | lightweight-charts 메모리 누수 0 (5회 mode 전환, heap delta ≤ 5%) | DevTools / Playwright metrics |
| AC5 | LCP ≤ 2.5s p75 (/cogochi) | @web-vitals |
| AC6 | CLS = 0 (차트 swap) | @web-vitals |
| AC7 | INP ≤ 200ms (HUD 토글, j/k) | @web-vitals |
| AC8 | Bundle size +30% 이내 | Vite analyzer |
| AC9 | VerdictInboxPanel 100항목 60fps | Performance.measure |
| AC10 | Supabase 041 deploy + RLS + down script | supabase migration list |
| AC11 | WatchlistRail 디바이스 2개 5초 이내 sync | manual |
| AC12 | Mobile WatchlistRail SymbolPickerSheet | manual + Playwright |
| AC13 | Mobile DecisionHUD bottom sheet | manual |
| AC14 | j/k VerdictInbox 동작, shortcut 충돌 0건 | manual + 자동 |
| AC15 | typecheck pass / vitest pass / CI green | CI |
| AC16 | PR 7개 atomic merge (D-1~D-7) | gh pr list |
| AC17 | 차트 UX 개선 5개 작동 (drag-resize / 더블클릭 / indicator badge / 애니메이션 / crosshair sync) | manual |
| AC18 | CURRENT.md SHA 갱신 + W-0372 completed 이동 | git log |

---

## 8. Owner

`app` (cogochi 라우트 + lib/terminal 공유 컴포넌트)

---

## 9. Facts (실측)

```
shell.store.ts                  597 lines
AppShell.svelte                 466 lines
WorkspaceStage.svelte           415 lines
DecisionHUD.svelte              544 lines
MultiPaneChart.svelte           548 lines
VerdictInboxPanel.svelte        601 lines
PatternLibraryPanel.svelte      100 lines
LibrarySection.svelte           115 lines (교체)
VerdictsSection.svelte          140 lines (교체)

panelAdapter exports:
  PanelViewModel, PanelHeaderModel,
  buildTerminalDecisionBundle,
  rerankEvidenceWithMemory,
  buildPatternRecallMatches

ChartSeriesPayload from $lib/api/terminalBackend
paneIndicators from $lib/chart/paneIndicators (W-0304)

ShellWorkMode current: 'observe' | 'analyze' | 'execute'
WorkspacePanelId: 'analyze' | 'scan' | 'judge'
WorkspaceStageMode: 'single' | 'split-2' | 'grid-4'

Migration latest: 040_add_dlq_backtest_missing.sql
Next migration:   041

Sections: LibrarySection, RulesSection, SectionHeader, VerdictsSection
Modes:    RadialTopology, TradeMode, TrainMode

지원 인프라 (이미 머지):
  bb746491  W-0331 LiveDecisionHUD canonical path
  d6f47ee1  W-0356 cogochi 3-column always-visible
  feed5be7  W-0361 keyboard shortcuts B/Esc/slash/Cmd+K
  09042146  W-0363/W-0364 perf hardening + bundle analyzer
```

---

## 10. Canonical Files

### 신규
```
app/src/lib/cogochi/sections/PatternLibraryWrap.svelte
app/src/lib/cogochi/sections/VerdictInboxWrap.svelte
app/src/lib/cogochi/modes/DecideMode.svelte
app/src/lib/cogochi/utils/useMobile.ts
app/src/lib/cogochi/utils/migrateWatchlist.ts
app/src/routes/api/watchlist/+server.ts
app/src/routes/lab/pinescript/+page.svelte
supabase/migrations/041_user_watchlist.sql
supabase/migrations/041_user_watchlist_down.sql
app/tests/cogochi/decide-mode.test.ts
app/tests/cogochi/watchlist-migration.test.ts
```

### 수정
```
app/src/lib/cogochi/shell.store.ts
app/src/lib/cogochi/AppShell.svelte
app/src/lib/cogochi/WorkspaceStage.svelte
app/src/lib/cogochi/AIPanel.svelte
app/src/lib/cogochi/CommandBar.svelte
app/src/lib/cogochi/TabBar.svelte
app/src/lib/cogochi/WatchlistRail.svelte
app/src/lib/cogochi/MobileBottomNav.svelte
app/src/lib/cogochi/sections/LibrarySection.svelte
app/src/lib/cogochi/sections/VerdictsSection.svelte
app/src/lib/cogochi/modes/TradeMode.svelte
app/src/routes/cogochi/+page.svelte
vite.config.ts
work/active/CURRENT.md
```

### 보존 (절대 삭제 금지)
```
app/src/lib/terminal/DecisionHUD.svelte
app/src/lib/terminal/MultiPaneChart.svelte
app/src/lib/terminal/PatternLibraryPanel.svelte
app/src/lib/terminal/VerdictInboxPanel.svelte
app/src/lib/terminal/NewsFlashBar.svelte
app/src/lib/terminal/JudgePanel.svelte
app/src/lib/terminal/ScanGrid.svelte
app/src/lib/terminal/ResearchPanel.svelte
app/src/lib/terminal/panelAdapter.ts
app/src/lib/chart/paneIndicators.ts
app/src/lib/api/terminalBackend.ts
app/src/routes/terminal/+page.svelte
```

---

## 11. Assumptions

- Phase C PR #830 머지 완료된 main에서 시작
- 차트 Frozen 해제 (CHARTER 2026-05-01) 적용
- W-0364 perf 인프라 (@web-vitals, bundle analyzer) 활용 가능
- panelAdapter 안정 (W-0331 이후)
- W-0304 paneIndicators 키 스키마 안정
- W-0361 keyboard shortcut `registerShortcut` API 안정
- terminal/* 컴포넌트 props가 cogochi에서 동작 (글로벌 :root 의존 없음 — 실측 후 확정)
- Mobile 분기는 viewport width 기준만

---

## 12. Handoff Checklist

- [ ] D-1 store 확장 PR (1일)
- [ ] D-2 DecisionHUD 이식 + lazy + mobile bottom sheet PR (1.5일)
- [ ] D-3 MultiPaneChart + 차트 UX 개선 5개 PR (2.5일) — heap snapshot 첨부
- [ ] D-4 PatternLibraryPanel 이식 PR (0.5일)
- [ ] D-5 VerdictInboxPanel 이식 + virtualization + j/k PR (1.5일) — 60fps 측정
- [ ] D-6 ★★ 4개 + Lab PineScript 골조 PR (1.5일)
- [ ] D-7 Supabase 041 + API + migration 로직 PR (1.5일) — RLS + down
- [ ] D-8 Perf QA + Mobile QA + flag flip + CURRENT.md (1일)
- [ ] W-0372 completed 이동 + memory 세션 노트

---

## 13. 후속 (Phase D 이후)

- DrawingCanvas / F60GateBar (★ 후속 W)
- lib/terminal/* 재배치 (cogochi/ 또는 shared/)
- PineScript 백테스트 endpoint (별도 W)
- 사용자별 feature flag (Supabase user_settings)
- Memory profiling 자동화 (Playwright + heap CI)
- volume profile overlay, price alert 마커, replay (차트 후속)
