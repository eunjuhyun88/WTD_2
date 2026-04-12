# Terminal Chart Block Engine Design

Status: draft  
Date: 2026-04-11  
Surface: `terminal`  
Owner: Codex design pass

## 1. Problem

Current `/terminal` has a widget-capable chat feed, but it still behaves like a text-first assistant with summary cards.

What exists today:
- chat feed accepts `metrics`, `layers`, `scan_list`, `actions`, and a `chart` reference
- right-side chart panel renders one focus chart with OHLC + volume + BB/EMA overlays
- backend `analyze_market` already fetches richer flow inputs: depth, OI history, taker ratio series, force-orders, 5m/1h/1d klines, BTC context

Why this is insufficient:
- inline feed cannot render real charts inside the chat stream
- metric cards use synthetic sparkline arrays, not actual interval series
- tool results collapse rich source data into a shallow snapshot
- the user cannot see “what changed vs 1h/4h/24h” as a first-class visual object
- CryptoQuant/Material Indicators style views require multiple chart grammars, not one generic candlestick panel

## 2. Goal

Turn the terminal chat stream into a `research block engine`:
- text explains
- blocks visualize
- right panel inspects the selected block in detail

The feed must be able to render:
- real inline charts, not placeholders
- current value + prior-window comparison + deltas
- multi-series flow panels
- heatmaps with price overlay
- regime / event annotations

## 3. Non-Goals

- Replacing the existing verdict engine
- Rewriting raw provider infrastructure
- Full CryptoQuant catalog in v1
- Pixel-identical reproduction of third-party products
- Introducing a new charting library for every block type

## 4. Design Principles

1. Data contracts stay layered:
   `raw.* → feat.* → event.* → state.* → verdict.* → view.*`

2. Chart blocks do not read provider payloads directly.
   They only consume normalized `view.*` data assembled server-side.

3. The chat stream owns narrative sequence.
   The right panel owns focused inspection.

4. Every block must answer:
   - what is the current value?
   - what changed?
   - over which window?
   - why does it matter?

5. No fake sparklines in research mode.
   If a block implies historical movement, it must be backed by real time-series data.

## 5. Proposed New Contract Layer

Add a new contract layer after `verdict.*` for terminal presentation:

```text
raw.* → feat.* → event.* → state.* → verdict.* → view.* → intx.*
```

Purpose of `view.*`:
- stable, typed, UI-facing blocks
- reusable by terminal chat, right-side focus panel, future exports, screenshots
- decouple rendering from engine internals

Examples:
- `view.symbol.price_ohlcv.inline`
- `view.symbol.flow.dual_pane`
- `view.symbol.liquidation.heatmap`
- `view.symbol.metric_strip`
- `view.symbol.layer_score_board`
- `view.symbol.event_timeline`

## 6. Rendering Model

### 6.1 Layout

Desktop:

```text
LEFT   = scanner / symbol picker
CENTER = chat research stream
RIGHT  = focus inspector
```

Interaction model:
- DOUNI streams text and block payloads in sequence
- each block renders inline in the chat stream
- clicking a block sets it as the active `focus inspector` payload on the right
- the right panel may show expanded scales, tooltip details, toggles, and raw stat tables

### 6.2 Message Composition

One assistant response becomes:

1. narrative text
2. metric strip
3. primary inline chart
4. flow panel
5. optional heatmap
6. score board / event board
7. action row

This is not “a message with cards”.
It is “a research report composed of typed blocks”.

## 7. Chart Block Registry

V1 block kinds:

### 7.1 `metric_strip`

Use case:
- fast current-value comparison with prior windows

Shows:
- current
- vs 1h / 4h / 24h / 7d
- absolute delta
- percent delta
- percentile or z-score when meaningful

Initial metrics:
- price
- CVD
- open interest
- funding
- long/short ratio
- bid/ask ratio
- liquidation total

### 7.2 `inline_price_chart`

Use case:
- inline OHLC context in the chat stream

Shows:
- candlesticks
- volume
- vertical markers for comparison windows
- optional event markers
- optional support/resistance overlays

### 7.3 `dual_pane_flow_chart`

