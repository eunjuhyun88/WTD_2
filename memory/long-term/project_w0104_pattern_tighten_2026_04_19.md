---
name: W-0104 Pattern Condition Tightening (PR #103 merged)
description: Tighten WSR/VAR entry conditions to reduce noise signals from 10K→<500 (30 symbols, 2024-01+)
type: project
---

## W-0104: Pattern Condition Tightening

**Merged:** 2026-04-19, commit e148a50 → main

### Root Cause

W-0104 backtest (30 symbols, 2024-01-01→now) showed:
- **WSR**: 10,947 signals/year = fires ~every hour on every symbol (noise)
- **VAR**: 8,212 signals/year = same root cause
- **FFR**: 27 signals/year = only pattern with positive edge (+5.3% avg 72h)

Issue: entry phase thresholds equalled the weight of a single required block.
- WSR SIGN_OF_STRENGTH: `higher_lows_sequence` weight=0.55, threshold=0.55 → single block passes
- VAR BASE_FORMATION: `higher_lows_sequence` weight=0.60, threshold=0.60 → same
- No prior-decline context gate on either pattern

### Changes (engine/patterns/library.py)

#### WSR (Wyckoff Spring Reversal)

**COMPRESSION_ZONE**
- Added `recent_decline` to `required_blocks` (≥10% drop in 72h)
- Prevents Bollinger squeezes on uptrending assets from entering pattern

**SIGN_OF_STRENGTH**
- Added `required_any_groups=[["breakout_volume_confirm", "cvd_buying"]]`
- Wyckoff SoS must have volume OR flow confirmation, not just rising lows
- Raised `phase_score_threshold`: 0.55 → 0.65

#### VAR (Volume Absorption Reversal)

**SELLING_CLIMAX**
- Added `recent_decline` to `required_blocks`
- Volume spike must follow actual decline, not random vol spike on uptrend

**ABSORPTION**
- Added `required_any_groups=[["absorption_signal", "volume_dryup"]]`
- Delta flip must be accompanied by Wyckoff secondary test: price-flat CVD buying OR supply exhaustion

**BASE_FORMATION**
- Promoted `volume_dryup` from soft→required
- Raised `phase_score_threshold`: 0.60 → 0.70
- Reasoning: base with elevated volume is distribution, not accumulation

### Tests

- 968 tests pass (full suite)
- Engine CI ✅
- Vercel ✅

### Target Metrics (pending verification with full backtest)

- WSR n_signals: 10,947 → target <500
- VAR n_signals: 8,212 → target <500
- FFR: unchanged (~27, +5.3% edge maintained)

**Why:** Wyckoff requires context gates (prior decline) and secondary confirmation (volume/flow) before accepting a pattern entry. W-0104 showed these gates are not optional—without them, any market noise triggers thousands of false entries per year.

**How to apply:** Before promoting new patterns, verify n_signals <500 on 30-symbol universe over 1+ year. Use backtest with tight entry conditions (recent decline context + secondary confirmation mandatory).
