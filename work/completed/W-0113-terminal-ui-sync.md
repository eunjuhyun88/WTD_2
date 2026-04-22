# W-0113: Terminal UI State Synchronization

**Owner**: app  
**Change Type**: refactor  
**Primary Files**: `app/src/lib/stores/terminalState.ts`, `Header.svelte`, `CommandBar.svelte`, `VerdictHeader.svelte`

---

## Goal

Complete Terminal UI consistency via single `terminalState` store (W-0110-C foundation):
- Eliminate symbol/TF/24h change duplication across 3+ UI components
- Ensure symbol picker → all UI components update synchronously
- Foundation for persistent state + snapshot restore (W-0114)

## Scope

### Phase A: terminalState Store Audit
- [ ] Verify `terminalState.ts` exports (symbol, tf, change24h, etc.)
- [ ] Check store subscription API (setState, setSymbol, setTimeframe)
- [ ] Identify current symbol/TF/change24h storage locations (Header, CommandBar, VerdictHeader)

### Phase B: Header.svelte Integration
- [ ] Import terminalState store
- [ ] Replace local symbol state with `$terminalState.symbol`
- [ ] Replace local 24h change with `$terminalState.change24h`
- [ ] Wire SymbolPicker onselect → `terminalState.setSymbol()`
- [ ] Test: symbol picker → all UI updates instantly

### Phase C: CommandBar.svelte Integration
- [ ] Import terminalState store
- [ ] Replace TF selector with `$terminalState.tf`
- [ ] Wire TF dropdown change → `terminalState.setTimeframe()`
- [ ] Test: TF selector → ChartCanvas updates (via parent effect)

### Phase D: VerdictHeader.svelte Integration
- [ ] Import terminalState store
- [ ] Replace symbol display with `$terminalState.symbol`
- [ ] Replace 24h change with `$terminalState.change24h`
- [ ] Verify no side effects from dual binding

### Phase E: Integration Testing
- [ ] Scenario: Symbol change → Header + CommandBar + VerdictHeader + ChartCanvas update in <100ms
- [ ] Scenario: TF change → Chart data fetch + canvas re-render
- [ ] Scenario: Page refresh → state persists (if using sessionStorage backup)

## Canonical Files

- `app/src/lib/stores/terminalState.ts` (W-0110-C)
- `app/src/components/terminal/Header.svelte`
- `app/src/components/terminal/CommandBar.svelte`
- `app/src/components/terminal/VerdictHeader.svelte`
- `app/src/components/terminal/workspace/SymbolPicker.svelte`

## Facts

1. `terminalState.ts` created in W-0110-C with symbol/tf/change24h store
2. Symbol duplicated in Header pill + CommandBar + VerdictHeader
3. TF duplicated in CommandBar + internal ChartBoard state
4. 24h change pulled from different sources (API vs local state) → potential mismatch

## Assumptions

1. terminalState store has reactive update methods (setSymbol, setTimeframe, set24hChange)
2. SymbolPicker component exposes onselect callback
3. TF dropdown is in CommandBar (not scattered)
4. No circular dependencies between Header → CommandBar → VerdictHeader

## Open Questions

1. Should terminalState include exchange? (currently symbol only)
2. Where does 24h change come from? (API snapshot vs candle close pct)
3. Should state persist across page refresh? (sessionStorage, localStorage, URL params)

## Decisions

1. **Single source of truth**: All symbol/TF/24h reads from terminalState
2. **Update flow**: SymbolPicker → setSymbol() → reactive $effect() in ChartBoard
3. **Persistence**: Use sessionStorage backup (clear on browser close)

## Next Steps

1. Phase A (30min): Audit terminalState.ts + locate current duplicates
2. Phase B (45min): Header.svelte → store subscription
3. Phase C (30min): CommandBar.svelte → TF binding
4. Phase D (30min): VerdictHeader.svelte → symbol/change24h binding
5. Phase E (30min): Integration test scenario verification

## Exit Criteria

- [ ] All symbol references point to `$terminalState.symbol`
- [ ] All TF references point to `$terminalState.tf`
- [ ] SymbolPicker selection → all UI updates synchronously
- [ ] TF dropdown change → chart re-fetch + canvas update
- [ ] No console errors during state transitions
- [ ] Tests pass

## Handoff

- W-0112 PR ready (ChartCanvas + ChartToolbar + IndicatorPaneStack)
- W-0113 can start after W-0112 merge
- Follow-up: W-0114 (candle continuity bug + state persistence)
