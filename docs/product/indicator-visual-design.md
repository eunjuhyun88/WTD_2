# Indicator Visual Design — 2026-04-22

## Purpose

`docs/domains/indicator-registry.md` 의 6개 archetype 이 실제로 어떻게 그려지는가를
구체적 목업과 상호작용 규칙으로 못 박는다. 이후 렌더러 구현은 본 문서를 **시각 계약** 으로 사용한다.

## Design Principles — 트레이더 뇌에 맞추기

1. **시선 이동 < 200ms.** 값이 "극단적인가?" 의 인식이 숫자를 읽기 전에 색/형상으로 일어나야 한다.
2. **p50 은 무색.** 평범한 값에 색을 주면 시각 피로가 누적되어 정작 극단에서 주의가 부족해진다.
3. **궤적 = 방향·가속.** 단일 값보다 12-bar sparkline 이 정보 밀도가 훨씬 높다.
4. **맥락 없는 숫자는 무용.** 모든 값에 percentile 배지 또는 range gauge 를 붙인다.
5. **정보 계층.** 레짐 배너 > 차트 > Pillar pane > evidence row > 보조. 위로 갈수록 큰 타입 + 강한 색.

---

## Archetype A — Percentile Gauge + Sparkline

### 용도

단일 값 지표 + 맥락. OI change, funding rate, volume ratio, ATR, skew, DVOL, netflow.

### 시각 목업

```
┌────────────────────────────┐
│ OI 1H                       │  ← 9px uppercase, g6 (label)
│ +3.27%  ▁▂▃▅▇█              │  ← 13px tabular-nums + 48×14 SVG spark
│ ───────●────                │  ← 3px track, percentile position dot
│ p95·30d                     │  ← 9px g5 (context)
└────────────────────────────┘
```

### 상호작용 레이어

| 레이어 | 내용 | 타입 | 색 |
|---|---|---|---|
| label | `OI 1H` | 9px uppercase | g6 |
| value | `+3.27%` (tabular) | 13px | threshold-driven |
| sparkline | 12 bar SVG path | stroke 1.2px | currentColor × 0.75 |
| gauge track | 0-100 scale line | 3px | currentColor × 0.12 |
| gauge dot | percentile position | 5px circle | currentColor |
| context | `p95·30d` | 9px | g5 |

### 색상 규칙 — tier by percentile

| tier | 조건 (abs(p−50)×2) | 예시 | 색 |
|---|---|---|---|
| neutral  | < warn    | p40 \| p55 | 무색 (g9) |
| warn     | ≥ warn    | p72 \| p27 | amber mild (35%) |
| extreme  | ≥ extreme | p92 \| p8  | amber strong (75%) |
| historical | ≥ historical | p98+ \| p2− | amber solid + 2s pulse |

### 규격

- 최소 폭 96px, 최대 폭 자유
- 패딩: 6px 10px
- 폰트: mono (`--sc-font-mono`)
- 다크 배경 가정 (현재 shell)

### 데이터 바인딩

```ts
value.current     = number
value.percentile  = { value: 0..100, window: '30d' }
value.sparkline   = number[]  // 12 points recommended
```

---

## Archetype B — Actor-Stratified Multi-Line

### 용도

같은 지표를 **행위 주체(actor)** 로 쪼갠 시계열. CVD by order size, LS ratio by venue, COT commercial vs spec, smart money cohort.

### 시각 목업

```
┌─────────────────────────────────────────────┐
│ CVD (normalized 0-1)                actor   │
│                                             │
│  1.0 ██████▇▆▅▄                   $1M+      │ ← whale (진한 line)
│  0.8       ▃▅▇▇▇▆▅▄▃                  $100k-$1M
│  0.6 ▇▆▅▄▃▂▁▁▂▃▅▇██▇                  $10k-$100k
│  0.4 ▄▃▂▁▁▂▃▄▅▆▇██                    $1k-$10k
│  0.2 ▂▁▁▂▃▄▅▆▇▇▇▆                     $100-$1k (소매)
│      └── 6h ago          └── now            │
│                                             │
│      ⚠ whale/retail DIVERGENCE: 3h+          │ ← amber + pulse
└─────────────────────────────────────────────┘
```

### 규격

