# W-0106: SHORT Patterns — FFR_SHORT + GAP_FADE_SHORT

## Goal
Implement short (bearish reversal) pattern counterparts to existing long patterns.
Enable trading downside reversals + fill gaps on the short side.

## Scope
- **FFR_SHORT**: Funding Flip Reversal (short) — bearish version of FFR
  - Negative funding extreme → delta flip to selling
  - Lower highs + selling climax structure
  - Entry: sustained selling pressure + order-flow confirmation

- **GAP_FADE_SHORT**: Gap Fade Short — exploit upside gaps
  - Large gap up + quick rejection
  - Selling climax + return to fair value
  - Entry: volume surge down after gap + lower highs

## Non-Goals
- Portfolio rebalancing (separate concern)
- Stop-loss optimization (use existing P_WIN gates)
- Risk management beyond existing framework

## Exit Criteria
1. Both patterns defined + 5-phase structure complete
2. Building blocks added (atr_ultra_low, liq_zone_squeeze_setup, volume_surge_bear)
3. 30-symbol benchmark ≥ 0.75 (reference), ≥ 0.70 (holdout)
4. Engine tests pass (968+)
5. PR created + code review complete

## Implementation Plan

### Slice A: Building Blocks (2-3 hours)
- atr_ultra_low: Volatility drying up (inverse of squeeze)
- liq_zone_squeeze_setup: Liquidity cluster identification
- volume_surge_bear: Elevated sell volume confirmation

### Slice B: FFR_SHORT Pattern (3-4 hours)
- 5 phases: FUNDING_EXTREME → DELTA_FLIP → CLIMAX → ENTRY_ZONE → BREAKDOWN
- Copy FFR structure, invert delta logic
- Required blocks: funding_extreme_negative, delta_flip_negative, volume_spike_down

### Slice C: GAP_FADE_SHORT Pattern (2-3 hours)
- 4 phases: GAP_UP → REJECTION → CLIMAX → ENTRY_ZONE
- High-low range check + volume confirmation
- Post-market setup required (gap persistence)

### Slice D: Benchmark + Tests (2-3 hours)
- Run full backtest on both patterns
- Verify holdout scores ≥ 0.70
- Engine CI + Vercel checks

## Notes
- Use delta_flip_negative (new) for short delta confirmation
- Reference: Wyckoff markdown phase inversion
- Profit target: gap low for gap-fade, previous swing for FFR_short
