# W-0391 — Cogochi UX 마스터 통합 개선

> Wave: 5 | Priority: P1 | Effort: L (4-6 weeks, 병렬 6 워크스트림)
> Charter: In-Scope (Frozen 전면 해제 2026-05-01)
> Status: 🟡 Design Draft
> Created: 2026-05-03
> Issue: #937

## Sub-stream Files

| Stream | 파일 | 담당 |
|---|---|---|
| A | `work/active/W-0391-A-chart-accuracy.md` | RSI/MACD/BB + CrossHair |
| B | `work/active/W-0391-B-landing-gtm.md` | Landing + analytics.ts |
| C | `work/active/W-0391-C-tv-import.md` | TV Import → Compiler |
| D | `work/active/W-0391-D-dashboard-alerts.md` | Alert Strip |
| E | `work/active/W-0391-E-verdict-passport.md` | Verdict 스와이프 + Passport |
| F | `work/active/W-0391-F-commandpalette-onboarding.md` | ⌘K + Onboarding |

---

## Goal

> **Jin이 모바일 첫 진입 90초 안에 첫 Verdict를 받고, 데스크톱 차트에서 RSI/MACD/BB 라인이 정확히 그려지며, ⌘K 한 번으로 어떤 심볼이든 분석 시작할 수 있게 한다.**

수치 목표:
- **차트 정확도**: RSI/MACD/BB 라인 비어있는 빈도 0% (현재 ~100% — `indicators: {}` 반환)
- **Landing → First Verdict TTV**: p50 ≤ 90초, p95 ≤ 180초 (현재 측정 불가, analytics 미연결)
- **Onboarding 완료율**: 첫 진입 사용자의 ≥40%가 첫 Verdict 도달
- **CrossHair 도입**: ChartBoard에서 멀티-페인 시간 동기화 ≥3개 인디케이터에 적용
- **⌘K usage**: 활성 사용자(주 3회 이상)의 ≥30%가 ⌘K 1회 이상 사용
- **Mobile Verdict 스와이프**: 모바일 사용자 verdict 카드 스와이프 navigation ≥60% 도달
- **Analytics 이벤트 coverage**: P-01~P-10 핵심 funnel 이벤트 100% wired

---

## 현황 갭 매트릭스

| Page | Chart Accuracy | Landing/GTM | TV Import | Alerts | Passport/Verdict | CmdK/Onboarding |
|---|---|---|---|---|---|---|
| P-01 Landing | — | 🔴 미완성 (284줄, hero only) | — | — | — | — |
| P-02 Auth/Signup | — | 🔴 funnel event 미연결 | — | — | — | — |
| P-03 Dashboard (Trader Home) | — | — | — | 🔴 Alert Strip 미시작 | — | 🟡 onboarding hint 없음 |
| P-04 Terminal (chart) | 🔴 RSI/MACD/BB 빈 라인 | — | 🟡 W-0371 설계만 | — | — | 🔴 ⌘K 미연결 |
| P-05 Chart deep-link | 🔴 CrossHair 미구현 | — | 🔴 URL→Compiler | — | — | — |
| P-06 Patterns library | — | 🟡 SEO meta 미최적 | — | — | — | — |
| P-07 Pattern Detail | — | — | — | — | 🟡 share URL 부재 | — |
| P-08 Lab/Hypothesis | — | — | 🔴 import flow 0% | — | — | — |
| P-09 Verdict/Passport | — | — | — | — | 🔴 mobile swipe + share URL | — |
| P-10 Settings | — | — | — | — | — | — |

✅ 완료(중복 설계 금지): W-0372 Phase A-D, W-0374 D-0~D-9, W-0389 Phase 1-6, W-0390 Phase 1-4

🔴 = 미시작 / 🟡 = 부분 완료 또는 설계만 / — = 해당 없음 또는 완료

---

## 병렬 워크스트림 구조

> 6 streams가 **파일 경계 disjoint** — 동시에 6 PR 머지 가능.

