# W-0210 — Terminal Data Visualization Layers
**CTO Design Document** | Author: AI-CTO | Date: 2026-04-25

---

## 1. Executive Summary

The terminal's core value proposition is **data-dense, real-time alpha extraction**. 
Users hold three simultaneous questions while reading a chart:
1. *What is the market structure right now?* (Layer 1 — chart overlays)
2. *Where is smart money positioned?* (Layer 2 — whale tracking)
3. *How does this asset compare to benchmark?* (Layer 3 — multi-asset)
4. *What macro event is affecting price?* (Layer 4 — news impact)

This document defines the contract, data flow, cost model, and implementation sequence for all four layers.

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                        BROWSER (SvelteKit)                           │
│                                                                       │
│  ChartBoard.svelte                                                    │
│  ├── candle series (lightweight-charts)                               │
│  ├── [L1] AlphaOverlayPrimitive — boxes / lines / labels             │
│  ├── [L2] WhaleLinePrimitive — liquidation price lines               │
│  ├── [L3] ComparisonLineSeries — normalized BTC overlay              │
│  └── alphaMarkers [] → createSeriesMarkers()                         │
│                                                                       │
│  WorkspacePanel.svelte  ← always-visible sub-pane (148px)            │
│  RightRailPanel.svelte  ← [L2] WhaleWatch card                       │
│  AlphaMarketBar.svelte  ← [L4] news flash strip                      │
│                                                                       │
│  Data stores                                                          │
│  ├── alphaMarkersStore  — L1 phase markers (from /api/cogochi/analyze)│
│  ├── whaleStore         — L2 Hyperliquid top positions               │
│  ├── comparisonStore    — L3 normalized BTC/ETH series               │
│  └── newsFlashStore     — L4 macro event timestamps                  │
└──────────────────────────────────────────────────────────────────────┘
           │                     │                     │
           ▼                     ▼                     ▼
  /api/cogochi/analyze   api.hyperliquid.xyz   /api/cogochi/news
  (existing engine)      (free public API)     (future: newsquawk/RSS)
```

### Compute boundaries
| Layer | Where computed | Latency target | Cache TTL |
|-------|----------------|----------------|-----------|
| L1 markers | Engine (existing) | 0ms (re-use analyze response) | per-analyze |
| L2 whale positions | Browser fetch → Hyperliquid | 800ms | 60s |
| L3 comparison | Browser (arithmetic on existing OHLCV) | 0ms | per-candle |
| L4 news | Engine → RSS parse | 5s | 300s |

### Cost model
| Layer | Cost |
|-------|------|
| L1 | **$0** — uses existing analyze LLM call output |
| L2 | **$0** — Hyperliquid public leaderboard API, no auth, no cost |
| L3 | **$0** — client-side normalization of existing OHLCV data |
| L4 | **$0** (phase 1 via free CryptoPanic RSS) / ~$30/mo (Newsquawk) |

**Total net-new cost: $0 for L1–L3.**

---

## 3. Layer 1 — Chart Marker Automation

### 3.1 Goal
Transform existing engine analysis outputs (Wyckoff phase, CVD divergence,
MTF alignment, breakout signals, ATR levels) into automatic lightweight-charts
visual overlays. Zero new data sources. Zero new API calls.

### 3.2 Current engine outputs (already in analyze response)
```typescript
// PanelAnalyzeData shape (engine output, already used in WorkspacePanel)
{
  direction: 'bullish' | 'bearish' | 'neutral',
  phase: string,          // "Wyckoff Accumulation Phase B", etc.
  evidence: Evidence[],
  deep: {
    atr_levels: {
      tp1_long: number, tp1_short: number,
      stop_long: number, stop_short: number,
    },
    wyckoff_phase: string,
    cvd_divergence: string,
    mtf_alignment: string,
    breakout_signal: string,
  },
  alphaMarkers: Array<{ timestamp: number; phase: string; label: string; color?: string }>,
}
```

### 3.3 Visual primitives to add
| Signal | Visual | Primitive |
|--------|--------|-----------|
| Wyckoff phase boundary | Vertical dashed line + phase label | `createSeriesMarkers` shape='text' |
| CVD divergence | Colored box spanning divergence window | `ISeriesApi.attachPrimitive(RangePrimitive)` |
| TP1 / Stop levels | Horizontal price lines | `series.createPriceLine()` |
| Breakout signal | Arrow marker up/down | `createSeriesMarkers` shape='arrowUp'/'arrowDown' |
| MTF alignment | Colored background band | new `MTFBandPrimitive` |

### 3.4 New component: AlphaOverlayLayer
File: `app/src/components/terminal/chart/AlphaOverlayLayer.ts`

```typescript
// Pure imperative class — no Svelte component, attaches to existing series
export class AlphaOverlayLayer {
  constructor(
    private candleSeries: ISeriesApi<'Candlestick'>,
    private chart: IChartApi,
  ) {}

