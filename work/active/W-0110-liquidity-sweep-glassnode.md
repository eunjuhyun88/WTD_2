---
title: W-0110 - Liquidity Sweep Reversal + ChartBoard Refactor + Terminal UI Dedup
owner: engine + app
status: in-progress
created: 2026-04-20
---

# W-0110: Liquidity Sweep Reversal (Pattern #13) + ChartBoard Split + Terminal UI Sync

## Goal

Close 3 concurrent infrastructure gaps while adding Pattern #13 (Liquidity Sweep Reversal):
1. **Engine**: Build liquidity_sweep_reversal building block + promote to candidate via paradigm baseline
2. **App**: Refactor ChartBoard.svelte (2300→800 lines) + fix candle continuity bug
3. **App**: Unify terminal symbol/TF/24H state via single terminalState store

Exit: 13-pattern system, ChartBoard modularized, terminal UI consistent.

## Scope

### W-0110-A: Liquidity Sweep Reversal (Pattern #13)
- **Goal**: Data-independent pattern definition; reach promote_candidate gate
- **Why**: Crypto-native reversal (stop hunts visible on-chain); uses existing blocks; paradigm replicable
- **Blocks**: Define `liquidity_sweep_reversal` (breakout_above_high + volume_spike + reversal signature)
- **Test**: 13+ signals, paradigm pass ≥0.75, no new API
- **Est**: 1 day
- **Exit**: Pattern registered in PATTERN_LIBRARY, tests ≥1090, paradigm baseline doc

### W-0110-B: ChartBoard Refactor + Candle Bug
- **Goal**: 2300-line ChartBoard → modular pieces; candle continuity repaired
- **Why**: Cognitive load (80% terminal onboarding time), render perf, bug isolation (4 suspects → 1)
- **Split plan**:
  - `ChartBoard.svelte`: 800 lines (main orchestrator)
  - `ChartCanvas.svelte`: 1000 lines (candle + grid rendering) — *extract & isolate*
  - `IndicatorPaneStack.svelte`: 400 lines (new)
  - `ChartToolbar.svelte`: 300 lines (new)
- **Candle bug suspects** (priority):
  1. Timestamp unit mismatch (LWC expects unix sec, API returns ms?)
  2. `fitContent()` called every update → resets user pan
  3. Data gap detection in timeScale
- **Test**: Visual regression (6–8 bars render), user pan persists, HMR stable
- **Est**: 1.5 days
- **Exit**: Split commits per file, candle tests green, no regression in other panes

### W-0110-C: Terminal UI State Centralization
- **Goal**: Single `terminalState` store replaces 3 scattered symbol sources + 2 TF sources
- **Why**: W-0109 baseline done; next 8 patterns demand consistent UX; async symbol change = trust loss
- **Changes**:
  - Add `terminalState` store (symbol, timeframe, _24hChange, exchange)
  - Header pill reads from store
  - CommandBar TF reads from store
  - VerdictHeader symbol reads from store
  - SymbolPicker → store write → all UIs subscribe
- **Test**: Symbol change triggers all 3 UI updates synchronously, TF locked when chart loads
- **Est**: 1 day (mostly Svelte reactivity plumbing)
- **Exit**: PR #102 merged, terminalState canonical

## Non-Goals

- Glassnode LTH/MVRV integration (→ W-0110 Slice 1.5, deferred)
- cvd_cumulative live data (→ W-0109 Slice 2 already merged)
- Full W-0111 COT parser (→ separate work item)
- Dashboard sidebar reuse (→ W-0116)

## Canonical Files

**Engine:**
- `engine/patterns/library.py` — PATTERN_LIBRARY registration
- `engine/patterns/liquidity_sweep_reversal.py` — new pattern logic
- `engine/scoring/block_evaluator.py` — existing blocks reused
- `engine/research/paradigm_framework.py` — baseline eval