| Stream | 영역 | 책임자 모델 | 주요 파일 (write) |
|---|---|---|---|
| **A** Chart Accuracy | RSI/MACD/BB · CrossHair · ChartBoard 버그 | Sonnet (engine grep + svelte) | `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`, `engine/indicators/*` |
| **B** Landing + GTM | P-01 hero refresh · funnel · analytics wiring | Sonnet | `app/src/routes/+page.svelte`, `app/src/lib/analytics.ts`, `app/src/routes/signup/*` |
| **C** TV Import + Compiler | W-0371 구현 (URL → Hypothesis) | Opus (설계 판단) | `app/src/lib/import/tv/*`, `app/src/lib/hubs/lab/*`, `engine/import/tv_chart_parser.py` |
| **D** Dashboard Alerts | W-0390 Phase 5 Alert Strip + Kimchi | Sonnet | `app/src/routes/dashboard/+page.svelte`, `app/src/lib/components/dashboard/AlertStrip.svelte` |
| **E** Verdict/Passport | mobile swipe · share URL · OG card | Sonnet | `app/src/routes/verdict/[id]/*`, `app/src/lib/passport/*` |
| **F** CmdK + Onboarding | ⌘K wire-up · 첫 진입 spotlight tour | Sonnet | `app/src/lib/components/CommandPalette.svelte`, `app/src/lib/onboarding/*` |

규칙:
- A는 ChartBoard.svelte를 단독 소유 (다른 stream touch 금지).
- B는 +page.svelte (Landing) + analytics.ts 단독 소유.
- D만 dashboard/+page.svelte 수정 권한 (E/F는 read-only).
- F는 CommandPalette.svelte + onboarding/ 신규 폴더만.
- 공통 토큰(app.css, design-system.css)은 **frozen** — 누구도 touch 금지 (W-0389 완결).

---

## 페이지별 상세 설계

### P-01 Landing (`+page.svelte` 284줄) — Stream B

**현황**: hero 1단 + CTA 1개. funnel event 0개.

**개선**:
1. Hero 아래 **3-pane preview** 추가
   - Pane 1: live BTC 1m 차트 미니 (read-only public ws)
   - Pane 2: 실시간 verdict 카운터 ("오늘 1,247 verdicts")
   - Pane 3: 패턴 라이브러리 sample card (top 3 patterns by recall@10)
2. **CTA stack**: 〔무료로 첫 분석〕 (primary) / 〔TV 차트 import〕 (secondary, Stream C 의존) / 〔샘플 verdict 보기〕 (tertiary, Stream E 의존)
3. **Social proof strip**: anonymized last 5 verdicts (symbol/direction/win-loss tag)
4. **Funnel events**: `landing_view`, `landing_cta_click{variant}`, `landing_scroll_depth{25,50,75,100}`
5. SEO meta: og:image (auto-generated card with live BTC pulse), twitter:card, structured data `WebApplication`

**Acceptance**:
- Lighthouse perf ≥ 85 mobile
- 4개 funnel event가 PostHog/analytics에 도달 확인 (e2e)
- 3-pane preview p50 LCP ≤ 1.8s

### P-02 Auth/Signup — Stream B

**현황**: Supabase magic link 작동. 이벤트 없음.

**개선**:
1. `signup_start`, `signup_method{magic_link|google}`, `signup_complete`, `signup_abandon{step}` 이벤트
2. Magic link 메일 도착 후 **30초 spinner + "메일 안 왔어요?" fallback** (현재 무한 대기)
3. Post-signup redirect → onboarding (Stream F가 hand-off)

**Acceptance**:
- signup → first_verdict 퍼널 PostHog에서 측정 가능
- abandon rate < 35% (post-launch baseline 측정 후 lock)

### P-03 Dashboard / Trader Home (`/dashboard/+page.svelte` 840줄) — Stream D

**현황**: W-0389 Phase 5 Trader Home 완료. Alert Strip 0개.

**개선** (W-0390 Phase 5 흡수):
1. **Alert Strip** (TopBar 아래 28px row)
   - Slot 1: KimchiPremium spike (>2σ)
   - Slot 2: Top funding rate divergence (BTC perp vs spot)
   - Slot 3: Liquidation cluster (large prints last 5m)
   - Slot 4: News pulse (latest macro headline, EN ticker)
   - 각 slot dismissible (24h cookie)
2. Strip 클릭 → 해당 심볼 Terminal 진입 (deep-link `?symbol=X&pane=alert`)
3. Settings → "Mute alert types" toggle

**Acceptance**:
- Alert Strip render p95 ≤ 200ms (engine `/alerts/feed` SSE)
- 0개 alert 상태에서도 strip placeholder 안 깨짐
- Mobile breakpoint < 768px → 가로 스크롤 가능 (snap)

### P-04 Terminal (chart hub) — Stream A + F

**현황**: ChartBoard 2557줄. RSI/MACD/BB indicators 필드 비어 있음. CrossHair 없음. ⌘K 비연결.

