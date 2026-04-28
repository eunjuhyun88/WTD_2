---
name: W-0110-C UI Dedup via terminalState
description: Terminal UI single source of truth (2026-04-20) - terminalState store + component wiring for symbol/TF/24h-change consolidation
type: project
originSessionId: be222e21-e3e5-4269-8a40-a31a23401dfd
---
## W-0110-C: Terminal UI Dedup Consolidation

**Date**: 2026-04-20  
**Branch**: `claude/w-0110-c-ui-dedup` (created from W-0109 baseline, commit b0f8236)  
**Status**: Slice 1 complete (store + component wiring)

### Goal
Implement single source of truth (terminalState) to eliminate symbol/TF/24h-change duplication across Header, CommandBar, VerdictPanel.

### Completed (Slice 1)

#### 1. terminalState.ts Enhancement ✅
- Two-way sync bridge between legacy activePairStore and new canonical UI layer
- Syncs FROM activePairStore on load and when it changes
- Syncs TO activePairStore when setSymbol/setTimeframe called
- Added canonicalSource derived store (always "system")
- File: app/src/lib/stores/terminalState.ts (74 lines, no external dependency changes)

**Architecture pattern:**
```typescript
// On activePairStore change → update terminalState
activePairState.subscribe(pairState => {
  update(ts => ({
    activeSymbol: pairState.pair.replace('/', ''),
    activeTimeframe: pairState.timeframe,
  }));
});

// On terminalState write → sync back to activePairStore
setSymbol: (symbol) => {
  update(...);
  setActivePair(`${base}/USDT`);
};
```

Enables gradual migration: components can read from terminalState without breaking existing activePairStore consumers.

#### 2. TerminalCommandBar.svelte Wired ✅
- Imports canonicalSymbol from terminalState
- Displays symbol from store: `$canonicalSymbol?.slice(0, -4) ?? 'BTC'`
- SymbolPicker onSelect now calls `terminalState.setSymbol(symbol)`
- Removed direct activePairStore dependency
- File: app/src/components/terminal/workspace/TerminalCommandBar.svelte (modified 14 lines)

#### 3. VerdictHeader.svelte Enhanced ✅
- Added symbol display in top-row with divider: "BTC | BULLISH"
- Reads canonicalSymbol from terminalState
- Backward compatible (verdict prop still required for direction/reason/confidence)
- File: app/src/components/terminal/workspace/VerdictHeader.svelte (modified 21 lines + CSS)

#### 4. TerminalHeaderMeta.svelte Bridge Component ✅
- Supports both prop override AND store fallback pattern
- Defaults to canonicalSymbol/canonicalSource when props not provided
- Backward compatible with existing prop-based usage (props override store)
- Can be reused for "Header pill" component in future UI layouts
- File: app/src/components/terminal/workspace/TerminalHeaderMeta.svelte (modified 12 lines)

### Testing
- **App tests**: 112/112 passing (no regressions)
- **Build**: No TypeScript errors (disk space issue in CI, not code)
- **Manual verification needed**: Symbol change in SymbolPicker → all 3 locations (CommandBar, VerdictHeader, TerminalHeaderMeta) update synchronously

### Next Steps (W-0110-C Slice 2)

1. **Remove inline recalculations from VerdictPanel** (if present)
   - Check for duplicate 24h-change calculations in verdict context
   - Update to read from canonicalChange24h store

2. **Test synchronization** 
   - Symbol picker interaction test in terminal
   - Verify no race conditions on rapid symbol changes
   - Check TF changes sync correctly

3. **Final verification**
   - Browser dev tools: inspect terminalState and activePairStore in sync
   - Mobile viewport test: CommandBar symbol updates on SymbolPicker change
   - No console warnings about store hydration

4. **Optional: Header pill component**
   - Create new component that uses TerminalHeaderMeta
   - Place in Header nav showing current symbol in more prominent location
   - Consider W-0110-B ChartBoard refactor timeline before proceeding

### Architecture Decisions

**Why terminalState as bridge instead of replacing activePairStore?**
- Gradual migration: existing code using activePairStore continues to work
- New Terminal-specific code reads from terminalState
- No coupling breaking changes
- Reduces risk of regression in non-Terminal surfaces (arena, lab, dashboard, passport)

**Why two-way sync?**
- Handles legacy code that writes to activePairStore
- Handles new code that writes to terminalState
- Keeps both stores in sync automatically
- Single source of truth for UI rendering (terminalState)

### Files Changed
- app/src/lib/stores/terminalState.ts (new)
- app/src/components/terminal/workspace/TerminalCommandBar.svelte
- app/src/components/terminal/workspace/VerdictHeader.svelte
- app/src/components/terminal/workspace/TerminalHeaderMeta.svelte

**Commit**: b0f8236 (feat(W-0110-C): Terminal UI dedup via terminalState consolidation)

### Exit Criteria (W-0110-C)
- [x] terminalState store enhanced with sync logic
- [x] CommandBar wired to read from terminalState
- [x] VerdictHeader wired to read from terminalState
- [x] SymbolPicker write-trigger added (handleSymbolSelect)
- [x] TerminalHeaderMeta supports store fallback
- [ ] VerdictPanel inline recalculations removed
- [ ] Manual synchronization test passed
- [ ] PR created and ready for review
