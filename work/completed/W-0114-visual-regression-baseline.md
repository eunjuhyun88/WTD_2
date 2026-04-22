# W-0114-D: Visual Regression Baseline Testing

## Baseline Scenarios

### Desktop (1280x800)
- **Chart State**: 500-bar candlestick + volume histogram + MACD + OI + CVD
- **Toolbar**: TF dropdown, Export button, Studies popover
- **Indicator Panes**: All 4 panes (VOL:60px, MACD:80px, OI:72px, CVD:84px)
- **Header**: ChartToolbar visible, no collapsing
- **Expected**: Full chart visibility, no horizontal scroll

### Tablet (768x1024) 
- **Chart State**: Same data, responsive pane heights (48/64/56/64px)
- **Toolbar**: TF dropdown with smaller button sizing
- **Layout**: Portrait orientation, panes may stack
- **Header**: Toolbar wraps to multiple lines on narrow width
- **Expected**: All indicators visible without horizontal scroll

### Mobile (375x812)
- **Chart State**: Same data, mobile pane heights
- **Toolbar**: Dropdown-style TF selector (responsive)
- **Layout**: Single column, panes scroll vertically
- **Pane Controls**: Collapse/expand buttons visible
- **Expected**: No horizontal scroll, readable labels (font-size: 9px → 8px)

---

## Verification Tests

### Scenario 1: Initial Load
1. Navigate to `/terminal/BTCUSDT?tf=1h`
2. Verify: Chart loads with 500 bars
3. Verify: No gaps in candlestick data
4. Verify: Volume histogram color-coded (green up, red down)
5. Verify: All 4 indicator panes render
6. **Regression check**: Compare to W-0112 baseline (should be identical)

### Scenario 2: Timeframe Change
1. Click TF dropdown, select `4h`
2. Verify: Chart data refetches immediately
3. Verify: Panes re-render with new data
4. Verify: No jitter or scroll jump
5. Verify: 500-bar dataset loads (count visible bars)
6. **Regression check**: No layout shift, same pane heights

### Scenario 3: Indicator Toggle
1. Click Studies popover
2. Toggle: MACD ↔ RSI
3. Verify: Sub-pane switches without re-fetching candles
4. Verify: No main candlestick flicker
5. Toggle: CVD on/off
6. Verify: CVD pane appears/disappears smoothly
7. **Regression check**: Sub-pane transitions are instant

### Scenario 4: Pan/Zoom Interaction
1. Drag chart left to scroll to historical bars
2. Verify: Bars scroll smoothly, no jitter
3. Scroll wheel to zoom in/out
4. Verify: Chart responsive, no lag
5. Pan right to return to real-time
6. **Regression check**: No position jumps, zoom preserved

### Scenario 5: Mobile Collapse/Expand
1. On 375px viewport, tap pane collapse button (if implemented)
2. Verify: Pane collapses (height → 0 or display:none)
3. Verify: Chart area expands to fill space
4. Tap again to expand
5. **Regression check**: Smooth transitions, no layout breaks

### Scenario 6: Page Refresh State Restore
1. Change symbol to `ETHUSDT`, TF to `4h`
2. Toggle indicators: CVD off
3. Refresh page (cmd+R)
4. Verify: Chart loads with ETHUSDT, 4h, CVD hidden
5. Verify: State restored from sessionStorage
6. **Regression check**: Session state survives refresh

---

## Artifact Collection

### Desktop Screenshot
- Command: `preview_screenshot` at 1280x800
- File: `w-0114-baseline-desktop-1280x800.png`
- Content: Full chart with toolbar, all 4 indicator panes

### Tablet Screenshot  
- Command: `preview_screenshot` at 768x1024
- File: `w-0114-baseline-tablet-768x1024.png`
- Content: Responsive layout, responsive pane heights

### Mobile Screenshot
- Command: `preview_screenshot` at 375x812
- File: `w-0114-baseline-mobile-375x812.png`
- Content: Single-column layout, mobile pane sizing

---

## Pass/Fail Criteria

- [x] Phase A: Mobile responsive pane heights (48/64/56/64 on <768px) ✅
- [x] Phase B: sessionStorage persistence for symbol + TF ✅
- [ ] Phase C: Candle continuity verified (fitContent once, scrollToPosition, no gaps) ✅ (already implemented)
- [ ] Phase D: Visual regression baseline screenshots captured
- [ ] All 6 scenarios pass without regression
- [ ] No console errors during testing
- [ ] Tests passing (115/115)

---

## Next: W-0115 (Performance Optimization)

After W-0114 complete:
1. Merge PR #119 (W-0114-A/B/C/D)
2. Monitor user feedback on mobile UX + state persistence
3. Plan W-0115: Redis kline cache + chart streaming optimization