**개선**:

#### Stream A — Chart Accuracy (P-04, P-05 공통)
1. **Indicator backend repair**
   - `engine/indicators/{rsi,macd,bbands}.py` output schema 확인 → `{values: [{t, v}], meta: {period}}` 통일
   - app `useIndicatorSeries(name)` store 수정: empty array 대신 last cache value retain
   - ChartBoard line series add: indicator 활성화 시 `lineSeries.setData()` 호출 누락된 곳 3개소 식별·수리
2. **CrossHair sync** (W-0212 흡수)
   - `lightweight-charts` `subscribeCrosshairMove` 한 곳에 연결, `crosshairTime` writable store에 publish
   - 모든 sub-pane (RSI/MACD/Volume) `subscribe` → vertical line 동기 표시
   - PaneInfoBar (W-0212) 우상단 24px overlay: O/H/L/C/V live 값
3. **ChartBoard 분해 사전 작업** (실제 분해는 W-0392로 후속): 2557줄 중 `_DEPRECATED_` 마크 + indicator section을 별도 컴포넌트 stub으로 추출 ready

#### Stream F — CmdK
1. `CommandPalette.svelte` 마운트: Terminal/Dashboard layout에 `<CommandPalette />` mount + `Cmd+K`/`Ctrl+K` keydown handler
2. Action set:
   - `symbol:BTCUSDT` → ChartBoard symbolSwitch
   - `pattern:bull-flag` → Patterns hub
   - `verdict:latest` → most recent verdict
   - `goto:settings/api`
3. Telemetry: `cmdk_open`, `cmdk_action_select{kind}`

**Acceptance**:
- ChartBoard에서 RSI/MACD/BB 활성 시 line render 100% (3 timeframes × 3 indicators e2e)
- CrossHair 이동 시 sub-pane vertical line latency ≤ 16ms (1 frame)
- ⌘K 5종 액션 모두 < 80ms 응답
- ChartBoard.svelte 줄 수 변동 ≤ +200줄 (분해는 W-0392 별도)

### P-05 Chart Deep-link (`/chart/[symbol]`) — Stream A + C

**현황**: route 없음 또는 미구현. TV URL handler 없음.

**개선**:
- Stream A: `/chart/[symbol]` SSR route — Terminal hub 마운트 with prefilled symbol
- Stream C: `?import=tv&url=...` query param → Hypothesis Compiler entry

**Acceptance**: 6 popular symbol으로 deep-link 진입 시 chart load p95 ≤ 2.5s.

### P-06 Patterns library — Stream B (SEO only)

**현황**: list view 작동. SEO meta 부족.

**개선**: 패턴 slug page (`/patterns/[slug]`) per-pattern meta:
- og:title `{pattern} 패턴 — recall {x}%, win-rate {y}%`
- og:image: 자동 생성 chart preview
- structured data `Article` + `breadcrumb`

**Acceptance**: GSC indexable ≥ 50 pattern slugs within 14d.

### P-07 Pattern Detail — Stream E (share URL only)

**현황**: detail view 있음. share URL 미구현.

**개선**: `/patterns/[slug]/share` public read-only view + copy-link button.

**Acceptance**: copy URL → incognito 열람 시 200 + chart render OK.

### P-08 Lab / Hypothesis — Stream C

**현황**: W-0371 설계 완료. 구현 0%.

**개선** (W-0371 흡수, MVP scope):
1. **TV URL parser** (`engine/import/tv_chart_parser.py`)
   - 입력: `https://www.tradingview.com/chart/{id}/...`
   - 추출: symbol, timeframe, drawn shapes (지원: trendline, horizontal line, fib retr)
   - TV public chart의 server-rendered image OG meta + open API endpoints에서 가능한 데이터만 추출 (인증 우회 금지)
   - **OQ-1** 참조: TV가 공개 share URL에서 어떤 메타데이터까지 노출하는지 실측 필요
2. **Hypothesis Compiler UI** (`app/src/lib/hubs/lab/HypothesisCompiler.svelte`)
   - Step 1: TV URL paste
   - Step 2: 추출된 shape preview (read-only chart)
   - Step 3: "이 setup 검증" → backtest job 큐잉
3. **Output**: `Hypothesis` row in DB with `source: 'tv_import'`

**Acceptance**:
- 5개 sample TV public URL로 parse → ≥ 3개 성공 (60% 성공률)
- 실패 시 "지원하지 않는 chart 타입" 에러 명확
- Compiler step 1→3 < 3 click