- 높이 120px
- X 축: 시간 (최근 ~6h, 12 points)
- Y 축: normalized 0-1 (actor 별 min/max 정규화)
- 각 라인: 2px stroke
- 범례: 우측 컬럼 또는 inline label
- Divergence 감지 시 하단 amber 배너

### 색상 (actor별 고정)

| actor | 색 | 이유 |
|---|---|---|
| retail | blue 350 | 차가움, 소외감 |
| mid | green 400 | 기본 |
| whale | amber 500 | 주목 |
| commercial | cyan 500 | 기관 |
| spec | red 400 | 투기 |

### 데이터 바인딩

```ts
value.current = [
  { actor: 'whale',  label: '$1M+',      series: number[] },
  { actor: 'mid',    label: '$100k-$1M', series: number[] },
  { actor: 'retail', label: '<$100k',    series: number[] },
]
```

### Divergence 감지

대체로 whale − retail 의 20-bar 롤링 상관계수가 `< -0.4` 이면 "divergence". UI 에는 amber 배너.

---

## Archetype C — Price × Time Heatmap

### 용도

Liquidation clusters, orderbook depth, volume profile. 숫자가 아닌 **지도** 로 봐야 의미가 있는 데이터.

### 시각 목업

```
┌─────────────────────────────────────────────────────┐
│ LIQ MAP                 ● long  ● short             │  ← head (9px)
├─────────────────────────────────────────────────────┤
│$92.4k  ▒▒▒▒▒▒▒▒▒▒▓▓▓██████     ← long 자석          │
│$92.2k  ▒▒░░░░░░░▒▒▒▒▒▒                              │
│$92.0k  ░░░░░░░░░░░░░░░░                              │
│$91.8k  ● price ────────────────                      │  ← 현재가
│$91.6k  ░░░░░▒▒▒▒▒▓▓▓█                                │
│$91.4k  ░░░░▒▒▒▓▓▓████                                │  ← short 자석
│$91.0k  ▒▒░░░░░░░▒                                    │
│        ├─── 4h ago          now ──┤                   │
└─────────────────────────────────────────────────────┘
```

### 규격

- 높이 140-200px (컨텍스트에 따라)
- X: 시간 bucket (~40)
- Y: 가격 bucket (~30)
- 셀 색: side (long=pos green, short=neg red)
- 셀 투명도: log-scale intensity (0.05 ~ 1.0)
- 현재가: 차트 스케일과 맞춘 수평선 overlay
- Phase 1: SVG 렌더; Phase 2: Canvas / LWC custom series

### 색상 규칙

- 셀 자체는 side color (long/short 구분)
- 투명도는 log-scale (청산 규모 long-tail 대응)
- p99 클러스터는 solid + 얇은 white stroke
- 현재가 기준 ±1% 내 cluster 는 hover 시 강조

### 상호작용

- hover: tooltip (price bucket, time bucket, USD)
- 현재가와 교차하는 column 은 highlighted
- 클러스터 가까운 방향으로 "자석" 아이콘

### 데이터 바인딩

```ts
value.current = HeatmapCell[]
// HeatmapCell = { priceBucket, timeBucket, intensity, side, venue }
```

---

## Archetype D — Divergence Indicator

### 용도

두 시계열의 **관계** 표시. Price↔CVD, Price↔OI, Spot↔Futures CVD, Basis cross-venue.

### 시각 목업

```
┌──────────────────────────────────────┐
│ CVD vs PRICE                          │
│                                       │
│ Price  ▁▂▃▄▅▆▇█  ↗ rising             │
│ CVD    █▇▆▅▅▄▃  ↘ falling             │
│        ├── 5 bars ──┤                 │
│                                       │
│ ⚠ BEARISH DIVERGENCE    rank p92      │  ← amber + pulse
└──────────────────────────────────────┘
```

### 규격

- 높이 80-100px
- 2개 시리즈를 **겹치지 않는** 상하 섹션에 normalized 로 그림
- 각 시리즈 label + 화살표 (↗↘→) 현재 방향
- 지속 bar count 명시
- 역사적 rank percentile (30d)

### 감지 규칙

- bullish divergence: 가격 LL + CVD HL over 5+ bars
- bearish divergence: 가격 HH + CVD LH over 5+ bars
- aligned: corr > 0.7
- unknown: 데이터 부족 or corr ∈ [-0.4, 0.7]

### 색상

- bullish div: `--pos`
- bearish div: `--neg`
- aligned: 무색
- rank p95+: pulse

