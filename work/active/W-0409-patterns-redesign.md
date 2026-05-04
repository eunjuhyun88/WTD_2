# W-0409 — Patterns 페이지 재설계

## Status

- Phase: 설계 완료, 결정 락 완료, 구현 대기
- Owner: ej
- Priority: P1
- Created: 2026-05-05
- Depends on: W-0407 (Terminal — drill-through 목적지), W-0408 (Dashboard — 흡수/이동 협의)
- Branch: TBD

## Why

`/patterns` 는 **5탭 중 4탭이 빈 placeholder 스텁**. 동시에
`/strategies`, `/benchmark` 는 **별개 route 로 완전 구현됨**. 즉 같은 기능이
두 곳에 쪼개져 있고 한쪽은 dead. `/formula` 도 완전 구현됐지만 탭 nav 에
없고 tertiary 링크로만 접근 가능. 모바일에서 필터/inbox 가 단순
`display:none` (drawer 없음). orphan 컴포넌트 4개. 이 시점에 IA 재정렬
필수.

## Goals

1. **5탭 모두 실제 기능 보유** — 빈 스텁 0
2. **`/strategies`, `/benchmark` 흡수** — Patterns 탭으로 통합, 별개 route 는 redirect
3. **`/formula` 노출** — 탭 또는 [slug] 페이지에 통합
4. **Detail 탭 wiring** — 카드 클릭 → 우측 rail Detail 표시 (현재 dead)
5. **Orphan 처리** — `CopyTradingLeaderboard`, `IndicatorFilterPanel`,
   `PatternCard`(import 만), `patternCaptureContext` 4개 mount or delete
6. **모바일 drawer** — 필터/inbox display:none → slide-in drawer

## Non-Goals

- ML 학습 트리거 UI (Lab 영역)
- Pattern 정의 편집 UI (현재 spec 외, 별도 W item)
- copy-trading 풀 기능 (Leaderboard mount 만, 나머지는 W-0411 Settings 와 함께)

---

## A. 현재 구조 audit (실측)

### A1. 탭 인벤토리

| 탭 | URL | 상태 | 비고 |
|----|-----|------|------|
| Library | `/patterns` (default) | ✅ 구현 | 후보/states/transitions/scan |
| Benchmark | `?tab=benchmark` | ❌ **빈 스텁** | 한편 `/benchmark` route 는 풀구현 |
| Lifecycle | `?tab=lifecycle` | ❌ **빈 스텁** | [slug] PatternLifecycleCard 만 존재 |
| Search | `?tab=search` | ❌ **빈 스텁** | search infra 자체 없음 |
| Strategies | `?tab=strategies` | ❌ **빈 스텁** | 한편 `/strategies` route 는 풀구현 |

### A2. 별개 route (탭과 분리됨)

| Route | 상태 | 처리 |
|-------|------|------|
| `/strategies` | 풀구현 (StrategyGrid + backtest stats batch=8 parallel) | **Strategies 탭으로 흡수** |
| `/benchmark` | 풀구현 (BenchmarkChart + multi-slug 5개 비교 + BTC curve) | **Benchmark 탭으로 흡수** |
| `/patterns/formula` | 풀구현 (formula dump + suspect → /lab 링크) | **Library [slug] detail 통합 또는 신규 탭** |
| `/patterns/[slug]` | 풀구현 (PatternLifecycleCard + Stats + EquityCurve + History + states + transitions) | **유지**, [slug]/lifecycle 데이터를 Lifecycle 탭이 빌려옴 |
| `/patterns/{benchmark,lifecycle,search,strategies}/+page.server.ts` | 모두 301 → `/patterns?tab=X` (empty stub 반환) | **유지** (탭 구현 후 자연 정상화) |

### A3. API/store 의존성

**Server-side (engineFetch):**
- `/patterns/candidates`, `/patterns/states`, `/patterns/stats/all`,
  `/patterns/transitions?limit=30`, `/patterns/{slug}/pnl-stats`

**Client-side:**
- `POST /api/patterns/scan` (Library)
- `GET /api/patterns`, `/api/patterns/states`, `/api/patterns/transitions` (Library refresh)
- `POST /api/captures` (Save Setup)
- `GET /api/captures/outcomes` + `POST /api/captures/{id}/verdict` (VerdictInboxSection)
- `GET /api/patterns/{slug}/formula` (formula page)
- `PATCH /api/patterns/{slug}/lifecycle` ([slug])
- `GET /api/research/indicator-features` (IndicatorFilterPanel — orphan)
- `GET /api/copy-trading/leaderboard?limit=20` (CopyTradingLeaderboard — orphan)
- `POST/DELETE /api/copy-trading/subscribe` (orphan)

**Strategy backend (`$lib/api/strategyBackend`):**
- `fetchAllPatternObjects()`, `fetchPatternBacktest(slug)` (`/strategies`, `/benchmark`)