### P-09 Verdict / Passport — Stream E

**현황**: verdict view 있음. mobile swipe 없음. share URL 없음.

**개선**:
1. **Mobile swipe nav**
   - Verdict card 좌우 swipe → prev/next verdict (last 20)
   - Touch threshold 60px, animation 200ms ease-out
   - Desktop: arrow keys 동일 동작
2. **Public share URL** `/verdict/[id]/public`
   - Read-only, no auth, watermarked "Cogochi"
   - OG card auto-generated (symbol, direction, P&L, timestamp)
3. **Passport view** `/passport/[handle]` — 이미 부분 존재 시 OG 추가

**Acceptance**:
- Mobile swipe gesture 60fps (Chrome devtools 측정)
- Public URL → Twitter/X share 시 large card preview 정상
- 1000 verdicts/min OG generation 부담 < 200ms p95 (vercel og)

### P-10 Settings — 변경 없음

W-0389/W-0390에서 mute toggle 1개만 추가 (Stream D가 처리).

---

## Phase × Stream 실행 매트릭스

> 각 cell은 PR 1개. 동일 Phase 내 PR은 병렬 머지 가능. Phase 진입은 직전 Phase의 acceptance 통과 후.

| | **Phase 1 (Week 1-2): Truth & Funnel** | **Phase 2 (Week 3-4): Power UX** | **Phase 3 (Week 5-6): Polish & GTM** |
|---|---|---|---|
| **A** Chart | A1: RSI/MACD/BB indicator repair | A2: CrossHair + PaneInfoBar | A3: deep-link route /chart/[symbol] |
| **B** Landing/GTM | B1: analytics.ts wire-up + funnel events P-01~P-02 | B2: Landing 3-pane preview + CTA stack | B3: SEO meta P-06 patterns + OG cards |
| **C** TV Import | — | C1: TV URL parser + 5 sample test | C2: Hypothesis Compiler UI |
| **D** Dashboard | D1: Alert Strip skeleton + 4 slots | D2: SSE wire to engine alerts feed | D3: mute toggle + mobile snap-scroll |
| **E** Verdict/Passport | — | E1: mobile swipe + keyboard nav | E2: public share URL + OG card |
| **F** CmdK | F1: CommandPalette mount + ⌘K binding | F2: 5 action types + telemetry | F3: onboarding spotlight tour (first-run) |

**Phase gates**:
- Phase 1 → 2: A1 + B1 + D1 + F1 머지, smoke test green.
- Phase 2 → 3: chart accuracy 100%, swipe 60fps, alert strip live.

---

## 파일 경계 (stream별)

### Stream A (Chart) — write
- `app/src/lib/hubs/terminal/workspace/ChartBoard.svelte`
- `app/src/lib/hubs/terminal/workspace/PaneInfoBar.svelte` (신규)
- `app/src/lib/stores/crosshair.ts` (신규)
- `app/src/lib/stores/indicators/{rsi,macd,bbands}.ts`
- `app/src/routes/chart/[symbol]/+page.svelte` (신규)
- `engine/indicators/{rsi,macd,bbands}.py` (read·schema-fix)

### Stream B (Landing/GTM) — write
- `app/src/routes/+page.svelte`
- `app/src/lib/analytics.ts`
- `app/src/lib/components/landing/{HeroPreview,SocialProofStrip}.svelte` (신규)
- `app/src/routes/signup/+page.svelte` (event 추가만)
- `app/src/routes/patterns/[slug]/+page.ts` (meta 추가)

### Stream C (TV Import) — write
- `app/src/lib/hubs/lab/HypothesisCompiler.svelte` (신규)
- `app/src/lib/import/tv/{parser,types}.ts` (신규)
- `engine/import/tv_chart_parser.py` (신규)
- `engine/tests/test_tv_chart_parser.py` (신규)

### Stream D (Dashboard) — write
- `app/src/routes/dashboard/+page.svelte`
- `app/src/lib/components/dashboard/{AlertStrip,AlertSlot}.svelte` (신규)
- `app/src/lib/stores/alerts.ts` (신규)
- `engine/api/alerts_feed.py` (read·SSE add)