Use case:
- price vs flow comparison in one glance

Top pane:
- price candlestick or close line

Bottom pane:
- CVD line/area
- OI line
- funding histogram or line
- optional taker ratio line

### 7.4 `multi_series_cvd_chart`

Use case:
- whale/small-order decomposition

Shows:
- all orders
- small / medium / large / whale buckets
- normalized CVD across one shared time axis

### 7.5 `heatmap_flow_chart`

Use case:
- liquidation / liquidity wall / depth concentration

Shows:
- heatmap cells on background
- price overlay line
- optional lower pane CVD decomposition

Note:
- this requires a canvas heatmap layer
- lightweight-charts alone is not sufficient for the heatmap plane

### 7.6 `stacked_regime_chart`

Use case:
- UTXO age bands, holder cohorts, realized cap composition, regime shares

Shows:
- stacked area bands
- price line overlay
- regime annotation labels

### 7.7 `signal_chart`

Use case:
- Sharpe, MVRV, z-score, oscillator-like contextual metrics

Shows:
- price line on top or shared axis
- indicator line
- threshold bands
- event callouts

### 7.8 `layer_score_board`

Use case:
- audit of L1~L19 contributions

Shows:
- signed scores
- dominant layers
- direction coloring
- tooltip with source events

### 7.9 `event_timeline`

Use case:
- what changed and when

Shows:
- funding flips
- squeeze events
- liquidation clusters
- breakout events
- divergence detections

## 8. Data Contract

### 8.1 Shared Envelope

```ts
type ResearchBlockEnvelope = {
  schemaVersion: 'research_block_v1';
  traceId: string;
  symbol: string;
  timeframe: '1m' | '5m' | '15m' | '1h' | '4h' | '1d';
  asOf: string;
  title?: string;
  summary?: string;
  block: ResearchBlock;
};
```

### 8.2 Registry Union

```ts
type ResearchBlock =
  | MetricStripBlock
  | InlinePriceChartBlock
  | DualPaneFlowChartBlock
  | MultiSeriesCvdChartBlock
  | HeatmapFlowChartBlock
  | StackedRegimeChartBlock
  | SignalChartBlock
  | LayerScoreBoardBlock
  | EventTimelineBlock;
```

### 8.3 Shared Series Primitives

```ts
type TimePoint = { t: number; v: number | null };

type CandlePoint = {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number | null;
};

type CompareWindow = {
  key: '1h' | '4h' | '8h' | '24h' | '7d' | '30d';
  startTs: number;
  endTs: number;
  baselineValue: number | null;
  currentValue: number | null;
  deltaAbs: number | null;
  deltaPct: number | null;
};

type EventMarker = {
  id: string;
  ts: number;
  label: string;
  direction: 'bull' | 'bear' | 'neutral' | 'context';
  severity: 'low' | 'medium' | 'high';
};
```

### 8.4 Metric Strip

```ts
type MetricCompare = {
  metricId: string;
  label: string;
  unit: 'usd' | 'pct' | 'ratio' | 'count' | 'usd_compact' | 'custom';
  current: number | null;
  compare: CompareWindow[];
  percentile?: number | null;
  zScore?: number | null;
  interpretation?: string;
  sourceIds: string[]; // raw.* / feat.* / event.*
};

type MetricStripBlock = {
  kind: 'metric_strip';
  metrics: MetricCompare[];
};
```

### 8.5 Inline Price Chart

```ts
type InlinePriceChartBlock = {
  kind: 'inline_price_chart';
  series: CandlePoint[];
  compareWindows: CompareWindow[];
  overlays?: {
    srLevels?: Array<{ price: number; label: string; strength?: number }>;
    bands?: Array<{ id: string; points: TimePoint[] }>;
    lines?: Array<{ id: string; label: string; points: TimePoint[] }>;
  };
  markers?: EventMarker[];
};
```

### 8.6 Dual-Pane Flow

