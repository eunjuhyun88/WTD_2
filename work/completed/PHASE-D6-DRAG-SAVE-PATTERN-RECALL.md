# Phase D-6 — drag-to-save → Pattern Recall (2d)

**Goal**: wire chart mousedown→up range capture in the cogochi shell, surface
a 4-action toast on completion, ship POST `/api/patterns/recall`, and render
the recalled range as an AIRangeBox via the D-5 AI overlay.

**Branch**: continues on `claude/optimize-token-usage-OHWWq`.

**Design ref**: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md` lines 1368-1374.

---

## 1. Scope

### 1.1 Drag handlers in MultiPaneChartAdapter

When `chartSaveMode.active` is true, attach mousedown / mousemove / mouseup
on the chart container:

- mousedown → `chartSaveMode.startDrag(timeAtX)`
- mousemove → `chartSaveMode.adjustAnchor('B', timeAtX)`
- mouseup   → finalize anchor B; show `RangeActionToast`

Detach handlers when `chartSaveMode.active` is false.

### 1.2 RangeActionToast component

`app/src/lib/cogochi/RangeActionToast.svelte` — 4-action toast.

| Action | Behavior |
|---|---|
| Save     | POST /api/captures, push AIRangeBox marker, dismiss |
| Recall   | POST /api/patterns/recall, push AIRangeBox + render results |
| AI       | dispatch `cogochi:cmd { id: 'analyze_range' }` (existing AIPanel handles) |
| Cancel   | `chartSaveMode.exitRangeMode()`, dismiss |

### 1.3 New endpoint

`app/src/routes/api/patterns/recall/+server.ts` — POST handler that takes
`{ symbol, timeframe, fromTime, toTime }` and returns
`{ patterns: PatternRecallDTO[] }` shape with mocked deterministic results.

### 1.4 AIRangeBox marker

After save / recall, push an `AIRangeBox` shape into `chartAIOverlay` via
`setAIOverlayShapes(symbol, [...existing, marker])` so the user sees the
captured range outlined on the chart.

---

## 2. Acceptance criteria

| AC | Criterion |
|---|---|
| AC-D6-1  | mousedown on chart in save-mode sets anchor A |
| AC-D6-2  | mousemove updates anchor B continuously |
| AC-D6-3  | mouseup finalizes anchor B and shows toast |
| AC-D6-4  | Toast offers Save/Recall/AI/Cancel; Esc cancels |
| AC-D6-5  | Save persists via /api/captures |
| AC-D6-6  | Recall calls /api/patterns/recall and returns mock results |
| AC-D6-7  | AIRangeBox marker appears on chart after save/recall |
| AC-D6-8  | Cancel exits save-mode without persistence |
| AC-D6-9  | Drag handlers detach when save-mode exits |
| AC-D6-10 | 0 new TS errors, all existing tests pass |