  apply(analysis: PanelAnalyzeData | null): void {
    this.clearAll();
    if (!analysis) return;

    // 1. ATR price lines (tp1 + stop)
    this.applyLevelLines(analysis);

    // 2. Phase markers (wyckoff/cvd events from alphaMarkers array)
    this.applyPhaseMarkers(analysis.alphaMarkers ?? []);

    // 3. Breakout signal arrows
    this.applyBreakoutArrow(analysis);
  }

  private clearAll() { /* remove all pricelines + markers */ }
  private applyLevelLines(a: PanelAnalyzeData) { ... }
  private applyPhaseMarkers(markers: AlphaMarker[]) { ... }
  private applyBreakoutArrow(a: PanelAnalyzeData) { ... }
}
```

### 3.5 ChartBoard integration contract
```svelte
<!-- ChartBoard.svelte -->
let alphaOverlay: AlphaOverlayLayer | null = null;

// After chart init:
alphaOverlay = new AlphaOverlayLayer(candleSeries, chart);

// Reactive to analysis prop changes:
$effect(() => {
  alphaOverlay?.apply(analysisData);
});
```

### 3.6 Props addition to ChartBoard
```typescript
interface Props {
  // ... existing ...
  analysisData?: PanelAnalyzeData | null;  // NEW — drives AlphaOverlayLayer
}
```

### 3.7 Performance
- `apply()` is O(n) over evidence array (typically 5-15 items)
- Clears and re-renders only on analyze response change (not per-candle)
- Price lines are native lightweight-charts primitives — no DOM overhead

---

## 4. Layer 2 — Whale Position Tracking

### 4.1 Data source
**Hyperliquid Leaderboard API** (public, no auth, no cost):
```
GET https://api.hyperliquid.xyz/info
Body: { "type": "leaderboard" }
```

Response: top traders with open positions, PnL, leverage.

### 4.2 Data model
```typescript
interface WhalePosition {
  address: string;      // truncated: 0x1234...5678
  pnlPct: number;       // 30d PnL %
  leverage: number;
  netPosition: 'long' | 'short' | 'unknown';
  liquidationPrice?: number;  // estimated from leverage + entry
  size: number;         // USD notional
}
```

### 4.3 Store: whaleStore
```typescript
// $lib/stores/whaleStore.ts
export const whalePositions = writable<WhalePosition[]>([]);
export const whaleLoading = writable(false);
export const whaleLastFetch = writable(0);