```ts
type DualPaneFlowChartBlock = {
  kind: 'dual_pane_flow_chart';
  topPane: {
    price: CandlePoint[] | TimePoint[];
  };
  bottomPane: {
    series: Array<{
      id: 'cvd' | 'oi' | 'funding' | 'taker_ratio' | 'ls_ratio';
      label: string;
      axis: 'left' | 'right';
      mode: 'line' | 'area' | 'histogram';
      points: TimePoint[];
    }>;
  };
  compareWindows: CompareWindow[];
  markers?: EventMarker[];
};
```

### 8.7 Heatmap

```ts
type HeatmapBin = {
  ts: number;
  priceLow: number;
  priceHigh: number;
  intensity: number;
  bucket?: string;
};

type HeatmapFlowChartBlock = {
  kind: 'heatmap_flow_chart';
  heatmap: HeatmapBin[];
  price: TimePoint[];
  secondarySeries?: Array<{
    id: string;
    label: string;
    points: TimePoint[];
  }>;
  compareWindows: CompareWindow[];
  markers?: EventMarker[];
};
```

## 9. Dataset Mapping to Existing Structure

This design must not bypass the current dataset structuring effort.

### 9.1 Raw inputs already present

From `KnownRawId` and the DOUNI tool executor:
- `raw.symbol.klines.{5m,1h,4h,1d}`
- `raw.symbol.funding_rate`
- `raw.symbol.open_interest.point`
- `raw.symbol.oi_hist.{5m,1h,display_tf}`
- `raw.symbol.taker_buy_sell_ratio`
- `raw.symbol.depth.l2_20`
- `raw.symbol.force_orders.{1h,4h}`
- `raw.global.fear_greed.value`
- BTC on-chain and mempool raws

### 9.2 Features we should normalize next

Current `feat.*` registry is too thin for rich blocks.

We should add:
- `feat.flow.cvd.raw`
- `feat.flow.cvd.delta_1h`
- `feat.flow.cvd.delta_4h`
- `feat.flow.cvd.delta_24h`
- `feat.flow.oi.current`
- `feat.flow.oi.delta_pct_1h`
- `feat.flow.oi.delta_pct_4h`
- `feat.flow.funding.current`
- `feat.flow.funding.percentile_30d`
- `feat.flow.ls_ratio.current`
- `feat.flow.bid_ask_ratio.current`
- `feat.flow.liquidation.total_1h`
- `feat.flow.liquidation.total_4h`
- `feat.flow.depth.wall_near_mid`
- `feat.market.price.change_pct_{1h,4h,24h}`

For higher-order blocks:
- `feat.onchain.utxo_age_band.*`
- `feat.risk.sharpe.short_term`
- `feat.risk.sharpe.long_term`
- `feat.market.realized_cap_age_band.*`

### 9.3 Events we should expose to blocks

Blocks should annotate with typed events, not ad-hoc text:
- `event.flow.fr_extreme_positive`
- `event.flow.fr_extreme_negative`
- `event.flow.short_squeeze_active`
- `event.flow.long_cascade_active`
- `event.cvd.bearish_divergence`
- `event.cvd.bullish_divergence`
- `event.cvd.absorption_buy`
- `event.cvd.absorption_sell`
- `event.breakout.range_high_reclaim`
- `event.breakout.range_low_loss`

### 9.4 View assembly rule

`view.*` assemblers must:
- consume `raw.*`, `feat.*`, `event.*`, `verdict.*`
- compute compare windows and chart-ready series
- be the only place that knows block-specific UI payload shapes

This avoids route-level ad-hoc transformation.

## 10. Server Architecture

Add a new terminal-facing assembly layer:

```text
providers/rawSources
  ↓
feature calculators
  ↓
event detectors
  ↓
verdict assembler
  ↓
research view assembler
  ↓
SSE block stream
```

Proposed modules:
- `src/lib/server/researchView/seriesBuilders.ts`
- `src/lib/server/researchView/compareWindows.ts`
- `src/lib/server/researchView/blockRegistry.ts`
- `src/lib/server/researchView/buildResearchBlocks.ts`

DOUNI flow change:
- tool execution still returns typed engine data
- server additionally emits `research_block` SSE events
- frontend appends those blocks directly into the feed

## 11. SSE Contract Extension

Add:

```ts
type DouniSSEEvent =
  | { type: 'research_block'; payload: ResearchBlockEnvelope }
  | existing events...
```