**Stores:**
- `patternCaptureContext` — orphan, 어디서도 import 안 됨
- patterns route 가 직접 구독하는 store 0

### A4. 발견된 이슈

| # | 이슈 | 처리 |
|---|------|------|
| 1 | 4탭 빈 스텁 | 콘텐츠 채우기 (G 섹션) |
| 2 | `/strategies`, `/benchmark` 분리 | Strategies/Benchmark 탭으로 흡수 후 redirect |
| 3 | `/formula` tab nav 부재 | Library [slug] detail 안 통합 |
| 4 | PatternsRightRail "Detail" 탭 dead | 카드 클릭 → 선택 store wiring |
| 5 | `PatternCard` import 만, render X | render or import 제거 |
| 6 | `CopyTradingLeaderboard` orphan | Strategies 탭 안 mount (JUDGE 영역) |
| 7 | `IndicatorFilterPanel` orphan | Library 좌측 필터 컬럼에 mount |
| 8 | `patternCaptureContext` orphan | 사용처 결정 or 삭제 |
| 9 | 모바일 ≤1024px 필터/rail `display:none` | slide-in drawer |
| 10 | hubs/patterns/index.ts 빈 stub ("W-0382-B TBD") | 이번 W-0409 가 그 W-0382-B 자리 |

### A5. Cross-page reuse

- `VerdictInboxSection` — `/dashboard` (W-0408 에서 unmount 결정) + `/patterns` (rail). W-0409 후 patterns 단독 owner.
- `PatternLifecycleCard`, `PromoteConfirmModal` — `[slug]` 만
- `TransitionRow` — Library
- `PhaseBadge` — `components/patterns/` 와 `shared/chart/overlays/` 두 곳 (chart overlay 용 별개)
- `PatternLibraryPanel` — Terminal hub (`PatternLibraryPanelAdapter` 경유)

### A6. 외부 링크

**Inbound:** `AppNavRail`, `MobileBottomNav`, `AppSurfaceHeader`,
`SiteFooter`, `appSurfaces.ts`, `/agent` "패턴 보기", `/dashboard` "전체보기 →".

**Outbound:** `/cogochi?symbol=X`, `/cogochi`, `/patterns/formula?slug=...`,
`/patterns?tab=lifecycle`, `/lab?slug=&candidate=`, `/patterns` (back).

---

## B. 재설계 IA

### B1. 5탭 콘텐츠 정의

```
┌────────── /patterns ──────────┐
│  Library | Search | Lifecycle | Benchmark | Strategies     │
│                                                            │
│  [좌 200px] 필터 | [중앙 grid] | [우 320px] Right Rail     │
│   - Phase 필터                  - Detail 탭 (선택 패턴)   │
│   - Indicator 필터 (M7)         - Inbox 탭 (Verdict)      │
│   - Lifecycle status 필터                                  │
└────────────────────────────────────────────────────────────┘
```

### B2. 탭별 contract

#### Library (default)
- 현재 그대로 + 카드 클릭 시 우측 Detail rail 활성화
- `IndicatorFilterPanel` 좌측 필터 컬럼에 mount (M7 해결)
- `PatternCard` 실제 render 또는 inline div 유지하면 import 삭제 (구현 시 결정)

#### Search (신규)
- 패턴 이름/슬러그/phase/indicator 풀텍스트 검색
- 데이터: `/api/patterns/states` + `/api/patterns/candidates` 클라이언트 필터
- 결과 = Library 카드 그리드와 동일 컴포넌트 재사용
- 별도 search infra 신설하지 않고, 좌측 필터 + 검색창 UI 만 강화 (단순)

#### Lifecycle (신규)
- 모든 패턴의 lifecycle 상태 보드 (draft / candidate / object / archived)
- 컬럼별 패턴 카드 그리드 (kanban 스타일, 드래그 X — 클릭 → [slug] 이동)
- 데이터: `/api/patterns/states` + `/api/patterns/{slug}/lifecycle` (배치)
- Promote/Archive 액션은 [slug] 페이지에서만 (실수 방지)
- 우측 rail: 선택 패턴의 lifecycle 히스토리 (있으면)

#### Benchmark (이전: `/benchmark` 흡수)
- 현재 `/benchmark/+page.svelte` 의 BenchmarkChart + 5-슬러그 멀티 비교 + BTC curve 그대로 흡수
- `fetchAllPatternObjects` + `fetchPatternBacktest` 그대로 사용
- `/benchmark` route 는 `redirect 301 → /patterns?tab=benchmark` 로 변경