export async function fetchWhales(symbol: string) {
  const now = Date.now();
  if (now - get(whaleLastFetch) < 60_000) return; // 60s TTL
  whaleLoading.set(true);
  // fetch + parse + filter by symbol
  // ...
  whaleLastFetch.set(now);
  whaleLoading.set(false);
}
```

### 4.4 UI: WhaleWatch card in RightRailPanel
- 5 top whale rows: address, direction indicator, size, est. liq price
- Color: green = long, red = short
- "Liq cluster" text when ≥3 whales share a liq price band

### 4.5 Chart overlay: WhaleLinePrimitive
- Horizontal dashed line at estimated liq price for top 3 whales
- Thin, labeled: "🐋 0x1234 Liq: $89,400"
- Only shown for whales with >$1M position in same symbol

### 4.6 Cost & rate limit
- Free API, no rate limit documented (be respectful: 60s cache)
- Fallback: if fetch fails, hide card silently (no error toast)

---

## 5. Layer 3 — Multi-Asset Comparison

### 5.1 Goal
Show normalized BTC price curve on current symbol chart as second series.
Reveals correlation / divergence instantly — is this asset leading or lagging BTC?

### 5.2 Data source
Existing OHLCV endpoint — just fetch BTC data in parallel:
```
GET /api/cogochi/klines?symbol=BTCUSDT&tf={tf}&limit=500
```
Already implemented. Zero new backend work.

### 5.3 Computation (client-side, O(n))
```typescript
// Normalize both series to 100 at earliest shared candle
function normalizeToBase(candles: OHLCV[], baseClose: number): NormalizedPoint[] {
  return candles.map(c => ({ time: c.time, value: (c.close / baseClose) * 100 }));
}
```

### 5.4 Chart integration
```typescript
// Second LineSeries on same chart panel
const comparisonSeries = chart.addSeries(LineSeries, {
  color: 'rgba(75,158,253,0.5)',
  lineWidth: 1,
  priceScaleId: 'comparison', // right scale, separate from main
  lastValueVisible: true,
  title: 'BTC',
});
comparisonSeries.setData(normalizedBTC);
```

### 5.5 Toggle in ChartToolbar
- New toolbar button: "BTC ∥" — toggles comparison overlay
- State: `showComparison = $state(false)`
- Keyboard: `C` key shortcut

### 5.6 Pine Script export
When user clicks "Export to Pine Script" in PineScriptGenerator, pre-fill with
"Compare [current symbol] vs BTC normalized from [date]" prompt.

---

## 6. Layer 4 — Macro News Impact

### 6.1 Goal (Phase 1 — minimal viable)
Show news event timestamps as vertical markers on the chart.
Correlation visible immediately: "price dropped at this news event."

### 6.2 Data source (Phase 1)
**CryptoPanic RSS** (free):
```
GET https://cryptopanic.com/api/v1/posts/?auth_token=FREE_TOKEN&public=true
```
Returns: title, published_at, currencies affected.

### 6.3 Data model
```typescript
interface NewsEvent {
  id: string;
  title: string;
  publishedAt: number;   // unix seconds
  symbols: string[];     // ['BTC', 'ETH', ...]
  sentiment?: 'positive' | 'negative' | 'neutral';
}
```

### 6.4 Engine route (new, minimal)
```
GET /api/cogochi/news?symbol=BTC&limit=20
```
Thin proxy to CryptoPanic RSS. Caches 5min server-side (KV or in-memory).

### 6.5 Chart integration
Extend alphaMarkers with news events:
```typescript
// Merge into existing alphaMarkers array in ChartBoard
const newsMarkers = newsEvents.map(e => ({
  timestamp: e.publishedAt,
  phase: 'news',
  label: e.title.slice(0, 30) + '…',
  color: e.sentiment === 'negative' ? '#f23645' : '#22ab94',
  shape: 'square',
}));
```

### 6.6 AlphaMarketBar extension
Top strip shows latest 3 news headlines with elapsed time.

---

## 7. Implementation Sequence

### Priority order (value/effort ratio)
1. **Layer 1** (P0) — highest visual impact, zero new data sources
2. **Layer 3** (P1) — BTC comparison, client-side only, 2h work
3. **Layer 2** (P2) — whale tracking, 1 new API + UI card
4. **Layer 4** (P3) — news, needs new backend route + RSS parsing

### Sprint breakdown
| Phase | Work | Files changed |
|-------|------|---------------|
| L1-a | AlphaOverlayLayer class | new: `chart/AlphaOverlayLayer.ts` |
| L1-b | ChartBoard integration | mod: `ChartBoard.svelte` |
| L1-c | analysisData prop wiring | mod: `+page.svelte` |
| L3-a | Comparison series + store | new: `stores/comparisonStore.ts` |
| L3-b | ChartToolbar toggle | mod: `ChartToolbar.svelte`, `ChartBoard.svelte` |
| L2-a | whaleStore + API proxy | new: `stores/whaleStore.ts`, `api/cogochi/whales/+server.ts` |
| L2-b | WhaleWatch card UI | mod: `RightRailPanel.svelte` |
| L2-c | WhaleLinePrimitive | new: `chart/primitives/WhaleLinePrimitive.ts` |
| L4-a | news API route | new: `api/cogochi/news/+server.ts` |
| L4-b | newsMarkers wiring | mod: `ChartBoard.svelte`, `AlphaMarketBar.svelte` |

---

## 8. Exit Criteria

- [ ] L1: ATR TP1/Stop price lines visible on chart after analyze
- [ ] L1: Phase markers (text shape) visible on candles at correct timestamps
- [ ] L1: Breakout arrows appear for bullish/bearish signals
- [ ] L3: BTC comparison series toggleable from ChartToolbar
- [ ] L2: Whale positions card in right rail, updates every 60s
- [ ] L4: News event markers on chart (phase 1)
- [ ] All: TypeScript 0 errors, 0 console warnings
- [ ] All: No performance regression (chart stays 60fps)

---

## 9. Non-Goals

- Real-time order flow / tape (separate feature, W-0141)
- Newsquawk premium feed (future upgrade, ~$30/mo)
- Options gamma exposure heatmap (separate primitive, W-0086 follow-up)
- Server-side chart rendering / PNG export

---

*Next active work item: L1-a (AlphaOverlayLayer class)*
