# Phase D-2 — ChartToolbar + Timeframe picker (1.5d)

**Goal**: introduce the 36px ChartToolbar that lives between TabBar and the chart canvas, consolidating chart-specific controls (chart type dropdown, +indicator, replay, snapshot, settings, save).

**Branch**: continues on `claude/optimize-token-usage-OHWWq`.

**Design ref**: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md` lines 668–672 + 1344–1348.

---

## 1. Scope

### 1.1 New component

`app/src/lib/cogochi/ChartToolbar.svelte` — 36px horizontal bar with:

| Control | Behavior |
|---|---|
| Chart type dropdown (`▾`) | 5 options: Candle / Line / HA / Bar / Area → `shellStore.setChartType` |
| `+ Indicator` | dispatches `cogochi:cmd { id: 'open_indicator_settings' }` |
| `▶ Replay` | dispatches `cogochi:cmd { id: 'toggle_replay' }` (stubbed; D-5 wires) |
| `📷 Snap` | dispatches `cogochi:cmd { id: 'chart_snapshot' }` (stubbed; D-6 wires) |
| `⚙ Settings` | opens IndicatorSettingsSheet (same as TopBar) |
| `💾 Save` | enters range-save mode (`chartSaveMode.enterRangeMode`) |

### 1.2 TopBar cleanup

Remove the `CHART_TYPES` strip from `TopBar.svelte` (now owned by ChartToolbar). Keep symbol, TF strip, price, IND/⚙ buttons.

### 1.3 AppShell wiring

Insert `<ChartToolbar />` directly under `<TabBar />`, above `<WorkspaceStage />` / `<MultiPaneChartAdapter />` (desktop only).

---

## 2. Acceptance criteria

| AC | Criterion |
|---|---|
| AC-D2-1 | ChartToolbar visible on desktop, 36px height |
| AC-D2-2 | Chart type dropdown shows 5 options and switches type |
| AC-D2-3 | Selected chart type label shown on the trigger button |
| AC-D2-4 | `+Indicator` opens IndicatorSettingsSheet |
| AC-D2-5 | `Save` button enters range-save mode (existing `chartSaveMode`) |
| AC-D2-6 | TF picker remains in TopBar (not duplicated) |
| AC-D2-7 | Keyboard 1–8 still switches TF (D-0) |
| AC-D2-8 | TopBar no longer renders CHART_TYPES strip |
| AC-D2-9 | Click-outside closes the dropdown |
| AC-D2-10 | 0 new TS errors, 0 console errors, all 423 tests pass |

---

## 3. Out of scope

- Real Replay / Snapshot wiring → Phase D-5 / D-6.
- Save-Setup persistence backend → Phase D-6.
- Drawing toolbar → Phase D-4.