### Stream E (Verdict/Passport) — write
- `app/src/routes/verdict/[id]/+page.svelte`
- `app/src/routes/verdict/[id]/public/+page.svelte` (신규)
- `app/src/routes/verdict/[id]/og.png/+server.ts` (신규)
- `app/src/lib/components/verdict/SwipeNav.svelte` (신규)
- `app/src/routes/patterns/[slug]/share/+page.svelte` (신규)

### Stream F (CmdK + Onboarding) — write
- `app/src/lib/components/CommandPalette.svelte` (mount·logic)
- `app/src/lib/onboarding/{SpotlightTour,steps.ts}.ts` (신규)
- `app/src/lib/stores/cmdk.ts` (신규)
- `app/src/routes/+layout.svelte` (mount only — coordinated touch with B/D)

> `+layout.svelte` 는 F가 mount-only 1줄 추가 권한, B/D는 read-only.

---

## Exit Criteria

전체 W-0391 완료 조건 (수치 포함):

1. **차트 정확도**: ChartBoard에서 RSI/MACD/BB 활성 시 line render 100% (e2e 9 cases: 3 indicators × 3 timeframes)
2. **CrossHair**: 멀티-페인 vertical line latency ≤ 16ms
3. **Landing TTV**: Landing → first verdict p50 ≤ 90s, p95 ≤ 180s (PostHog funnel)
4. **Onboarding**: 첫 진입 사용자 ≥ 40% first verdict 도달
5. **CmdK adoption**: WAU ≥ 30% ⌘K 1회 이상 사용 (4주 측정)
6. **Alert Strip**: render p95 ≤ 200ms, 4 slots 모두 live data 도달
7. **TV import**: 5 sample URL 중 ≥ 3 성공 parse
8. **Mobile swipe**: gesture 60fps Chrome devtools
9. **Public share**: /verdict/[id]/public 200 status + OG card 생성 ≤ 200ms p95
10. **Analytics**: P-01~P-10 funnel event 100% wired (PostHog dashboard)
11. **Lighthouse**: Landing mobile perf ≥ 85
12. **No regression**: W-0372/W-0374/W-0389/W-0390 acceptance 전부 유지

---

## Open Questions

- **OQ-1**: TV public share URL이 drawn shapes (trendline/fib) 메타데이터를 OG/SSR HTML에 노출하는가? Stream C 진입 전 5 sample 실측 필요. 실측 결과에 따라 MVP scope가 "URL → symbol/timeframe만" (보수)으로 축소될 수 있음.
- **OQ-2**: Alert Strip의 4 slot 우선순위(Kimchi/Funding/Liquidation/News)가 사용자에게 가장 가치 있는 조합인가? Phase 1 D1 머지 후 1주 PostHog click-through로 검증 후 Phase 3에서 재배치.
- **OQ-3**: Onboarding spotlight tour를 강제 step (skip 불가) vs optional 으로 할지. 일반적으로 optional이 churn 적지만, first-verdict 도달률 목표(40%)에 미달 시 강제 전환 검토.
- **OQ-4**: ⌘K에서 자연어 검색("BTC 지금 살까?") → AI agent 라우팅을 MVP에 포함할지, 아니면 W-0392로 분리할지. AIAgentPanel과의 책임 경계가 모호.
- **OQ-5**: Public verdict URL이 paid feature인지 free인지. Free라면 watermark/rate-limit, paid라면 tier gate 필요. Stripe tier_gate.py 재사용 가능.
- **OQ-6**: ChartBoard 2557줄 분해(W-0392)가 W-0391 Stream A2(CrossHair) 구현 전·후 어느 시점이 맞는가. 분해 먼저면 risk 크지만 CrossHair 코드가 깨끗해짐. 후순위면 CrossHair patch가 분해 시 충돌. **현재 design은 후순위(W-0392 분리)로 가정** — 사용자 승인 필요.

---

## Dependencies & Hand-offs

- W-0212 (chart UX polish) → Stream A에 흡수, work item close 예정
- W-0371 (TV chart import) → Stream C에 흡수, work item close 예정
- W-0374 (chart accuracy 잔여) → Stream A1에 흡수
- W-0390 Phase 5 → Stream D에 흡수
- W-0392 (ChartBoard refactor) → 분리 follow-up, 본 설계 종료 후 spawn

## Out of Scope (명시적)

- Copy trading 실행 — Charter 해제됐으나 본 W는 UX만 다룸
- AI 차트 분석 모델 자체 개량 — AIAgentPanel UX는 다루지만 모델은 별도
- Mobile native app — 웹 모바일 reactive까지만
- Stripe billing UX 변경 — W-0248 영역