#### Strategies (이전: `/strategies` 흡수)
- 현재 `/strategies/+page.svelte` 의 StrategyGrid + parallel batch=8 그대로 흡수
- 정렬 (sharpe / apr / win_rate / n_signals) 보존
- `CopyTradingLeaderboard` 우측 rail 또는 하단 1줄 mount (M6 해결)
- `/strategies` route 는 `redirect 301 → /patterns?tab=strategies` 로 변경

### B3. [slug] 페이지

- 현재 8 섹션 유지 + **Formula 섹션 추가** (현 `/patterns/formula?slug=X` 흡수)
- `/patterns/formula` 는 redirect 또는 `[slug]?section=formula` 앵커로 변경
- "Open in Lab" 링크 보존 (suspect → `/lab?slug&candidate`)

### B4. 우측 rail (PatternsRightRail)

- **Detail 탭 wiring** — Library/Search 에서 카드 클릭 시 선택 패턴 store 업데이트 → rail 의 Detail 탭이 그 패턴의 mini stats + "전체보기 → /patterns/[slug]" 표시
- Inbox 탭 — VerdictInboxSection 그대로

### B5. 모바일 (≤1024px)

- 좌측 필터 컬럼 → 좌측 slide-in drawer (햄버거 아이콘)
- 우측 rail → 우측 slide-in drawer (Inbox 아이콘)
- 탭 nav 가로 스크롤 유지

---

## C. 컴포넌트 disposition

| 현재 | 처리 |
|---|---|
| `routes/patterns/_tabs/Library.svelte` | **유지** + IndicatorFilterPanel mount + 카드 클릭 wiring |
| `routes/patterns/[slug]/+page.svelte` | **유지** + Formula 섹션 추가 |
| `routes/patterns/formula/+page.svelte` | **삭제 또는 redirect** ([slug] 흡수) |
| `routes/strategies/+page.svelte` | **이동** → `_tabs/Strategies.svelte` |
| `routes/benchmark/+page.svelte` | **이동** → `_tabs/Benchmark.svelte` |
| `routes/strategies/+page.server.ts` | redirect 로 교체 |
| `routes/benchmark/+page.server.ts` | redirect 로 교체 |
| `components/patterns/PatternCard.svelte` | **render 활성화 또는 import 제거** (구현 시) |
| `components/patterns/IndicatorFilterPanel.svelte` | **mount** in Library 좌 필터 |
| `components/patterns/VerdictInboxSection.svelte` | **유지** (rail Inbox 탭) |
| `components/patterns/{Lifecycle,Stats,EquityCurve,TradeHistory,PhaseBadge,Promote,TransitionRow}` | **유지** |
| `hubs/patterns/panels/CopyTradingLeaderboard.svelte` | **mount** in Strategies 탭 (rail 또는 하단) |
| `hubs/patterns/index.ts` (빈 stub) | 신규 export 추가 (Search, Lifecycle, Benchmark, Strategies tab) |
| `lib/strategy/StrategyGrid.svelte` | **유지** (Strategies 탭 사용) |
| `lib/strategy/BenchmarkChart.svelte` | **유지** (Benchmark 탭 사용) |
| `stores/patternCaptureContext.ts` | **삭제** (사용처 발견 안 됨) |

### 신규 컴포넌트

- `routes/patterns/_tabs/Search.svelte`
- `routes/patterns/_tabs/Lifecycle.svelte`
- `routes/patterns/_tabs/Benchmark.svelte` (이동)
- `routes/patterns/_tabs/Strategies.svelte` (이동)
- `stores/selectedPatternStore.ts` (Detail rail 선택 wiring)

---

## D. 결정 (락 — 사용자 위임)

| # | 결정 | 락 | 이유 |
|---|------|---|------|
| D1 | `/strategies`, `/benchmark` 처리 | **흡수 + 301 redirect** | 사용자가 `/patterns` 한 곳에서 다 보는 게 자연스러움 |
| D2 | `/patterns/formula` 처리 | **[slug] 페이지에 섹션 통합 + redirect** | tertiary 링크보다 자연스러운 위치 |
| D3 | Search 탭 구현 | **클라이언트 필터 (별도 search infra X)** | 현재 패턴 수 적음, 풀텍스트 search 과잉 |
| D4 | Lifecycle 탭 형태 | **Kanban 스타일 4컬럼** | 상태 한눈에, 드래그 X (실수 방지) |
| D5 | CopyTradingLeaderboard 위치 | **Strategies 탭 하단 1줄** | JUDGE/copy 는 strategy 와 의미 인접 |
| D6 | IndicatorFilterPanel 위치 | **Library 좌측 필터 컬럼** | 원래 의도에 맞음 |
| D7 | 모바일 drawer 구현 | **slide-in (좌 필터, 우 rail)** | 단순 display:none → drawer 가 표준 |
| D8 | `PatternCard` import 처리 | **render 활성화 (inline div 제거)** | 컴포넌트 재사용성 + 일관성 |
| D9 | `patternCaptureContext` store | **삭제** | 1년+ orphan, capture 로직은 capture store 에 있음 |
| D10 | Library 카드 클릭 동작 | **rail Detail 활성 + 더블클릭 시 [slug]** | 정보 미리보기 → 상세 진입 2단계 |

