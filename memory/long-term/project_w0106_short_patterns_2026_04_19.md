---
name: W-0106 SHORT Patterns (In Progress)
description: FFR_SHORT + GAP_FADE_SHORT implementation — short pattern counterparts to long reversal patterns
type: project
---

## W-0106: SHORT Patterns — FFR_SHORT + GAP_FADE_SHORT

**Status**: Slice A Complete (dcb210d), Slice B-D pending
**Branch**: claude/w-0106-short-patterns (w-0106-short-patterns worktree)
**Tests**: 969 passed (1 increase from 968)
**Target Merge**: After Slice D completion

### Scope

**FFR_SHORT**: Funding Flip Reversal (short)
- Negative funding extreme (long overheat) → Funding flip (positive→negative) → Selling climax
- Entry: sustained selling pressure + order-flow confirmation
- 5 phases: LONG_OVERHEAT → DELTA_FLIP_NEGATIVE → CLIMAX → ENTRY_ZONE → BREAKDOWN

**GAP_FADE_SHORT**: Gap Fade Short
- Large gap up → Quick rejection → Selling climax → Return to fair value
- 4 phases: GAP_UP → REJECTION → CLIMAX → ENTRY_ZONE
- Post-market setup required (gap persistence check)

### Completed (Slice A) ✅

1. **atr_ultra_low**: ATR compression detection
   - Current ATR in lower 15th percentile over 50 bars
   - Volatility squeeze = setup before explosive move
   - Key for short entries (gap fade, FF reversal)

2. **liq_zone_squeeze_setup**: Liquidity cluster consolidation
   - Price range <= 1% over 8-bar window
   - Indicates tight order clustering at round numbers
   - Used in GAP_FADE_SHORT after gap rejection

3. **volume_surge_bear**: Elevated selling volume confirmation
   - Taker-sell ratio >= 0.60 (inverse of cvd_buying=0.55)
   - 3-bar rolling window, rolling mean
   - Confirms selling climax in both patterns

### Pending (Slice B-D)

**Slice B** (3-4 hours): FFR_SHORT Pattern
- Copy FFR structure, invert funding/delta logic
- Phases: LONG_OVERHEAT, DELTA_FLIP_NEGATIVE, CLIMAX, ENTRY_ZONE, BREAKDOWN
- Required blocks: funding_extreme_long, delta_flip_negative, volume_surge_bear
- Reference: FFR (line 168-283 in library.py)

**Slice C** (2-3 hours): GAP_FADE_SHORT Pattern
- High-low range check (intraday gap persistence)
- Volume confirmation (volume_surge_bear)
- Entry phase: ENTRY_ZONE, Target: BREAKDOWN

**Slice D** (2-3 hours): Benchmark + Tests
- Run full backtest: 30 symbols, 2024-01-01→now, 1h timeframe
- Target: reference=0.75, holdout≥0.70
- Engine tests: ≥969 passing
- PR review + merge

### Exit Criteria

1. Both patterns defined + 5/4-phase structure ✅
2. Building blocks added (Slice A) ✅
3. 30-symbol benchmark ≥0.75 (reference), ≥0.70 (holdout)
4. Engine tests pass (969+)
5. PR created + merged

### Design Notes

**FFR_SHORT inverts FFR logic:**
- FFR: SHORT_OVERHEAT (funding negative) → FLIP (negative→positive) → SQUEEZE
- FFR_SHORT: LONG_OVERHEAT (funding positive) → FLIP (positive→negative) → BREAKDOWN

**Gap Fade applies liquidity zone concept:**
- Gap up creates liquidity void
- Tight range + volume surge = sellers absorbing gap
- Break below gap = return to fair value (profitable short target)

**Wyckoff Markdown parallels:**
- FFR_SHORT = forced liquidation cascade (shorts trapped, longs dumped)
- GAP_FADE = rejection of excursion, return to previous structure

### Next Session Action

1. Create new worktree: `git worktree add .claude/worktrees/w-0106-patterns-full`
2. Start from origin/main (259279d or later)
3. Implement Slice B-D sequentially
4. Single PR with all 3 patterns + benchmarks
5. Target: <2000 LOC total, reference≥0.75

**File locations to implement:**
- `/engine/patterns/library.py`: Add FFR_SHORT + GAP_FADE_SHORT PatternObjects (lines ~600-700 each)
- Test execution: `python -m pytest tests/ -q`
- Benchmark: Use research CLI pattern-benchmark-search