**App:**
- `app/src/components/terminal/workspace/ChartBoard.svelte` — split target
- `app/src/components/terminal/workspace/ChartCanvas.svelte` — extract target
- `app/src/components/terminal/workspace/ChartToolbar.svelte` — new
- `app/src/components/terminal/workspace/IndicatorPaneStack.svelte` — new
- `app/src/lib/stores/terminalState.ts` — new canonical source
- `app/src/components/terminal/header/Header.svelte` — subscribe to store
- `app/src/components/terminal/CommandBar.svelte` — subscribe to store
- `app/src/components/verdict/VerdictHeader.svelte` — subscribe to store

## Facts

1. **12-pattern system stable**: 1082 tests pass (as of W-0109 merge)
2. **Paradigm framework available**: W-0105 provides checklist, scoring, multi-period validation
3. **ChartBoard known pain**: 2300 lines, 80% terminal UX friction in onboarding
4. **Candle bug reproducible**: API 500 bars → LWC 6–8 bars (consistent across users)
5. **UI dedup design complete**: W-0103 identified 3 symbol sources + 2 TF sources (PR #102 design-only)

## Assumptions

1. Liquidity sweep reversal is trainable with existing blocks (no new API needed)
2. Timestamp mismatch is root cause of candle bug (vs. fitContent() or timeScale)
3. Terminal state store can be injected into 3 separate components without race conditions
4. Svelte reactivity ($:) is sufficient for real-time sync (no need for manual subscriptions)

## Open Questions

1. **Timestamp precision**: Does binance kline API return seconds or milliseconds? Grep engine code.
2. **LWC expected format**: What units does LightweightCharts.setData() expect for timestamps?
3. **Paradigm baseline gate**: Can we reach 0.75 confidence with only 13 signals, or do we need 50+?

## Decisions

- **Pattern #13 = Liquidity Sweep Reversal** (not VWAP Reclaim, not CME Gap Fill)
  - Why: Crypto-native, data-independent, paradigm testable, blocks reusable
  - Backup: VWAP Reclaim → W-0114 if sweep doesn't converge

- **ChartBoard split now, not deferred**
  - Why: Cognitive load unbounded (W-0110–W-0120 all touch charts); bug isolation easier with modular files
  - Rollback: If perf regresses, revert split (but keep candle fix)

- **terminalState store, not local component state**
  - Why: Single source prevents symbol-mismatch bugs; next 8 patterns depend on consistent global state
  - Risk: If reactivity breaks, fall back to event emitters (low risk, well-tested pattern)

## Next Steps

1. **W-0110-A (1 day)**: Define `liquidity_sweep_reversal` block, write tests, paradigm baseline, register pattern
2. **W-0110-B (1.5 days)**: Extract ChartCanvas, identify candle bug root cause (timestamp unit check), fix, test
3. **W-0110-C (1 day)**: Add terminalState store, wire 3 UI components, merge PR #102

## Exit Criteria

- ✅ Pattern #13 registered in PATTERN_LIBRARY
- ✅ Tests: ≥1090 pass (baseline 1082 + new sweep tests)
- ✅ ChartBoard.svelte ≤800 lines, ChartCanvas.svelte extracted
- ✅ Candle continuity test green (500 bars → 500 bars rendered)
- ✅ Terminal symbol/TF change atomic + synchronous
- ✅ PR #102 (UI dedup) merged
- ✅ No regression in other patterns / UI surfaces

## Handoff Checklist

- [ ] W-0110-A: liquidity_sweep_reversal.py, tests, paradigm baseline
- [ ] W-0110-B: ChartBoard → ChartCanvas split, candle bug diagnosis + fix, visual regression test
- [ ] W-0110-C: terminalState store wired to Header/CommandBar/VerdictHeader, PR #102 merged
- [ ] All branches rebased on main, PR descriptions link canonical files
- [ ] Memory updated with pattern benchmark scores + UI invariants learned