### 데이터 바인딩

```ts
value.current = DivergenceState
// { type, barsSince, strength (0-1), rankPercentile }
```

---

## Archetype E — Regime Badge + Flip Clock

### 용도

상태 + 마지막 전환 시각. Funding flip, CVD flip, gamma flip, market regime, compression onset.

### 시각 목업

```
┌────────────────────────────────────────────────┐
│ ↗  FUNDING       FLIPPED                        │  ← 18px arrow + 13px state
│    ⏱ 6h ago · persisted 18h                     │  ← 10px meta (clock)
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ •  REGIME        SQUEEZE                         │  ← neutral
│    ⏱ 2.1d ago · persisted 50 bars               │
└────────────────────────────────────────────────┘

┌────────────────────────────────────────────────┐
│ ↘  GAMMA FLIP    BELOW                          │  ← bearish red
│    ⏱ 42m ago                                    │
└────────────────────────────────────────────────┘
```

### 규격

- 전체 폭 row (너비 자유 flex)
- 높이 ~44px
- 큰 lead 문자(arrow) 18px + content column
- 방향 color: bull=pos / bear=neg / neutral=amber
- 배경: color-mix 10% 표준화
- persisted 시간이 길수록 시각 강도 유지 (안 사라지게)

### 상호작용

- 상단 배너에 최대 3개 동시 노출 (priority 기준)
- 클릭: 차트에 reversal marker drop
- hover: 상세 timeline tooltip

---

## Archetype F — Venue Divergence Strip

### 용도

**독점 기능.** 같은 지표를 거래소별로 쪼개서 나란히. OI per exchange, funding per exchange, basis, premium.

### 시각 목업

```
┌────────────────────────────────────────────────────────┐
│ OI / VENUE                       [Δ +3.27%] strong      │  ← divergence badge
│                                                         │
│ Binance   ████████████████    +3.27%   ▁▂▃▅▇▇█         │
│ Bybit     ███████████         +2.75%   ▁▂▃▄▅▆          │ ← amber (리더)
│ OKX       ████████            +2.00%   ▁▂▃▄▅           │
└────────────────────────────────────────────────────────┘
```

### 규격

- 최소 폭 220px
- 각 venue row: 58 + 1fr + 48 + 48 grid (venue | bar | value | spark)
- 바 길이: `Math.abs(current) / maxAbs × 100%`
- 리더 venue 색: amber (리더는 isolated pump 후보)
- 나머지: g9
- divergence 배지: max - min 이 threshold 이상일 때 amber + pulse

### 데이터 바인딩

```ts
value.current = VenueSeriesRow[]
// { venue, label, current, sparkline?, highlight? }
```

### 이 아키타입이 **업계 독점** 인 이유

Coinglass, Coinalyze, Laevitas 등 모든 경쟁사는 "venue 별 데이터"를 줄 뿐, **divergence 감지와 리더 표시**를 사용자에게 맡깁니다. 우리는 이걸 서버에서 자동 탐지하고 building block (`venue_oi_divergence`, `isolated_venue_pump`) 과 엮습니다.

---

## 패널 레이아웃 — /cogochi TradeMode 재구성

### Desktop 1280px

```
┌──────────────────────────────────────────────────────────────────────┐
│ TOP BANNER — Regime + Flip Clocks (Archetype E × 3)                 │
│ [↗ FUNDING FLIPPED 6h] [• SQUEEZE 2.1d] [↘ GAMMA BELOW 42m]           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│          MAIN CHART (candle + structure markers + gamma overlay)     │
│                                                                      │
├────────────────────────────┬─────────────────────────────────────────┤
│ LIQ HEATMAP (Arch C)       │ OPTIONS GEX/SKEW (Arch A × 2 + C)       │
│ Binance + Bybit + OKX      │ GEX bars by strike + Skew gauge         │
├────────────────────────────┴─────────────────────────────────────────┤
│ LIVE INDICATORS (Arch A row)                                          │
│ [OI 1h ▁▂▇█ p95] [Fund + pos] [Vol 1.8x p72] [Premium p45]            │
├──────────────────────────────────┬───────────────────────────────────┤
│ OI / VENUE (Arch F)              │ FUNDING / VENUE (Arch F)          │
│ Binance/Bybit/OKX 비교            │ Binance/Bybit/OKX 비교              │
├──────────────────────────────────┴───────────────────────────────────┤
│ CVD STRATIFIED (Arch B)                                              │
│ whale / mid / retail multi-line                                       │
├──────────────────────────────────────────────────────────────────────┤
│ NETFLOW (Arch A) + CVD DIVERGENCE (Arch D)                            │
└──────────────────────────────────────────────────────────────────────┘
```

