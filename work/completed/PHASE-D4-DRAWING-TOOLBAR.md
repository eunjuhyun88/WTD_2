# Phase D-4 — Drawing toolbar + DrawingManager integration (1d)

**Goal**: introduce a left-vertical Drawing toolbar in the cogochi shell,
wire DrawingManager into the chart, and add the `chartActiveMode` flag
to coordinate drawing vs. range-save mode.

**Branch**: continues on `claude/optimize-token-usage-OHWWq`.

**Design ref**: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md` lines 1300, 1358-1360.

---

## 1. Scope

### 1.1 New component

`app/src/lib/cogochi/DrawingRail.svelte` — 36px vertical drawing toolbar.

| Tool | Icon | Shortcut |
|---|---|---|
| cursor          | ↖ | Esc |
| trendLine       | ╱ | T |
| horizontalLine  | — | H |
| verticalLine    | \| | V |
| extendedLine    | ↔ | E |
| rectangle       | □ | R |
| fibRetracement  | Ψ | F |
| textLabel       | T | L |

Plus action buttons: delete-selected (✕), clear-all (⌫).

### 1.2 shell.store additions

- `chartActiveMode: 'idle' | 'drawing' | 'save-range'` — single mode flag.
- `drawingTool: DrawingToolType` — currently selected tool.
- Actions:
  - `setDrawingTool(tool)` — toggles the tool, sets `chartActiveMode = 'drawing'` (or `'idle'` if reverting to cursor); cancels save-range if active.
  - `setChartActiveMode(mode)`.

`chartSaveMode.enterRangeMode` continues to set save-range mode separately
but DrawingRail listens to `chartSaveMode.active` and shows cursor-only
when range-save is in progress.

### 1.3 MultiPaneChartAdapter wiring

- Subscribe to `shellStore.drawingTool` and propagate via `mgr.setTool`.
- Use `MultiPaneChart`'s existing `onChartReady` to attach DrawingManager.
- Render DrawingCanvas overlay on top of MultiPaneChart.
- Storage key: `cogochi.drawings.{symbol}.{timeframe}`.

### 1.4 AppShell wiring

- Render `<DrawingRail />` inside `main-row`, between the WatchlistRail
  Splitter and the `canvas-col` div (desktop only).
- Add keyboard shortcuts (T/H/V/E/R/F/L) — bound to `setDrawingTool`.
- Esc reverts to cursor (if drawing) before falling through to other handlers.

---

## 2. Acceptance criteria

| AC | Criterion |
|---|---|
| AC-D4-1  | DrawingRail renders 36px wide on desktop, left of canvas |
| AC-D4-2  | 8 tool buttons + delete + clear-all visible |
| AC-D4-3  | Active tool highlighted; click toggles |
| AC-D4-4  | T/H/V/E/R/F/L keys select tools |
| AC-D4-5  | Esc reverts to cursor when drawing tool active |
| AC-D4-6  | `chartActiveMode` reflects drawing/idle |
| AC-D4-7  | DrawingManager attaches to MultiPaneChart via onChartReady |
| AC-D4-8  | Drawings render on overlay canvas above chart |
| AC-D4-9  | Drawings persist per `{symbol}/{tf}` key in localStorage |
| AC-D4-10 | 0 new TS errors, all existing tests pass |