---

## E. 구현 PR 분기 (6 PR)

### PR1 — 탭 골격 + Strategies/Benchmark 흡수
- `_tabs/Strategies.svelte`, `_tabs/Benchmark.svelte` 신규 (기존 route 코드 이동)
- `/strategies`, `/benchmark` route → 301 redirect 로 교체
- Library `?tab=strategies|benchmark` placeholder → 새 컴포넌트 마운트
- AC: `/patterns?tab=strategies` 와 `?tab=benchmark` 가 실제 콘텐츠 표시

### PR2 — Search 탭
- `_tabs/Search.svelte` 신규 (검색창 + 클라이언트 필터)
- 결과는 Library 카드 그리드 컴포넌트 재사용
- AC: 패턴명/phase/indicator 검색 가능

### PR3 — Lifecycle 탭
- `_tabs/Lifecycle.svelte` 신규 (Kanban 4컬럼)
- 데이터: `/api/patterns/states` + lifecycle 상태 배치 fetch
- AC: 모든 패턴이 상태별 컬럼에 표시, 클릭 → `/patterns/[slug]`

### PR4 — Detail rail wiring + IndicatorFilterPanel + PatternCard
- `selectedPatternStore` 신규
- Library 카드 클릭 → store 업데이트 → rail Detail 탭 표시
- IndicatorFilterPanel Library 좌 컬럼 mount
- `PatternCard` 실제 render 활성화
- AC: A4 #4 #5 #7 해결

### PR5 — [slug] Formula 통합 + CopyTradingLeaderboard mount
- [slug] 페이지에 Formula 섹션 추가 (formula API 호출)
- `/patterns/formula` → `[slug]?section=formula#formula` redirect
- CopyTradingLeaderboard Strategies 탭 하단 mount
- `patternCaptureContext` store 삭제
- AC: A4 #3 #6 #8 해결

### PR6 — 모바일 drawer
- 좌측 필터 drawer + 우측 rail drawer (slide-in)
- 햄버거 + 인박스 트리거
- AC: ≤1024px 에서 필터/inbox 접근 가능

---

## F. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | 5탭 모두 실제 콘텐츠 (빈 스텁 0) |
| AC2 | `/strategies`, `/benchmark` 호출 시 `/patterns?tab=...` redirect |
| AC3 | `/patterns/formula` redirect 정상 |
| AC4 | Library 카드 클릭 → rail Detail 활성 |
| AC5 | `IndicatorFilterPanel`, `CopyTradingLeaderboard`, `PatternCard` 모두 mount or 명시적 삭제 |
| AC6 | `patternCaptureContext` 삭제, dead store 0 |
| AC7 | ≤1024px 모바일 drawer 정상 동작 |
| AC8 | Contract CI 통과 (work item file 등록) |

---

## G. 보존 필수

| # | 항목 | 이유 |
|---|------|------|
| P1 | [slug] 의 4 parallel `engineFetch` + AbortSignal.timeout | resilience |
| P2 | Strategies BATCH=8 parallel backtest fetch | proxy 보호 |
| P3 | Benchmark MAX_SELECT=5 슬러그 제한 | UI/perf |
| P4 | `lifecycleApi` PATCH 가드 (PromoteConfirmModal) | 실수 방지 |
| P5 | VerdictInboxSection 컴포넌트 (W-0408 dashboard 에서 unmount, patterns 가 단독 owner) | dashboard 제거 후 patterns 만 사용 |
| P6 | PhaseBadge `components/patterns/` 와 `shared/chart/overlays/` 분리 유지 | chart overlay 용 별개 |

---

## H. Risks

| Risk | 완화 |
|------|------|
| `/strategies`, `/benchmark` 구버전 외부 링크 | 301 redirect 로 SEO 보존 |
| `/patterns/formula` slug 파라미터 보존 | redirect 시 `?slug=` → `[slug]` path 매핑 |
| Lifecycle Kanban 모바일 좁음 | 모바일은 컬럼별 가로 스크롤 |
| selectedPatternStore 가 다른 페이지로 leak | scope 명확히 (patterns 범위만) |
| W-0408 의 VerdictInboxSection unmount 가 PR 머지 순서 의존 | W-0408 PR2 + W-0409 PR1 순서 정의 (W-0409 가 늦게 머지) |

---

## I. 다음 단계

1. ~~결정 락~~ ✅ 완료 (D1~D10)
2. W-0410 (Lab) 설계
3. W-0411 (Settings) 설계
4. 5개 페이지 통합 검토 → 구현 시작
