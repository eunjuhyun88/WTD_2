# W-0122 Phase 3 — UI 배치 + 다음 개발 로드맵

## Context

지난 세션에서 W-0122 Free Indicator Stack 의 6개 PR (#148, #154, #156, #157, #159, #161, #162, #163) 이 머지됐다. 우리는 **$0 비용**으로 6개 Confluence pillar (pattern / venue_divergence / options / funding_flip / rv_cone / ssr / liq_magnet), 7개 엔드포인트, 6개 Archetype 렌더러, 22 unit tests, in-memory history ring, gamma heuristic까지 확보했다.

문제: **대부분의 자산이 모바일 analyze 모드에만 렌더되고 있다.** Desktop Layout B/C/D 는 기존 evidence-grid 만 보여주고 우리가 새로 만든 ConfluenceBanner + IndicatorPanes + LiqHeatmap 을 사용하지 않는다. 실제 체감 가치가 모바일 사용자에게만 전달되는 상태.

Phase 3 목표:
1. **UI 배치 완성** — 모든 레이아웃 (A/B/C/D + Mobile) 에 W-0122 자산을 디자인 의도에 맞게 배치
2. **반응형 특화** — 각 뷰포트 tier (모바일 <768 / 태블릿 768-1279 / 데스크톱 1280+) 의 공간 제약에 맞는 밀도 조정
3. **확장 레이어** — gamma chart overlay + divergence toast + peek bar chip — 기존 UI 에 얹는 3개 작은 위젯
4. **다음 로드맵 우선순위 정리** — Pillar 4 Arkham / Pillar 1 실 WS / Flywheel 영속화 등 남은 항목의 가치-비용 트리아지

Phase 3 이후는 외부 의존성 (Arkham API key / Redis 인프라 / Supabase 마이그레이션) 이 필요한 일들이므로 이 세션에서는 **배치 + 확장 위젯까지만** 최종 마무리.

---

## Part A — 반응형 UI 배치 설계

### 뷰포트 Tier

| Tier | 너비 | 주 레이아웃 | 핵심 특성 |
|---|---|---|---|
| Mobile | < 768px | `mobileView` stacked panel | 수직 스크롤, 모드 전환 (chart/analyze/scan/judge) |
| Tablet | 768–1279px | Layout D (peek) | Desktop CSS 재사용, peek height 좀 더 큼 |
| Desktop | ≥ 1280px | Layout D 기본, A/B/C 대체 가능 | 전체 4 layout 선택 가능 |

**결정:** Mobile 은 변화 최소 (이미 다 있음, 순서만 확인). Tablet 은 Desktop 과 같은 렌더 하위호환. Layout **D (peek)** 가 실 사용의 ≥80% — 여기 우선 투자. A/B/C 는 동등 풍성도로 맞춤.

---

### Mobile (< 768px) — 이미 다 있음, 순서 검증만

`mobileView === 'analyze'` (TradeMode.svelte line 622~660) 현재 순서:
```
1. narrative bar
2. ConfluenceBanner (compact)           ← 이미 있음
3. IndicatorPane gauges (LIVE)           ← 이미 있음
4. IndicatorPane venue                   ← 이미 있음
5. IndicatorPane options (conditional)   ← 이미 있음
6. IndicatorRenderer liq_heatmap         ← 이미 있음
7. evidence-grid
8. PROPOSAL
```

**검증 필요:** 순서 3번(OI/funding/vol) 보다 5번(options P/C + skew) 이 더 알파 신호 → **OPTIONS 를 gauges 바로 아래로 올림**. 변경 파일 하나, 10줄 이내.

`mobileView === 'judge'`: ConfluenceBanner (compact) 상단 추가 — 포지션 진입 판단 시점에 confluence 를 반드시 보게.

`mobileView === 'scan'`: scan-candidate list 위에 confluence compact + divergenceStreak badge — "스캔 결과를 신뢰할 만한 시장인가" 판단.

### Desktop Layout D (peek — 기본값, 80% 트래픽 가정)

**peek-bar (닫힌 상태, 30px):**

현재: `"02 ANALYZE • α82 • 롱 진입 • OI ▲"`
확장: **새 컴포넌트 `ConfluencePeekChip.svelte`** 를 peek-bar 분석 칩 옆에 인라인.
```
[02 ANALYZE • α82 • 롱 진입]  [⟐ +18 BULL ↗ · DIV·3]  [03 SCAN • 5]  [04 JUDGE • R:R 2.4]
```
- 크기 ~120px, 높이 20px
- score + regime 컬러 + divStreak 뱃지
- 클릭 시 peek drawer analyze 탭 열림

**peek-overlay analyze 탭 (열린 상태):**

현재 구조 `.analyze-body { display: flex }`:
- `.analyze-left { flex: 1.3 }` ← 현재 narrative + evidence-grid
- `.analyze-right { width: 240px }` ← 현재 proposal

**새 배치:**
```
.analyze-left (flex: 1.3, vertical scroll):
  ConfluenceBanner (full, with sparkline)
  IndicatorPane gauges (row layout — OI 1h · Funding · Volume)
  IndicatorPane options (row — P/C · Skew 25d)
  IndicatorPane venue (stack)
  evidence-grid (현재 2-col)

.analyze-right (width: 240px, vertical scroll):
  IndicatorRenderer liq_heatmap (compact mode)
  proposal (entry/stop/target)
```

peek-overlay 의 기본 peekHeight 는 현재 대비 +5~10 % 상향 권장 (더 많은 콘텐츠).

**peek-overlay scan 탭:**

현재 `.scan-panel .scan-header` 아래 `.scan-grid` 에 후보 카드.
**추가:** scan-header 우측에 `ConfluencePeekChip` 인라인 — "이 스캔 결과가 BULL regime 에서 나온 것인지 BEAR 에서 나온 것인지" 한눈에.

**peek-overlay judge 탭:**

현재 `.act-panel .act-cols` 3-col (plan / judge / after).
**추가:** act-panel 상단에 `ConfluenceBanner` (full) — 포지션 진입 시 confluence 확인 필수.

### Desktop Layout A (3-column 스택)

`.la-analyze-col` 이미 ConfluenceBanner + evidence-grid 보유.
**추가 배치:**
```
.la-analyze-col > .la-col-body:
  narrative
  ConfluenceBanner (full)                   ← 이미 있음
  IndicatorPane gauges (row, compact)        ← 신규
  IndicatorPane options (row, compact)       ← 신규
  IndicatorPane venue (stack, compact)       ← 신규
  evidence-grid                              ← 이미 있음
  PROPOSAL + cells                           ← 이미 있음

.la-scan-col > .la-col-body:
  scan-candidate list                        ← 기존
  (하단) IndicatorRenderer liq_heatmap (small) ← 신규 — scan 판단에 도움

.la-judge-col > .la-col-body:
  ConfluenceBanner (compact)                 ← 신규, 최상단
  (기존 judge UI)
```

### Desktop Layout B (tabbed drawer, 240px)

`.drawer-header` 에 **ConfluencePeekChip** 인라인 (탭 우측).

analyze 탭 `.analyze-body { display: flex }`:
```
.analyze-left (flex: 1.3):
  ConfluenceBanner (compact)                 ← 신규
  IndicatorPane gauges                       ← 신규
  IndicatorPane options (horizontal)         ← 신규
  evidence-grid                              ← 기존

.analyze-right (width: 240px):
  IndicatorPane venue (stack)                ← 신규
  IndicatorRenderer liq_heatmap (small)      ← 신규
  proposal                                   ← 기존
```

height 240px 고정이므로 내부 overflow-y:auto. 컴팩트 모드 유지.

### Desktop Layout C (sidebar 260px)

좁은 공간이라 **밀도 극대화 + disclosure 활용**:

```
.lc-sidebar > lcs-section (02 ANALYZE):
  ConfluenceBanner (compact)                 ← 신규
  narrative (짧게)
  <details> 상세 지표 열기
    IndicatorPane gauges
    IndicatorPane options
    IndicatorPane venue
  </details>
  evidence-grid (compact, 1-col)

lcs-section (03 SCAN):
  (기존)

lcs-section (04 JUDGE):
  proposal
  IndicatorRenderer liq_heatmap (tiny inline)  ← 신규
```

---

## Part B — 신규 작은 위젯 3종

### 1. `ConfluencePeekChip.svelte` (신규)

경로: `app/src/lib/components/confluence/ConfluencePeekChip.svelte`

목적: peek-bar, drawer-header, scan-header 등 협소 공간에 인라인으로 confluence 요약 표시.

Props: `{ value: ConfluenceResult | null }`

시각:
```
⟐ +18 BULL ↗  ·  DIV·3
```
- regime 이모지 1자 + score + regime label (축약) + direction arrow + divStreak badge
- 전체 너비 ~110-130px, 높이 22px
- regime 컬러 border-left 유지

### 2. `GammaPinOverlay` — ChartBoard LWC primitive

ChartBoard 는 Lightweight-Charts 사용. 기존 primitive 패턴: `app/src/components/terminal/chart/primitives/*` (CaptureMarkerPrimitive, EvalWindowPrimitive, PhaseZonePrimitive, RangePrimitive).

새 primitive: `GammaPinPrimitive.ts`
- `options.pinLevel` 을 horizontal price line 으로 렌더
- 라벨: "PIN $80,000"
- 색: regime-bull 보드 컬러 / regime-bear 컬러 (pinDirection 기반)
- ChartBoard 의 primitive register 훅에 추가

별도 `options` 데이터를 ChartBoard 로 전달할 prop 추가 필요 (TradeMode → ChartBoard).

### 3. `DivergenceAlertToast.svelte` — 선행 경고

경로: `app/src/lib/components/confluence/DivergenceAlertToast.svelte`

트리거: `confluence.divergenceStreak >= 3` 진입 edge (이전 < 3 → 현재 ≥ 3).

Svelte 5 `$effect` 로 TradeMode 의 `confluence` 변화를 감지, 조건 만족 시 ToastStack 으로 push.

메시지:
```
⚠ DIVERGENCE 3 reads straight — rare high-alpha window
Top: venue +0.55 vs ssr -0.40 (click to open analyze)
```
- 자동 dismiss 60s
- 클릭 시 `shellStore.update` 로 analyze 탭/모바일뷰 열기

기존 ToastStack (`app/src/components/shared/ToastStack.svelte`) 재사용.

---

## Part C — 다음 로드맵 (Phase 3 이후)

이 세션에서는 UI 배치 + 3 위젯까지. 그 다음 슬라이스 우선순위 (CTO 레버리지 순):

### P4-A — Confluence Flywheel 영속화 (leverage ★★★★★, cost $0)
- Supabase `capture_records` 에 confluence snapshot JSONB 추가
- Verdict 제출 시 snapshot 기록
- `/api/confluence/outcomes` — snapshot ↔ outcome 조인
- Refinement UI 에 "Weight Adjustment" axis 추가
- → 사용자가 쓸수록 weight 이 outcome 에 수렴 = 진짜 moat

### P4-B — Pillar 4 Arkham Exchange Netflow (leverage ★★★★, cost $0 free tier)
- `/api/market/exchange-netflow?exchange=binance` (Arkham free API)
- 3 engine blocks: inflow_spike / outflow_persistent / whale_transfer
- Confluence 의 7번째 pillar 를 8번째로 확장 → PHASE1_WEIGHTS 재균형
- **blocker: Arkham API key 프로비저닝 필요**

### P4-C — Pillar 1 실 forceOrder WS (leverage ★★★, cost $0 WS + Redis)
- Binance/Bybit/OKX forceOrder WS workers
- Redis 7d rolling 집계 (Upstash free tier)
- 기존 liq-clusters endpoint 를 approximation → real data 로 교체
- **cost: Redis Upstash $0 free or $10/mo paid**

### P4-D — Pillar 2 real Greeks + GEX (leverage ★★★, cost $0 compute)
- Deribit WS 스트림 + BSM 서버 계산
- Σ OI × gamma × spot² = 실 GEX
- gamma flip level 을 heuristic pin → real GEX 로 대체
- ChartBoard 에 GEX distribution overlay

### P4-E — New Building Blocks × 12 (leverage ★★, cost $0)
현재 engine 에 3/15 블록 구현. 나머지 12개 (skew_extreme_fear, put_call_ratio_extreme, gamma_flip_proximity, liq_magnet_above/below, dvol_spike, etc.) engine 쪽 파이썬 블록으로 추가 — app 쪽 Confluence 에는 이미 반영됨.

### P4-F — 경쟁사 스크린샷 대조 (leverage ★★, cost $0)
Coinglass liq heatmap / Laevitas skew / CryptoQuant netflow 와 우리 대응 feature 를 스크린샷 대조 → 마케팅 자산.

**추천 순서: P4-A → P4-B → P4-D → P4-C → P4-E → P4-F**

---

## 구현 계획 요약 (이 세션)

Phase 3 단일 PR 로 묶어 머지:

### 파일 변경

| 파일 | 변경 | LoC | Status |
|---|---|---|---|
| `app/src/lib/components/confluence/ConfluencePeekChip.svelte` | 신규 | ~80 | ✅ 작성 완료 (미커밋) |
| `app/src/lib/components/confluence/DivergenceAlertToast.svelte` | 신규 | ~60 | ⏳ pending |
| `app/src/components/terminal/chart/primitives/GammaPinPrimitive.ts` | 신규 | ~80 | ⏳ pending |
| `app/src/lib/cogochi/modes/TradeMode.svelte` | Layout A/B/C/D 배치 수정 + 위젯 연결 + mobile OPTIONS 순서 수정 | ~180 | ⏳ pending |
| `app/src/components/terminal/workspace/ChartBoard.svelte` | gamma primitive register + options prop | ~40 | ⏳ pending |
| `app/src/lib/indicators/IndicatorPane.svelte` | `compact` prop 추가 (tight spacing variant) | ~20 | ⏳ pending |

**총 신규 + 수정: ~460 LoC, 6 files.**

**진행 상태 (2026-04-22 재개 시점):**
- 브랜치 `claude/w-0122-phase3-ui` 생성됨 (from main b2910578)
- `ConfluencePeekChip.svelte` 이미 작성됨 — 외 5개 파일 순차 진행
- 남은 순서: IndicatorPane compact → GammaPinPrimitive + ChartBoard wire → DivergenceAlertToast → TradeMode 재배치 → 타입체크/테스트/커밋/PR

### 재사용 자산 (이미 있음 — 재작성 금지)

- `ConfluenceBanner.svelte` — 현재 모바일/Layout A 에서 사용 중, props 그대로 재사용
- `IndicatorPane.svelte` — `ids` + `values` + `title` + `layout` prop 지원, 새로 `compact` 만 추가
- `IndicatorRenderer.svelte` — dispatcher 역할 이미 완성
- `ToastStack.svelte` (`app/src/components/shared/ToastStack.svelte`) — 기존 toast 시스템 재사용
- `$lib/server/confluenceHistory.ts` — divergenceStreak 계산 이미 서버 쪽에서 제공, UI 는 사용만
- Chart primitive 패턴 (`CaptureMarkerPrimitive.ts`, `PhaseZonePrimitive.ts`) — Gamma primitive 작성 템플릿
- `shellStore` / `viewportTier` 스토어 — Layout 전환 감지에 사용

### 비용 분석

| 항목 | Delta |
|---|---|
| 신규 API 호출 | **0** (모두 기존 데이터 재배치) |
| 신규 외부 서비스 | **0** |
| 스토리지 | **0** |
| 컴퓨트 | ~rendering overhead only |
| 월 비용 | **$0** |

### 검증 방법

1. **Type check**: `cd app && npx svelte-check --threshold error` → 0 new errors (1 pre-existing baseline)
2. **Tests**: `npx vitest run src/lib/confluence/ src/lib/server/confluenceHistory.test.ts` → 22 green
3. **Preview**: 이미 실행 중인 preview server 의 HMR 로 각 layout 전환 확인
   - Mobile: resize window < 768 → analyze 모드 순서 검증 (OPTIONS 가 gauges 바로 아래)
   - Layout D peek: 기본 렌더 → peek 바 chip 표시 + drawer 열어 analyze/scan/judge 각 탭 확인
   - Layout A/B/C: shellStore tabState.layoutMode 변경으로 수동 전환
4. **Endpoint 라이브 확인**:
   ```
   curl http://localhost:50004/api/confluence/current?symbol=BTCUSDT&tf=4h
   curl http://localhost:50004/api/confluence/history?symbol=BTCUSDT&limit=10
   curl http://localhost:50004/api/market/options-snapshot?currency=BTC  # gamma 필드 확인
   ```
5. **시각 확인**: preview_screenshot 으로 각 뷰포트 (375 모바일, 1024 태블릿, 1440 데스크톱) 캡처
6. **Gamma primitive**: pin price line 이 차트에 regime-컬러로 렌더되는지 육안 확인
7. **Divergence toast**: confluence history 에서 divStreak ≥ 3 시나리오 재현 후 toast 트리거 확인 (preview_eval 로 수동 트리거)

### 커밋 분할 전략

3개 commit (원자):
1. `feat(W-0122-Phase3): ConfluencePeekChip + IndicatorPane compact mode`
2. `feat(W-0122-Phase3): GammaPinPrimitive + ChartBoard wire`
3. `feat(W-0122-Phase3): Layout A/B/C/D TradeMode 재배치 + DivergenceAlertToast`

PR 하나로 묶어 제출 — 세 커밋이 같은 슬라이스의 논리적 축.

### Exit Criteria

- [ ] Mobile analyze 에서 OPTIONS 가 LIVE INDICATORS 바로 아래로 올라옴
- [ ] Mobile judge, scan 에 ConfluenceBanner compact / PeekChip 노출
- [ ] Layout A la-analyze-col 에 3 개 IndicatorPane 추가 렌더
- [ ] Layout A la-scan-col 에 liq heatmap, la-judge-col 에 ConfluenceBanner 추가
- [ ] Layout B drawer-header 에 ConfluencePeekChip + analyze-left 에 지표 모두 노출
- [ ] Layout C sidebar ANALYZE 에 ConfluenceBanner + details 아코디언
- [ ] Layout D peek-bar 에 ConfluencePeekChip + analyze/judge 탭 풍성화
- [ ] GammaPinPrimitive 가 ChartBoard 에 등록되어 pin price 수평선 렌더
- [ ] DivergenceAlertToast 가 divStreak ≥ 3 edge 에서 1 회 fire, 클릭 시 analyze 탭 열림
- [ ] svelte-check 0 new errors
- [ ] 22 existing tests green
- [ ] preview: 0 server errors
- [ ] 4 viewport 스크린샷으로 시각 검증 통과

---

## Part D — 미해결 질문 (AskUserQuestion 후보)

이 플랜은 user 가 이미 제공한 정보로 충분히 작성 가능하지만 잠재 확인 포인트:

1. **peek bar 에 confluence chip 위치** — 기존 analyze chip 오른쪽 vs judge chip 오른쪽? (현재 플랜: analyze chip 옆)
2. **Layout C 의 details 아코디언 기본 상태** — 열림(밀도↑) vs 닫힘(narrative 선호)? (현재 플랜: 닫힘 — narrative 우선)
3. **Divergence toast 자동 dismiss 시간** — 60s vs user-dismiss only? (현재 플랜: 60s)

이 3개는 구현 시 기본값으로 결정 가능 — 코드 작성 막혀야 하는 질문은 없음.