### Mobile 375px (TradeMode 현재 레이아웃 기준)

```
┌───────────────────────┐
│ HEADER (symbol/tf)    │
├───────────────────────┤
│                       │
│     CHART             │
│                       │
├───────────────────────┤
│ ⚡ REGIME banner       │ ← Archetype E (1개만 — 가장 중요한 것)
├───────────────────────┤
│ LIVE INDICATORS row   │ ← Arch A × 3 gauges
│ [OI][Fund][Vol]       │
├───────────────────────┤
│ VENUE DIVERGENCE      │ ← Arch F stack
│ [OI 3venue strip]     │
│ [Fund 3venue strip]   │
├───────────────────────┤
│ LIQ HEATMAP           │ ← Arch C (140px)
├───────────────────────┤
│ evidence-grid (기존)   │ ← 후진 배치
└───────────────────────┘
│ tab-strip (기존)       │
└───────────────────────┘
```

---

## Color System — 공용 토큰

```css
:root {
  /* Neutral — ~p40-p60 구간용 */
  --ind-neutral: var(--g9, rgba(255, 255, 255, 0.85));

  /* Extreme tails */
  --ind-warn:       color-mix(in oklab, var(--amb, #f0b847) 35%, var(--g9));
  --ind-extreme:    var(--amb, #f0b847);
  --ind-historical: var(--amb, #f0b847);  /* + pulse */

  /* Direction-aware (used by E, F, D) */
  --ind-bull: var(--pos, #4fb872);
  --ind-bear: var(--neg, #d66c7a);

  /* Heatmap side (C) */
  --ind-heat-long:  var(--pos, #4fb872);
  --ind-heat-short: var(--neg, #d66c7a);
}

@keyframes ind-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
```

**규칙:** 모든 archetype 은 이 토큰을 사용. theme 변환(light/dark, custom) 은 토큰만 바꾸면 됨.

---

## 상호작용 패턴 — 공용

| 동작 | 모든 archetype |
|---|---|
| hover | tooltip with description + 상세 값 |
| click | 해당 indicator 상세 시트 open (future phase) |
| long-press (mobile) | 해당 indicator 토글 (visibility) |
| 상태 변경 | 50-300ms transition (bar width, color tier) |

## 접근성

- 모든 컴포넌트 `role` / `aria-label` / `title` 제공
- 색 의존 금지 — 아이콘(↗↘•✓✗) + 텍스트 레이블 병행
- 시각장애 사용자용 screen-reader 요약 문자열 생성
- keyboard focusable (Tab 순서는 priority 기반)

## 성능 목표

| 메트릭 | 기준 |
|---|---|
| 500 user 동시 렌더 | 60fps 유지 (DOM 최소화) |
| Archetype C (Heatmap) 셀 수 | Phase 1 ≤ 500, Phase 2 canvas ≤ 5000 |
| sparkline 재계산 | $derived 의존성 최소 (ref 로만 갱신) |
| bundle 영향 | indicators/ 총 ≤ 15KB gzipped |

## 테스트 매트릭스 (Phase 1)

| Archetype | 렌더 | 데이터 없음 | 극단값 | 장기값 | 다국어 label |
|---|---|---|---|---|---|
| A | ✓ | ✓ (skip) | ✓ | - | KR/EN OK |
| C | ✓ | ✓ empty | ✓ | ✓ | - |
| E | ✓ | ✓ (`—`) | ✓ | ✓ | - |
| F | ✓ | ✓ empty | ✓ | - | KR/EN OK |
| B | Phase 2 | | | | |
| D | Phase 2 | | | | |

---

## Related

- `docs/domains/indicator-registry.md` — 타입/레지스트리 본체
- `work/active/W-0122-free-indicator-stack.md` — 슬라이스 실행 계획
- `docs/product/competitive-indicator-analysis-2026-04-21.md` — 경쟁 대비 근거
- `docs/decisions/ADR-008-chartboard-single-ws-ownership.md` — WS 규율 (Arch C 렌더러 준수)
