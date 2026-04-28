---
name: W-0110 start — liquidity_sweep_reversal + ChartBoard refactor
description: 2026-04-20 session end. W-0110 work item created, branch ready. Next: W-0110-A (liquidity_sweep_reversal pattern definition).
type: project
originSessionId: ce7127af-f041-4564-9ec7-a1cab5df1c3b
---
## Session Close-out (2026-04-20)

**Completed:**
- W-0109 fully merged (all 3 slices: compression dedup, ETF recalibration, cvd_cumulative)
- 1082 tests green (1 pre-existing CBR cache miss)
- W-0110 work item created: `work/active/W-0110-liquidity-sweep-glassnode.md`
- Branch created: `claude/w-0110-liquidity-sweep` (ready for W-0110-A)

**Current state:**
- Main: d387f14 (W-0109 Slice 2 merged)
- Worktree: `amazing-golick` → branched to `claude/w-0110-liquidity-sweep`
- Working tree: clean, ready for commits

## W-0110-A: Liquidity Sweep Reversal (NEXT)

### Pattern Design
- **Trigger**: Stop-hunt reversal (MM sweeps liquidity, price reverses)
- **Crypto-native**: Visible on-chain (MEV, mempool), price-action clear
- **Blocks to use** (all exist in block registry):
  - Triggers: `breakout_above_high`, `volume_spike`, `recent_decline`
  - Confirmations: `higher_lows_sequence`, `oi_hold_after_spike` (OI stabilizes post-sweep), `funding_flip` (post-sweep recovery)
  - Optional: `bollinger_expansion` (volatility post-sweep)

### Implementation Checklist
1. Define LIQUIDITY_SWEEP_REVERSAL PatternObject in `engine/patterns/library.py`
2. 3–4 phases: SWEEP_CLIMAX → REVERSAL_SIGNAL → ACCUMULATION → BREAKOUT
3. Write tests in `engine/tests/test_liquidity_sweep.py`
4. Run paradigm baseline (`python -m research.cli paradigm --pattern=liquidity-sweep-reversal-v1 --gate=0.75`)
5. Register in PATTERN_LIBRARY dict (line 911)
6. Target: 13+ signals, promote_candidate gate ≥0.75 confidence

### Files to Edit
- `engine/patterns/library.py`: Add LIQUIDITY_SWEEP_REVERSAL object + register
- `engine/tests/test_liquidity_sweep.py`: Create or append test_liquidity_sweep_reversal()
- `engine/research/cli_paradigm.py` (if needed): Ensure paradigm runner can handle new pattern

### Paradigm Gate
- Framework exists (W-0105): `engine/research/paradigm_framework.py`
- Checklist: Multi-period (1h, 4h, 1d), parallel sweeps, negative logging, reference vs. holdout
- Score target: ≥0.75 (entry_profitable_rate)

### Why This Pattern
- Differentiates from WHALE (accumulation focus) + WSR (squeeze focus) — sweep is tactical, not strategic
- Data-independent: Uses existing blocks, no new API
- Paradigm testable with existing framework
- Crypto-standard knowledge (Weis & DeMark sweep concepts)

### Expected Outcome
- Pattern object merged into PATTERN_LIBRARY
- 13-pattern system (was 12)
- ~1090+ tests pass (adding 10–15 new sweep tests)
- Paradigm baseline doc stored in `work/` for W-0110-C handoff

## Next Session Priorities
1. **W-0110-A** (1 day): Implement liquidity_sweep_reversal, reach promote_candidate
2. **W-0110-B** (1.5 days): ChartBoard.svelte split (2300→800+400+1000 lines) + candle continuity bug (timestamp unit mismatch?)
3. **W-0110-C** (1 day): terminalState store centralization + merge PR #102 (UI dedup)

## Blockers / Open Questions
- Timestamp unit in LightweightCharts (sec vs. ms?) — grep engine/app interface
- Can paradigm reach 0.75 with 13 signals or do we need 50+? (W-0105 doesn't document sample size gate)
- ChartBoard candle bug root cause: fitContent() timing vs. timestamp mismatch vs. timeScale gap detection?

## Handoff Summary
- **Branch ready**: `claude/w-0110-liquidity-sweep`
- **Work item ready**: `work/active/W-0110-liquidity-sweep-glassnode.md`
- **Block registry**: 29 blocks available (triggers, confirmations, disqualifiers)
- **Pattern library**: 12 patterns established + new object pattern (see library.py lines 8–160 for TRADOOR example)
- **Next hands-on**: Define LIQUIDITY_SWEEP_REVERSAL PatternObject + phases
