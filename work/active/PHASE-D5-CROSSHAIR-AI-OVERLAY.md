# Phase D-5 — MultiPaneChart crosshair sync + AI overlay (1.5d)

**Goal**: introduce a rAF-throttled crosshair sync bus between chart panes
and extend the AI overlay to support line / range / arrow / annotation shapes.

**Branch**: continues on `claude/optimize-token-usage-OHWWq`.

**Design ref**: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md` lines 1362-1366.

---

## 1. Scope

### 1.1 New: crosshair bus

`app/src/lib/stores/crosshairBus.ts` — global writable store:

```ts
export interface CrosshairState {
  time: number | null;       // Unix seconds (logical chart time)
  origin: string | null;     // chart instance id that emitted last update
}
```

Setter is rAF-throttled to one update per frame.

### 1.2 Extended: AI overlay shapes

`app/src/lib/stores/chartAIOverlay.ts` extended:

```ts
export interface AIPriceLine     { kind: 'line';   ... }       // existing
export interface AIRangeBox      { kind: 'range';  fromTime; toTime; fromPrice; toPrice; color; label? }
export interface AIArrow         { kind: 'arrow';  fromTime; toTime; fromPrice; toPrice; color; label? }
export interface AIAnnotation    { kind: 'annotation'; time; price; text; color }
export type AIOverlayShape = AIPriceLine | AIRangeBox | AIArrow | AIAnnotation;

export interface AIOverlayState {
  symbol: string | null;
  lines: AIPriceLine[];        // backward-compat
  shapes: AIOverlayShape[];    // new: full shape list
}
```

### 1.3 New: AIOverlayCanvas

`app/src/lib/cogochi/AIOverlayCanvas.svelte` — overlay canvas above the
DrawingCanvas (z-index 5). Renders AIRangeBox / AIArrow / AIAnnotation
shapes by reading the `chartAIOverlay` store + chart `time→x`,
`price→y` projections. Re-renders on chart range change and DPR change.

### 1.4 MultiPaneChartAdapter wiring

- Subscribe `chart.subscribeCrosshairMove` → `crosshairBus.publish(time)`.
- Subscribe `crosshairBus` → `chart.timeScale().setVisibleRange` /
  `setCrosshairPosition` on inactive panes.
- Apply AI price-line shapes via `PriceLineManager.setAILines()`.
- Render `<AIOverlayCanvas>` inside chart-adapter for non-line shapes.

---

## 2. Acceptance criteria

| AC | Criterion |
|---|---|
| AC-D5-1 | crosshairBus throttles at most 1 update per rAF frame |
| AC-D5-2 | Multiple chart panes (workspace mode) sync crosshair X axis |
| AC-D5-3 | chartAIOverlay supports `shapes` array of mixed kinds |
| AC-D5-4 | Backward compat: existing `setAIOverlay(symbol, lines)` still works |
| AC-D5-5 | AIOverlayCanvas renders ranges/arrows/annotations on overlay canvas |
| AC-D5-6 | Chart pan/zoom triggers AIOverlayCanvas re-render |
| AC-D5-7 | clearAIOverlay clears both lines and shapes |
| AC-D5-8 | 0 new TS errors, all existing tests pass |
