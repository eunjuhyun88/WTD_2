# Indicator Registry — Domain Model

## Purpose

80+ building blocks + 신규 15 pillar blocks (W-0122) 를 **선언형 메타데이터** 로 등록하여, UI 가 archetype 기반 자동 렌더를 수행하게 한다. 결과적으로:

1. 새 지표 추가 = `IndicatorDef` 1개 등록 → UI 자동 반영
2. 사용자가 체크박스로 표시 지표 선택 가능
3. 같은 지표를 다른 archetype 으로 보여주는 것이 trivial
4. 지표 검색/필터링 (family/dimension/archetype 기준) 가능

## Core Concept — Indicator 는 값이 아니라 **다차원 객체**

전통적 접근: `oi_change_1h = +3.8%`

Registry 접근:

```ts
{
  id: 'oi_change',
  family: 'OI',
  archetype: 'A',              // percentile gauge + sparkline
  dimensions: ['horizon', 'venue', 'percentile'],
  value: { current: 0.038, percentile_30d: 92, sparkline: [...] },
  thresholds: { warn: 75, extreme: 95 },
  source: { provider: 'coinalyze', endpoint: '/oi/delta?...' }
}
```

UI 는 `archetype` 만 보고 렌더러를 선택하면 됨.

## Archetypes (6)

| ID | 이름 | 차원 | 렌더러 컴포넌트 | 사용처 |
|---|---|---|---|---|
| **A** | Percentile Gauge + Sparkline | 1D (값) + 궤적 | `<IndicatorGauge/>` | OI change, funding rate, volume ratio, ATR, skew, DVOL, netflow |
| **B** | Actor-Stratified Multi-Line | 2D (값 × 주체) | `<IndicatorStratified/>` | CVD by size, LS ratio, COT positioning, smart money cohorts |
| **C** | Price × Time Heatmap | 2D (시간 × 가격, 강도) | `<IndicatorHeatmap/>` | Liquidations, orderbook depth, volume profile |
| **D** | Divergence Indicator | 2D (두 시계열 상관) | `<IndicatorDivergence/>` | CVD↔price, OI↔price, spot↔futures, basis cross-venue |
| **E** | Regime Badge + Flip Clock | 상태 + 시간 | `<IndicatorRegime/>` | Funding flip, CVD flip, BTC dominance regime |
| **F** | Venue Divergence Strip | mini multi-line per venue | `<IndicatorVenueStrip/>` | OI per exchange, funding per exchange, premium |

## Type Surface

```ts
// app/src/lib/indicators/types.ts

export type IndicatorFamily =
  | 'PriceAction' | 'OI' | 'Funding' | 'CVD' | 'Volume'
  | 'Orderbook' | 'Liquidations' | 'Premium' | 'SmartMoney'
  | 'COT' | 'Volatility' | 'MovingAverage' | 'Structure'
  | 'RelativeStrength' | 'Options' | 'Netflow' | 'Social';

export type IndicatorArchetype = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export type Dimension =
  | 'horizon'        // 1h / 4h / 24h / 7d
  | 'venue'          // binance / bybit / okx / coinbase / deribit
  | 'actor'          // retail / mid / whale / commercial / spec
  | 'percentile'     // rolling window percentile
  | 'price_level'    // for heatmaps
  | 'strike' | 'expiry'  // options-specific
  | 'side'           // long / short / buy / sell
  | 'regime';        // bull / bear / range / squeeze

export interface IndicatorDef {
  /** 고유 식별자, snake_case */
  id: string;

  /** 그룹핑 */
  family: IndicatorFamily;

  /** UI 렌더러 선택 */
  archetype: IndicatorArchetype;

  /** 이 지표가 가진 자연 축 */
  dimensions: Dimension[];

  /** 데이터 소스 */
  source: {
    provider: 'binance' | 'bybit' | 'okx' | 'deribit' | 'coinbase'
            | 'coinalyze' | 'arkham' | 'glassnode' | 'lunarcrush'
            | 'cftc' | 'onchain' | 'derived';
    endpoint?: string;
    stream?: string;
    auth?: 'public' | 'api_key' | 'paid';
  };

  /** color/alert thresholds (percentile scale 0-100) */
  thresholds?: {
    warn: number;     // 예: 75 → amber 연하게
    extreme: number;  // 예: 95 → amber 진하게
    historical?: number;  // 예: 99 → pulse
  };

  /** UI 렌더 우선순위 (lower first) */
  priority: 0 | 1 | 2 | 3;

  /** 기본 visibility (사용자가 토글 가능) */
  defaultVisible: boolean;

  /** 선택: 연관된 building block id (confluence engine 용) */
  relatedBlocks?: string[];

  /** 선택: 간단 설명 (UI tooltip 용) */
  description?: string;
}

export interface IndicatorValue {
  /** 현재 값 (archetype 에 따라 구조 다름) */
  current: number | Record<string, number> | HeatmapCell[];

  /** percentile band 위치 (archetype A, D 필수) */
  percentile?: { value: number; window: '30d' | '90d' | '1y' };

  /** sparkline 궤적 (archetype A 권장) */
  sparkline?: number[];

  /** 방향 + 강도 (archetype E) */
  state?: {
    label: string;            // 'FLIP' / 'EXTREME' / 'NORMAL'
    direction: 'bull' | 'bear' | 'neutral';
    flippedAt?: string;       // ISO timestamp
    persistedBars?: number;
  };

  /** timestamp */
  at: number;
}

export interface HeatmapCell {
  priceBucket: number;
  timeBucket: number;
  intensity: number;    // USD or count
  side?: 'long' | 'short' | 'bid' | 'ask';
  venue?: string;
}
```

