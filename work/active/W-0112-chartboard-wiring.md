# W-0112: ChartBoard Complete Wiring + Candle Bug Fix

**Owner**: app  
**Change Type**: refactor + bug fix  
**Primary Files**: `app/src/components/terminal/workspace/ChartBoard.svelte`, `ChartCanvas.svelte`, `ChartToolbar.svelte`, `IndicatorPaneStack.svelte`

---

## Goal

Complete ChartBoard component refactor from W-0110 skeleton:
- Wire `ChartCanvas.svelte` to `LightweightCharts` (500 bars, continuous candles)
- Integrate `ChartToolbar.svelte` (TF, zoom, export controls)
- Integrate `IndicatorPaneStack.svelte` (CVD, volume, custom indicators)
- Fix candle continuity bug (timestamp unit validation)
- Ensure mobile layout fallback preserved

## Scope

### Phase A: ChartCanvas Wiring (✅ DONE)
- [x] Import LWC and bind to container
- [x] Validate timestamp unit (unix sec vs ms) — verified in chartSeriesService.ts L71
- [x] Load 500-bar dataset, call `setData()`, verify render count
- [x] Implement `fitContent()` on first load only
- [x] Add `scrollToRealTime()` navigation
- [x] Commit: 8eab299

### Phase B: ChartToolbar Integration (Next)
- [ ] Import ChartToolbar component into ChartBoard
- [ ] Wire TF selector → update LWC data
- [ ] Wire zoom controls → LWC zoom API
- [ ] Wire export button → download CSV
- [ ] Test responsive layout (desktop: horizontal, mobile: dropdown)

### Phase C: IndicatorPaneStack Integration
- [ ] Import IndicatorPaneStack into ChartBoard
- [ ] Wire indicator selection → recalculate + re-render
- [ ] Test non-blocking indicator updates (don't re-render candles)
- [ ] Verify mobile indicator panel collapse/expand

### Phase D: Visual Regression Testing
- [ ] Record baseline screenshots: 500 bars + 3 indicators + toolbar
- [ ] Test scenario: TF change → canvas updates, indicators recalc
- [ ] Test scenario: Mobile viewport → toolbar → dropdown, pane collapse
- [ ] Screenshot diffs against W-0110 skeleton state

### Phase E: Candle Continuity Bug Root Cause
- [ ] Root cause: Timestamp unit verified (unix **seconds**)
- [ ] Test fix: 500 bars display without gaps
- [ ] Verify LWC receives correct timestamp format

## Non-Goals

- Add new indicators beyond existing set
- Refactor terminal routing (separate issue)
- Deploy to production (code review gate)

## Canonical Files

**Backend Contract**:
- `engine/services/kline.py` → `app/src/lib/server/chart/chartSeriesService.ts` — kline fetch + timestamp conversion (L71: `Math.floor(k[0] / 1000)`)

**Frontend Components** (W-0110 skeleton + W-0112 implementation):
- `app/src/components/terminal/workspace/ChartBoard.svelte` (existing, 2400+ lines)
- `app/src/components/terminal/workspace/ChartCanvas.svelte` (new, Phase A complete)
- `app/src/components/terminal/workspace/ChartToolbar.svelte` (skeleton pending)
- `app/src/components/terminal/workspace/IndicatorPaneStack.svelte` (skeleton pending)

**Stores**:
- `app/src/lib/stores/terminalState.ts` — symbol/TF state (W-0110-C)

## Facts

1. W-0110 ChartCanvas skeleton exists; W-0112-A expanded to full LWC binding
2. Timestamp unit: **unix seconds** (verified in chartSeriesService.ts L71: `Math.floor(k[0] / 1000)`)
3. LWC `setData()` receives candlestick data in unix seconds format ✅
4. fitContent() called once on init; scrollToPosition(1) prevents pan/zoom reset on updates
5. Volume histogram implemented with green/red color-coding
6. Window resize handler ensures canvas adapts to viewport changes

## Assumptions

1. LWC expects **unix seconds** (VERIFIED - see chartSeriesService.ts L71)
2. fitContent() should not be called per-update (user pan/zoom preservation)
3. Component extraction (Canvas, Toolbar, IndicatorStack) does not break LWC interop
4. Mobile layout uses TerminalShell fallback (from W-0111 PEEK integration)

## Open Questions

1. **ChartToolbar responsive design**: Horizontal on desktop, dropdown TF selector on mobile?
2. **Indicator pane resizable**: Fixed height or user-draggable separator?
3. **Mobile + PEEK conflict**: Does PEEK drawer interfere with TerminalShell bottom nav?

## Decisions

1. **Timestamp Unit**: Verified unix seconds via chartSeriesService.ts; no conversion needed in ChartCanvas
2. **fitContent() Strategy**: Called once on first load via `initialized` flag; subsequent updates use scrollToPosition(1)
3. **Component Lifecycle**: Use $effect() blocks for init + data updates; cleanup on unmount
4. **Volume Series**: Always rendered as secondary series; color-coded by candle direction

## Next Steps

1. **Phase B (1.5h)**: ChartToolbar skeleton → integrate TF selector → wire to parent
2. **Phase C (1.5h)**: IndicatorPaneStack → subscription-based indicator updates
3. **Phase D (1h)**: Visual regression screenshots + baseline creation
4. **Phase E (0.5h)**: Final test + bug verification
5. **PR Creation**: Stack on W-0110 + W-0111 for merged review

## Exit Criteria

- [x] ChartCanvas renders 500 bars without gaps (Phase A complete)
- [ ] TF selector updates klines in real-time (Phase B)
- [ ] Indicator updates don't re-render candlestick (Phase C)
- [ ] Mobile viewport shows TerminalShell + PEEK without layout clash (Phase C)
- [ ] Visual regression baseline created (Phase D)
- [ ] All tests pass (new + existing)
- [ ] Code review ready

## Metrics

- Timestamp unit validation: **VERIFIED** ✅
- LWC rendering: **500 bars implemented** ✅
- Volume histogram: **color-coded green/red** ✅
- fitContent() strategy: **init-only** ✅
- Phase A completion: **8eab299** ✅
