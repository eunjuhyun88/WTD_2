# W-0114: Mobile UX + State Persistence

**Owner**: app  
**Change Type**: refactor + feature  
**Primary Files**: `app/src/components/terminal/workspace/ChartBoard.svelte`, `IndicatorPaneStack.svelte`, `app/src/routes/terminal/+page.svelte`

---

## Goal

Complete Terminal UI consolidation post-W-0112-C by:
- Testing indicator pane collapse/expand on mobile viewports
- Implementing sessionStorage state persistence (symbol, TF, indicator visibility)
- Verify candle continuity with all states restored (no gaps, no jitter)
- Establish visual regression baseline

## Scope

### Phase A: Mobile Indicator Pane Testing
- [ ] Resize viewport to mobile (375px) with indicator panes open
- [ ] Test: Indicator pane visibility toggle (collapse/expand on tap)
- [ ] Test: Pane height adaptation to narrow viewport
- [ ] Test: Horizontal scroll for wide charts on mobile
- [ ] Verify: No layout shift when toggling indicators

### Phase B: Session State Persistence
- [ ] Implement sessionStorage save on symbol/TF/indicator changes
- [ ] Implement sessionStorage restore on page load
- [ ] Design: What state to save? (symbol, tf, showMACD, showCVD, activePane)
- [ ] Test: Page refresh → state restored, chart renders with same setup
- [ ] Test: Browser close → state cleared (sessionStorage, not localStorage)

### Phase C: Candle Continuity Verification
- [ ] Load 500-bar kline, verify all bars render without gaps
- [ ] Verify: No jitter on pan/zoom interactions
- [ ] Verify: TF change refetches and renders correctly
- [ ] Test: Real-time candle updates don't cause jumps
- [ ] Screenshot: Baseline at 500 bars, 3 indicators, full toolbar

### Phase D: Visual Regression Testing
- [ ] Desktop baseline (1280x800): 500 bars + MACD + OI + CVD
- [ ] Tablet baseline (768x1024): toolbar dropdown, pane stacking
- [ ] Mobile baseline (375x812): chart stacked, panes collapsed
- [ ] Screenshot diffs: Verify no unintended layout changes

## Canonical Files

- `app/src/components/terminal/workspace/ChartBoard.svelte`
- `app/src/components/terminal/workspace/IndicatorPaneStack.svelte`
- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/stores/terminalState.ts`

## Facts

1. W-0112-C Phase 1 complete: IndicatorPaneStack integrated, all 115 tests passing
2. ChartCanvas wired to LightweightCharts with 500-bar rendering
3. Timestamp units verified: unix seconds (chartSeriesService.ts L71)
4. fitContent() called once on init; scrollToPosition(1) preserves pan/zoom
5. Indicator toggles trigger non-blocking re-render via $effect (W-0112-C)

## Assumptions

1. sessionStorage is available in all target browsers
2. State restore doesn't interfere with parent terminal page data flow
3. Mobile viewport breakpoints match existing CSS (@media max-width: 375px, 768px, 1280px)
4. LWC resize() method handles container size changes gracefully

## Open Questions

1. **Session state durability**: Should we persist to localStorage for multi-tab reuse, or just sessionStorage?
2. **Error handling**: If stored state is invalid (e.g., symbol no longer exists), what's the fallback?
3. **Mobile collapse strategy**: Should panes auto-collapse on mobile, or require explicit tap?

## Decisions

1. **State scope**: Save symbol, tf, showMACD, showCVD in terminalState (extend store with persistence methods)
2. **Persistence layer**: sessionStorage only (clear on browser close, no cross-tab sync)
3. **Mobile UX**: Panes don't auto-collapse; user controls visibility via toggle buttons
4. **Baseline strategy**: Use preview_screenshot for desktop/tablet/mobile at key user flows

## Next Steps

1. **Phase A (1.5h)**: Mobile viewport testing + document pane collapse behavior
2. **Phase B (1.5h)**: Implement sessionStorage save/restore + test refresh scenarios
3. **Phase C (1h)**: Candle continuity verification (500 bars, TF change, live updates)
4. **Phase D (1h)**: Visual regression baseline screenshots + diffs
5. **PR Creation**: Stack on top of PR #118 or separate merge unit

## Exit Criteria

- [x] W-0112-C Phase 1 complete (PR #118 created)
- [ ] Mobile pane collapse/expand tested and working
- [ ] sessionStorage state persistence implemented
- [ ] Page refresh restores previous chart state
- [ ] 500-bar candle rendering verified without gaps
- [ ] Visual baseline screenshots created (desktop, tablet, mobile)
- [ ] All tests passing
- [ ] No console errors during state restore

## Handoff

- Input: PR #118 (IndicatorPaneStack integration)
- Output: PR #119+ (mobile UX + state persistence)
- Follow-up: W-0115+ (dashboard multi-symbol layout, performance optimization)