## Registry 구현 형태

```ts
// app/src/lib/indicators/registry.ts

import type { IndicatorDef } from './types';

export const INDICATOR_REGISTRY: Record<string, IndicatorDef> = {
  // ── OI family ───────────────────────────────────────────────────
  oi_change_1h: {
    id: 'oi_change_1h',
    family: 'OI',
    archetype: 'A',
    dimensions: ['horizon', 'percentile'],
    source: { provider: 'coinalyze', endpoint: '/oi/delta?horizon=1h' },
    thresholds: { warn: 75, extreme: 95, historical: 99 },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: ['oi_change', 'oi_acceleration', 'oi_hold_after_spike'],
  },

  oi_per_venue: {
    id: 'oi_per_venue',
    family: 'OI',
    archetype: 'F',
    dimensions: ['venue', 'horizon'],
    source: { provider: 'coinalyze', endpoint: '/oi/per-venue' },
    priority: 1,
    defaultVisible: true,
    relatedBlocks: ['oi_exchange_divergence', 'venue_oi_divergence_bull', 'venue_oi_divergence_bear'],
  },

  // ── Funding family ──────────────────────────────────────────────
  funding_rate: {
    id: 'funding_rate',
    family: 'Funding',
    archetype: 'A',
    dimensions: ['horizon', 'percentile', 'regime'],
    source: { provider: 'coinalyze', endpoint: '/funding' },
    thresholds: { warn: 75, extreme: 95 },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: ['funding_extreme', 'funding_flip', 'positive_funding_bias', 'negative_funding_bias'],
  },

  // ── Liquidations (Pillar 1) ─────────────────────────────────────
  liq_heatmap: {
    id: 'liq_heatmap',
    family: 'Liquidations',
    archetype: 'C',
    dimensions: ['price_level', 'venue', 'side'],
    source: { provider: 'binance', stream: '!forceOrder@arr' },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: ['liq_magnet_above', 'liq_magnet_below', 'multi_venue_liq_cascade'],
  },

  // ── Options (Pillar 2) ──────────────────────────────────────────
  options_skew_25d: {
    id: 'options_skew_25d',
    family: 'Options',
    archetype: 'A',
    dimensions: ['percentile'],
    source: { provider: 'deribit', stream: 'ticker.BTC-*' },
    thresholds: { warn: 75, extreme: 95 },
    priority: 1,
    defaultVisible: true,
    relatedBlocks: ['skew_extreme_fear', 'skew_extreme_greed'],
  },

  gamma_flip_level: {
    id: 'gamma_flip_level',
    family: 'Options',
    archetype: 'E',
    dimensions: ['price_level', 'regime'],
    source: { provider: 'deribit', endpoint: '/options/gex' },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: ['gamma_flip_proximity'],
  },

  // ── Netflow (Pillar 4) ──────────────────────────────────────────
  exchange_netflow: {
    id: 'exchange_netflow',
    family: 'Netflow',
    archetype: 'A',
    dimensions: ['venue', 'horizon', 'percentile'],
    source: { provider: 'arkham', endpoint: '/netflow/{exchange}' },
    thresholds: { warn: 80, extreme: 95 },
    priority: 0,
    defaultVisible: true,
    relatedBlocks: ['exchange_netflow_inflow_spike', 'exchange_netflow_outflow_persistent'],
  },

  // ... (80+ 기존 block + 15 신규)
};

// Helpers
export function byFamily(family: IndicatorFamily): IndicatorDef[] {
  return Object.values(INDICATOR_REGISTRY).filter(d => d.family === family);
}

export function byArchetype(archetype: IndicatorArchetype): IndicatorDef[] {
  return Object.values(INDICATOR_REGISTRY).filter(d => d.archetype === archetype);
}
```

## UI Dispatcher