Rules:
- `text_delta` explains intent
- `research_block` carries visuals
- `tool_result` remains for debugging / compatibility

The UI should stop synthesizing rich widgets from shallow `tool_result` payloads once block events are live.

## 12. Frontend Architecture

### 12.1 Replace Current Widget Model

Current route-level model:
- `metrics`
- `layers`
- `scan_list`
- `actions`
- `chart_ref`

New model:
- keep simple widgets for compatibility
- introduce `research_blocks: ResearchBlockEnvelope[]`
- render via a block registry

Proposed structure:

```text
src/components/terminal/research/
  ResearchBlockRenderer.svelte
  blocks/
    MetricStripBlock.svelte
    InlinePriceChartBlock.svelte
    DualPaneFlowChartBlock.svelte
    MultiSeriesCvdChartBlock.svelte
    HeatmapFlowChartBlock.svelte
    SignalChartBlock.svelte
    LayerScoreBoardBlock.svelte
    EventTimelineBlock.svelte
```

### 12.2 Rendering technology

- `lightweight-charts` remains for:
  - candlesticks
  - line/area/histogram overlays
  - dual-pane time-series

- custom canvas layer is added for:
  - heatmap tiles
  - dense regime background maps

- SVG/HTML overlay is used for:
  - annotations
  - callouts
  - compare-window labels

### 12.3 Focus inspector

Right panel behavior:
- clicking any inline block hydrates the same payload into the right panel
- right panel can show:
  - larger canvas
  - expanded legend
  - exact numeric table
  - source provenance
  - compare-window toggles

## 13. V1 Scope

Ship in this order:

### V1-A
- `metric_strip`
- `inline_price_chart`
- `dual_pane_flow_chart`
- `research_block` SSE event

Reason:
- highest signal
- uses existing raws already in the tool executor
- no new heatmap renderer yet

### V1-B
- `layer_score_board`
- `event_timeline`
- focus inspector sync

### V1-C
- `heatmap_flow_chart`
- `multi_series_cvd_chart`

### V1-D
- `stacked_regime_chart`
- `signal_chart` variants for Sharpe / MVRV / on-chain cohorts

## 14. Implementation Milestones

### M1. Contract foundation

Done when:
- `view.*` namespace decision is accepted
- `ResearchBlock` zod schema exists
- SSE supports `research_block`

### M2. Inline price + metric strip

Done when:
- chat shows real inline chart instead of `Chart loaded`
- metric strip uses actual compare windows and real historical points

### M3. Flow panel

Done when:
- one assistant response can show price + CVD/OI/Funding aligned on one time axis
- right inspector can expand the selected flow block

### M4. Heatmap

Done when:
- liquidation/liquidity density can render as a proper heatmap layer
- price overlay and compare windows remain readable

## 15. Risks

1. Contract sprawl
- if `view.*` is not typed, route code will regress into ad-hoc payloads

2. Overloading `tool_result`
- if we keep deriving blocks from raw tool payloads in the UI, the design collapses

3. Time-axis mismatch
- all compare windows and sub-series must resolve to one canonical timeline

4. Renderer fragmentation
- do not build each block with a different chart stack

5. Performance
- heatmap and multi-series panels need clipping, downsampling, and windowed rendering

## 16. Open Questions

1. Should `view.*` contracts live under `src/lib/contracts/` beside `verdict.ts`?
2. Do we want one SSE event per block or one bundled `research_report` event?
3. For heatmaps, is the initial authority liquidation intensity, orderbook depth intensity, or both?
4. Should compare windows always be fixed (`1h/4h/24h/7d`) or block-specific?
5. Does the right panel keep the existing symbol chart as a default fallback when no block is selected?

## 17. Recommendation

Adopt `view.*` as the official presentation contract for terminal research.

First implementation slice:
- wire `research_block` SSE
- add `ResearchBlockRenderer`
- replace `chart_ref` with real inline `inline_price_chart`
- replace fake metric sparks with `metric_strip`
- add `dual_pane_flow_chart` using existing `oiHistory`, `takerData`, funding, and derived CVD series

That gets the product from “chat + summary cards” to “real inline research”.
