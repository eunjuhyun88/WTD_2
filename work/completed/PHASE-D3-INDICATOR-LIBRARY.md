# Phase D-3 — IndicatorLibrary left-slide panel (2d)

**Goal**: introduce a left-slide IndicatorLibrary panel (⌘L) with debounced
search, family-grouped categories, favorites, and toggle-visible.

**Branch**: continues on `claude/optimize-token-usage-OHWWq`.

**Design ref**: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md` lines 1227-1230, 1350-1357.

---

## 1. Scope

### 1.1 New component

`app/src/lib/cogochi/IndicatorLibrary.svelte` — 320px left-slide panel.

| Feature | Behavior |
|---|---|
| Search input (debounce 100ms) | filters by id / label / synonyms / family |
| Category expand/collapse | grouped by `IndicatorFamily` |
| Favorites section | star icon, persisted via localStorage `cogochi.indicators.fav` |
| Toggle visibility | calls `shellStore.toggleIndicatorVisible(id)` |
| Close (✕ / Esc) | parent controls open state |

### 1.2 AppShell wiring

- Add `indicatorLibraryOpen = $state(false)`.
- ⌘L hotkey toggles open.
- `+ Indicator` button on ChartToolbar opens the library (was opening IndicatorSettingsSheet).
- Slide-in animation: 200ms ease.

### 1.3 Reuse

- Existing `INDICATOR_REGISTRY` in `app/src/lib/indicators/registry.ts`.
- Existing `findIndicatorsByQuery` in `app/src/lib/indicators/search.ts`.
- Existing `shellStore.visibleIndicators` + `toggleIndicatorVisible`.

IndicatorSettingsSheet is preserved (alternative entry, accessed via TopBar IND/⚙).

---

## 2. Acceptance criteria

| AC | Criterion |
|---|---|
| AC-D3-1 | Panel slides in from left at 320px |
| AC-D3-2 | ⌘L toggles the panel |
| AC-D3-3 | Esc closes the panel |
| AC-D3-4 | Search input filters list (debounce ≤100ms) |
| AC-D3-5 | Family categories expand/collapse |
| AC-D3-6 | Favorites star toggles + persists |
| AC-D3-7 | Click row toggles indicator visibility |
| AC-D3-8 | Active row shows checkmark |
| AC-D3-9 | + Indicator button on ChartToolbar opens this panel |
| AC-D3-10 | 0 new TS errors, all existing tests pass |