```svelte
<!-- app/src/lib/components/indicators/IndicatorRenderer.svelte -->
<script lang="ts">
  import type { IndicatorDef, IndicatorValue } from '$lib/indicators/types';
  import IndicatorGauge from './IndicatorGauge.svelte';
  import IndicatorStratified from './IndicatorStratified.svelte';
  import IndicatorHeatmap from './IndicatorHeatmap.svelte';
  import IndicatorDivergence from './IndicatorDivergence.svelte';
  import IndicatorRegime from './IndicatorRegime.svelte';
  import IndicatorVenueStrip from './IndicatorVenueStrip.svelte';

  interface Props {
    def: IndicatorDef;
    value: IndicatorValue;
  }

  let { def, value }: Props = $props();
</script>

{#if def.archetype === 'A'}
  <IndicatorGauge {def} {value} />
{:else if def.archetype === 'B'}
  <IndicatorStratified {def} {value} />
{:else if def.archetype === 'C'}
  <IndicatorHeatmap {def} {value} />
{:else if def.archetype === 'D'}
  <IndicatorDivergence {def} {value} />
{:else if def.archetype === 'E'}
  <IndicatorRegime {def} {value} />
{:else if def.archetype === 'F'}
  <IndicatorVenueStrip {def} {value} />
{/if}
```

## Color System

모든 renderer 가 공유하는 intensity scale:

```css
/* tokens/indicator-colors.css */
:root {
  --ind-neutral:   color-mix(in oklab, currentColor 0%, transparent);
  --ind-warn:      color-mix(in oklab, var(--amber) 35%, transparent);
  --ind-extreme:   color-mix(in oklab, var(--amber) 75%, transparent);
  --ind-historical: var(--amber);  /* solid + pulse animation */

  --ind-bear-warn: color-mix(in oklab, var(--blue) 35%, transparent);
  --ind-bear-extreme: var(--blue);
}

.ind-thresh-p50-p75 { color: var(--ind-neutral); }    /* 주목 불필요 */
.ind-thresh-p75-p95 { color: var(--ind-warn); }
.ind-thresh-p95-p99 { color: var(--ind-extreme); }
.ind-thresh-p99-plus { color: var(--ind-historical); animation: pulse 2s infinite; }
```

**규칙:** p50 근처는 **무색**. 시선이 극단에만 꽂히도록.

## Engine Side Contract

engine 이 analyze envelope 에 추가해야 할 필드:

```python
# engine/api/schemas/analyze.py
class IndicatorValueWire(BaseModel):
    id: str                              # indicator_def.id
    current: float | dict | list         # archetype 별 구조
    percentile: dict | None = None       # {"value": 92, "window": "30d"}
    sparkline: list[float] | None = None
    state: dict | None = None
    at: int                              # unix ms

class AnalyzeEnvelope(BaseModel):
    # ... 기존 필드
    indicators: list[IndicatorValueWire]  # 새 필드 — registry-shaped
    confluence: ConfluenceResult          # W-0122 Confluence Engine 출력
```

engine 은 registry 를 구독해서 각 indicator 에 대해 `IndicatorValueWire` 를 채워준다. app 은 `INDICATOR_REGISTRY[wire.id]` 로 메타데이터 조회 후 dispatcher 에 전달.

## Migration Plan

### Phase 1 — Registry 정의 및 신규 Pillar blocks 등록 (W-0122 slice별)

- `docs/domains/indicator-registry.md` (본 문서) 확정
- `app/src/lib/indicators/types.ts` + `registry.ts` 생성
- Pillar 1/2/3/4 신규 block 15개 먼저 등록 (신규는 자유)

### Phase 2 — 기존 80+ blocks 점진적 register

- 각 building block 을 registry entry 로 등록
- `evidenceItems` 같은 하드코딩 배열을 registry 조회로 교체
- 기존 컴포넌트가 `IndicatorRenderer` 사용하도록 전환

### Phase 3 — 사용자 커스터마이징

- 사용자별 visible indicator set store (IndexedDB)
- drag-drop 으로 pane 배치 변경
- archetype 변환 (같은 지표를 다른 렌더러로)

## Non-Goals

- 외부 public registry (다른 앱이 import 가능한 npm 패키지) — 현재는 monorepo 내부 자산.
- per-user indicator editor (수식 편집 UI) — Phase 4 이후.
- 실시간 registry hot-reload — build-time static.

## References

- `work/active/W-0122-free-indicator-stack.md` — 이 registry 를 채울 주 작업
- `docs/decisions/ADR-008-chartboard-single-ws-ownership.md` — WS 규율 (Archetype C 렌더러가 지켜야 할 것)
- `docs/product/competitive-indicator-analysis-2026-04-21.md` — 어떤 indicator 를 등록할지 근거
