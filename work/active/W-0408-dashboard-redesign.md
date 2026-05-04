# W-0408 — Dashboard "My Workspace" 재설계

## Status

- Phase: 설계 완료, 구현 대기
- Owner: ej
- Priority: P1
- Created: 2026-05-05
- Depends on: W-0407 (Terminal redesign — Dashboard CTA 목적지)
- Branch: TBD (구현 PR 시점)

## Why

W-0395 Phase 2 (3-zone redesign, #974) + W-0402 PR12 (Hero zone)
이후 dashboard 가 누적 패치로 자란 결과 13개 dead/misnamed wiring,
2중 verdict inbox, 모바일 반응형 누락이 쌓여있다. Terminal 재설계
(W-0407) 가 진행되며 Dashboard ↔ Terminal CTA 계약을 다시 봐야 하므로
이 시점에 Dashboard 도 한 번 정리한다.

## Goals

1. **단일 진실원칙** — 같은 데이터(verdict pending, opportunity 리스트, passport
   tier, streak)를 한 곳에서만 보여준다. 중복 inbox/card 제거.
2. **모든 row 는 drill-through** — Watching/Scanner/Verdict/Pattern row 클릭 시
   적절한 페이지로 점프 (현재 절반은 dead).
3. **Dead wiring 0** — `/api/dashboard/wvpl`, `WVPLCard`, `lastSyncAt`,
   `Max DD`, "Day P&L"=winRate 라벨 모두 처리 (마운트 or 삭제).
4. **모바일 우선** — 모든 strip/grid 가 ≤ 640px 에서 무너지지 않게.
5. **Terminal 게이트** — Dashboard 의 모든 "분석하기" CTA 가 Terminal 의
   탭 시스템(W-0407 H 섹션)에 새 탭으로 열리도록 contract 정의.

## Non-Goals

- 새 KPI/지표 추가 (현재 노출 항목 정리만).
- Verdict 입력 UX 본격 개편 (Verdict 페이지 자체는 별도 설계).
- 모바일 풀 리디자인 (`MobileFooter` 와의 통합은 W-0411 Settings 와 함께).

---

## A. 현재 구조 audit (실측)

### A1. Zone 인벤토리 (top-down)

| # | 영역 | 컴포넌트 | 데이터 출처 | 상태 |
|---|------|---------|-------------|------|
| 1 | Fixed Header / Workbar | `dashboard-workbar` (inline) | priceStore, allStrategies, KimchiPremiumBadge | OK |
| 2 | AlertStrip | `hubs/dashboard/AlertStrip.svelte` | `/api/market/indicator-context`(BTC,ETH 30s), kimchi 30s | OK |
| 3 | Zone A — 오늘의 기회 | `hubs/dashboard/OpportunityCard.svelte` × 3 | SSR `/opportunity/run` | 모바일 미반응 |
| 4 | Zone B — Stats | `hubs/dashboard/StatsZone.svelte` | SSR f60-status + passport | OK |
| 5 | Zone C — System | `hubs/dashboard/SystemStatusZone.svelte` | SSR flywheel/health | `lastSyncAt` dead prop |
| 6 | F60ProgressCard | `components/dashboard/F60ProgressCard` | `/api/layer_c/progress` | OK |
| 7 | Portfolio Strip | inline | passport.winRate(라벨오류) | Day P&L 오라벨, MaxDD dead |
| 8 | KPI Strip | inline | watching+pending+passport | Hero 와 중복 (Verdicts 카드) |
| 9 | Trader Split Row | inline (Watching/Scanner) | `/api/captures?watching=true` 30s + SSR opp | row 클릭 dead |
| 10 | Hero Streak | inline + `StreakBadgeCard` | streakSnapshot store | OK |
| 11 | Hero sub-row Wallet | inline | walletStore | OK |
| 12 | Hero sub-row Tier | inline | passport | OK |
| 13 | Hero sub-row Verdicts | inline | pendingVerdicts (SSR) | KPI Strip 과 중복 |
| 14 | VerdictInboxSection | inline | `/api/captures/outcomes` | DashActivityGrid 과 중복 |
| 15 | DashActivityGrid Top Movers | inline | SSR opp | OK |
| 16 | DashActivityGrid Pending Verdicts | inline | SSR pendingVerdicts | VerdictInboxSection 과 중복 |
| 17 | DashActivityGrid Today's Patterns | inline | watching captures (client) | OK |

### A2. API/store 의존성

**SSR (engine):**
- `GET /captures?user_id&status=outcome_ready&limit=50` → pendingVerdicts
- `GET /observability/flywheel/health` → flywheelHealth
- `POST /opportunity/run {limit:10,user_id}` → topOpportunities + macroBackdrop
- `GET /users/{id}/f60-status` → userStats

**Client polling:**
- `/api/profile/passport` (1회)
- `/api/profile/streak` (30s, hidden 시 정지)
- `/api/captures?watching=true&limit=8` (30s)
- `/api/captures/outcomes?status=outcome_ready&limit=100` (1회 + manual refresh)
- `/api/layer_c/progress` (1회)
- `/api/market/indicator-context?symbol=BTCUSDT|ETHUSDT` (30s × 2)
- `/api/market/kimchi-premium` (30s + 5min Badge)

**Mutation:**
- `POST /api/captures/{id}/verdict` — 두 곳에서 호출 (verdict label set 다름)
- `walletStore.openWalletModal()`

**Dead endpoint (구현됐으나 미사용):**
- `GET /api/dashboard/wvpl?weeks=N`
- `components/dashboard/WVPLCard.svelte`

### A3. 발견된 이슈 (13)

| # | 이슈 | 영역 | 처리 |
|---|------|------|------|
| 1 | `/api/dashboard/wvpl` 호출 0 | API | **결정 필요** mount or delete |
| 2 | `WVPLCard` orphan | Component | 위 결정과 동일 |
| 3 | "Day P&L" = winRate 라벨 오류 | Portfolio Strip | 삭제 (Strip 자체 제거) |
| 4 | "Max DD" 하드코딩 "—" | Portfolio Strip | 삭제 |
| 5 | Verdict inbox 2중 (Section + DashActivityGrid) | UX | DashActivityGrid 단일화 |
| 6 | verdict label set 불일치 (`missed` vs `near_miss`) | API | 단일 enum 통일 (engine 검사) |
| 7 | `SystemStatusZone.lastSyncAt` 미공급 | Prop | 데이터 wire or prop 삭제 |
| 8 | KPI Strip ↔ Hero Verdicts 카드 중복 | UX | KPI Strip 삭제 |
| 9 | OpportunityCard 3-col 모바일 미대응 | CSS | ≤640px stack |
| 10 | Trader Split Row 모바일 미대응 | CSS | ≤768px stack |
| 11 | Watching pane row click dead | UX | `/cogochi?capture=ID` 새 탭 |
| 12 | Scanner pane row click dead | UX | `/cogochi?symbol=X&tf=4h` 새 탭 |
| 13 | `track('dashboard_view')` streak=0 race | Analytics | passport await 후 fire |

### A4. 페이지 간 링크 (실측)

**Outbound:** `/cogochi`(3 입구), `/cogochi?symbol&tf`, `/cogochi?capture`, `/lab`(2),
`/passport`(2), `/patterns/search`(1).

**Inbound:** `MobileFooter`, `appSurfaces.ts`, `verdict/*`, `passport`,
`settings/passport`, `propfirm/+page.server.ts`(redirect target), `deepLinks.ts`.

**미링크:** `/settings`, `/agent`, `/research/*`. Dashboard 에서 진입 불가.

---

## B. 재설계 IA (목표 구조)

### B1. Top → Bottom 6 Zone

```
[ Header ]                                ← 고정, 핵심 CTA + live BTC/Kimchi
[ AlertStrip ]                            ← 조건부 (mute 48h)
[ Hero — Streak + Wallet + Tier ]         ← 1행, 3 sub-card (모바일 stack)
[ Today — Opportunity + Watching ]        ← 2-col grid (≤768px stack)
                                            L: 오늘의 기회 (top 3 카드)
                                            R: Watching captures (max 6, row click 활성)
[ Verdict Queue ]                         ← 단일 inbox (DashActivityGrid 흡수)
                                            Pending + Outcome ready 통합
[ System & Progress ]                     ← 1행 3-card
                                            F-60 progress | Scanner status | Macro regime
```

기존 17 영역 → **6 영역**으로 축약. KPI Strip / Portfolio Strip / 별도
VerdictInboxSection / Hero Verdicts sub-card / Top Movers col 모두 흡수 또는 삭제.

### B2. 영역별 contract

#### Header
- 좌: "My Workspace" + sub
- 우: BTC 가격 pill, Kimchi badge, **[Open Terminal]** primary, **[Open Lab]** secondary
- 모바일(≤640px): title 풀폭, CTA 2개 50/50 split, pill 은 wrap

#### AlertStrip
- 변경 없음. 단 mute 키 `alerts.muted` 유지, 48h TTL.

#### Hero (3 sub-card)
- **Streak card**: 큰 streak_days 숫자 + StreakBadgeCard 5tier + "Passport →"
- **Wallet card**: connected/unconnected 상태 + Connect CTA
- **Tier card**: passport tier chip + winRate + LP + verdicts pending count
  → **Verdicts pending 을 Tier 카드에 흡수** (별도 sub-card 삭제)
- 모바일(≤768px): 3 sub stack

#### Today (2-col)
- **L: 오늘의 기회** — top 3 OpportunityCard. 카드 클릭 → Terminal 새 탭.
  "전체보기 →" 링크 → `/patterns/search`. top0 면 zone 자체 hide.
- **R: Watching** — watching captures top 6 (현재 Trader Split Row 의 좌측).
  row 클릭 → Terminal 새 탭 (`?capture=ID`). top0 면 "Open Terminal" 빈상태.
- 모바일(≤768px): L → R stack

#### Verdict Queue (단일 inbox)
- DashActivityGrid 의 col2 (Pending) + col3 (Today's Patterns) +
  VerdictInboxSection 을 **하나의 Verdict Queue** 로 통합.
- 카드 그리드, `auto-fill minmax(300px, 1fr)`.
- 카드 = capture (pending or outcome_ready). 상태 chip 으로 구분.
- 액션: Valid / Invalid / Near-miss (단일 enum 통일).
- "+ N more in Lab" overflow → `/lab`.
- 모바일: 1-col.

#### System & Progress (3-card)
- **F-60 ProgressCard** (현재 컴포넌트 재사용)
- **Scanner / System status** — SystemStatusZone 재사용 +
  `lastSyncAt` 데이터 wire (engine flywheel/health 의 `last_sync_at`).
- **Macro regime card** — 기존 DashActivityGrid Top Movers 의 macro chip 을 카드화.
  risk-on/off/neutral + 1줄 reason. 클릭 → `/research/macro` (W-0410 Patterns 와 함께
  결정). 미정시 정적 카드.
- 모바일(≤900px): 3 → 1 stack.

### B3. Drill-through 계약 (W-0407 Terminal 와 동기)

| Source row/click | Target (Terminal) | Tab seed |
|------------------|-------------------|----------|
| OpportunityCard "분석하기 →" | `/cogochi?symbol=X&tf=4h&from=dash_opp` | symbol+tf 새 탭 |
| Watching row click | `/cogochi?capture=ID&from=dash_watch` | capture-context 탭 |
| Scanner row (Macro card 내) | (해당 안 함, Macro 는 research 로) | — |
| Verdict Queue 카드 클릭 (액션 외 영역) | `/cogochi?capture=ID&from=dash_verdict` | capture-context 탭 |
| Header "Open Terminal" | `/cogochi` | 마지막 활성 탭 |

`from=` query 는 analytics tracking용. Terminal `+page.server.ts` 가 받아
`track('terminal_open', {from})` 발화.

---

## C. 컴포넌트 disposition

| 현재 컴포넌트 | 처리 | 비고 |
|---|---|---|
| `hubs/dashboard/AlertStrip.svelte` | **유지** | 변경 없음 |
| `hubs/dashboard/OpportunityCard.svelte` | **유지** + 모바일 CSS | grid 반응형 |
| `hubs/dashboard/StatsZone.svelte` | **삭제** | F-60 ProgressCard + Tier 카드로 흡수 |
| `hubs/dashboard/SystemStatusZone.svelte` | **유지** + lastSyncAt wire | 데이터 공급 |
| `components/dashboard/F60ProgressCard` | **유지** | |
| `components/dashboard/StreakBadgeCard` | **유지** | Hero Streak 안 |
| `components/dashboard/DashActivityGrid` | **삭제** | Verdict Queue + Watching 으로 분해 흡수 |
| `components/dashboard/VerdictInboxSection` | **삭제** | Verdict Queue 로 통합 |
| `components/dashboard/WVPLCard.svelte` | **결정 필요 D1** | mount(Settings 로 이동) or delete |
| `components/dashboard/KimchiPremiumBadge` | **유지** | Header |

### 신규 컴포넌트

- `hubs/dashboard/HeroStreakCard.svelte`
- `hubs/dashboard/HeroWalletCard.svelte`
- `hubs/dashboard/HeroTierCard.svelte` (Verdicts pending count 흡수)
- `hubs/dashboard/TodayOpportunityList.svelte` (현 Zone A 추출)
- `hubs/dashboard/TodayWatchingList.svelte` (현 Trader Split L 추출, row clickable)
- `hubs/dashboard/VerdictQueue.svelte` (DashActivityGrid + InboxSection 통합)
- `hubs/dashboard/MacroRegimeCard.svelte`

`hubs/dashboard/index.ts` re-export 갱신.

---

## D. 결정 필요 (Decisions)

| # | 항목 | 옵션 A | 옵션 B | 권장 |
|---|------|--------|--------|------|
| D1 | WVPLCard / wvpl API | Mount on Dashboard System row | Move to `/settings/passport` (자세한 P&L 분석 자리) + delete from dashboard | **B** — Dashboard 는 "한눈에", 상세 P&L 은 Passport 영역 |
| D2 | Verdict label enum 통일 | `valid/invalid/near_miss` 유지 (DashActivityGrid 측) | `valid/missed/invalid` 유지 (Inbox 측) | **A** — engine schema 가 `near_miss` 사용 (확인 필요), `missed` 는 alias |
| D3 | Macro regime card 클릭 | `/research/macro` 신규 페이지 | static (클릭 X) | **B** — W-0410 Patterns 설계 후 결정 |
| D4 | Header 모바일 CTA | "Open Terminal" 만 1개 | 2개 split | **B** — Lab 도 자주 씀 |
| D5 | VerdictQueue 빈 상태 | "최근 verdict 없음" + Lab 링크 | zone hide | **A** — 항상 자리 보존 (skeleton) |
| D6 | Watching pane top N | 6 (현재) | 8 | **A** — 모바일에서 8 은 길다 |
| D7 | F-60 ProgressCard 위치 | System & Progress 행 | Hero 옆 | **A** — Hero 는 wallet/passport 정체성, F-60 은 "시스템" |
| D8 | Personalization chip | Today opp 카드마다 | Today zone 헤더 1회 | **B** — 시각 노이즈 감소 |
| D9 | Trader Split Row 의 Scanner pane | 삭제 | Verdict Queue 옆 부활 | **A** — Today opp + 전체보기 링크로 충분 |

→ 권장안 락 시 구현 PR 분기 가능. 미정 항목은 implement 시 사용자 확인.

---

## E. 구현 PR 분기 (5 PR)

### PR1 — IA 골격 + 신규 hubs 컴포넌트 (no behavior change)
- `hubs/dashboard/Hero{Streak,Wallet,Tier}Card.svelte` 신규
- `hubs/dashboard/Today{Opportunity,Watching}List.svelte` 신규
- `hubs/dashboard/VerdictQueue.svelte` 신규 (기능은 DashActivityGrid 위임 wrapper로 시작)
- `hubs/dashboard/MacroRegimeCard.svelte` 신규 (정적)
- `+page.svelte` 재배치 — Header/Alert/Hero/Today/VerdictQueue/System
- 기존 컴포넌트 (StatsZone/DashActivityGrid/InboxSection) **아직 유지**, 새 wrapper 가 위임만.
- AC: visual regression 없이 새 IA 노출.

### PR2 — Verdict 단일화
- DashActivityGrid 의 col2 + col3 로직을 VerdictQueue 로 이전
- VerdictInboxSection 의 fetch + refresh 로직 이전
- enum 통일 (D2 권장 A: `valid/invalid/near_miss`)
- DashActivityGrid + VerdictInboxSection 삭제
- AC: pending 동시 표시 X, verdict 제출 후 즉시 사라짐, refresh 버튼 동작.

### PR3 — Hero/Today 흡수 + dead UI 제거
- StatsZone 삭제 (F-60 + Tier 카드 흡수)
- KPI Strip 삭제 (Hero 흡수)
- Portfolio Strip 삭제 (Day P&L/MaxDD dead)
- Hero sub-row Verdicts → Tier 카드 흡수
- Trader Split Row 삭제 (Watching → TodayWatchingList, Scanner pane 삭제)
- Today row click drill-through 활성 (`?capture=ID`, `?symbol=X&tf=Y`)
- AC: 13 이슈 중 #3 #4 #5 #8 #11 #12 해결.

### PR4 — System wire + 모바일 반응형
- `SystemStatusZone.lastSyncAt` 데이터 공급 (engine flywheel/health 응답에서)
- OpportunityCard ≤640px stack
- Today 2-col ≤768px stack
- Verdict Queue ≤640px 1-col
- Header CTA ≤640px 50/50 split
- AC: 13 이슈 중 #7 #9 #10 해결, Lighthouse mobile 90+ (best effort).

### PR5 — WVPL 처리 + analytics 정리 (D1 결정 후)
- D1=B: `/settings/passport` 에 WVPLCard mount + dashboard 영역 청소
- `/api/dashboard/wvpl` 라우트 이동 또는 유지 결정
- `track('dashboard_view')` race fix (#13)
- Macro regime card 데이터 wire (engine 의 `macroBackdrop` 사용)
- AC: dead endpoint 0, dead component 0.

각 PR 독립 머지 가능, PR2~4 순차 권장 (PR3 가 PR2 결과 컴포넌트 사용).

---

## F. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | Dashboard 6 zone 만 노출 (현재 17 → 6) |
| AC2 | Verdict pending UI 단 1곳 |
| AC3 | 모든 row 클릭 → 적절 페이지 (테스트 4 case) |
| AC4 | `/api/dashboard/wvpl` 호출 0 (delete) 또는 Settings 에서 정상 호출 |
| AC5 | dead prop/label 0 (lastSyncAt wired, Day P&L/MaxDD 제거) |
| AC6 | ≤640px / ≤768px / ≤900px 3 breakpoint 모두 무너지지 않음 (visual regression) |
| AC7 | Verdict enum 1종으로 통일, engine 응답과 매칭 |
| AC8 | `track('dashboard_view')` payload 에 streak 정상값 (0 race 없음) |
| AC9 | Terminal CTA 시 `from=` query 발화, terminal 측 analytics 수신 확인 |
| AC10 | Contract CI 통과 (work item file 등록 + slug lowercase) |

---

## G. Risks

| Risk | 완화 |
|------|------|
| Verdict enum 변경이 engine schema 와 충돌 | PR2 전 engine `/captures/{id}/verdict` 핸들러 grep + `near_miss` allow 확인 |
| StatsZone/DashActivityGrid 삭제 시 다른 페이지 import | PR1 단계에서 grep 후 wrapper 경유로 deprecation 단계 거치기 |
| Terminal 탭 시스템(W-0407) 미완성 시 drill-through 불완전 | from= query 만 먼저 보내고, Terminal 측 탭 로직은 W-0407 PR 완료 후 활용 |
| WVPLCard Settings 이전 시 passport 영역 audit 필요 | D1=B 채택 시 W-0411 (Settings) 와 함께 처리하거나 Dashboard PR5 에서 settings/passport 만 손대고 끝 |
| 모바일 CSS 회귀 | PR4 별도 분리 — visual regression PR 단독 검증 |

---

## H. 다음 단계

1. **D1~D9 결정 락** — 사용자 확인
2. **W-0407 spike(W-T0) 결과 대기** 후 drill-through tab seed 계약 확정
3. PR1 시작

