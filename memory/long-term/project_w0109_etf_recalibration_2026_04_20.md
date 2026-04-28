---
name: W-0109 ETF-era Recalibration Complete
description: W-0109 ETF-era block recalibration — 4 ETF lambda aliases + 3 pattern demotions. 1062 tests pass. commit dcee64d on claude/stupefied-mirzakhani (2026-04-20)
type: project
---

W-0109 ETF-era recalibration complete (2026-04-20, commit dcee64d, branch claude/stupefied-mirzakhani).

**Why:** Post-ETF structural changes (institutional FR arb, distributed order execution, OI market growth) reduced reliability of pre-2024 block thresholds.

**Strategy:** Block defaults preserved for range-compatibility; per-pattern overrides via named lambda aliases.

**New ETF aliases in block_evaluator.py:**
- `funding_extreme_short_etf`: 6 bps (was 10 bps) — FR arb suppresses extremes
- `absorption_signal_etf`: price_move 0.25%, CVD 0.58 (was 0.5%, 0.55) — distributed exec shrinks per-unit impact
- `total_oi_spike_etf`: 8% threshold (was 5%) — OI market growth means 5% is now routine
- `coinbase_premium_positive_etf`: z≥0.9 (was 0.5) — ETF arb spikes pollute CBP

**Pattern changes in library.py:**
- FFR SHORT_OVERHEAT: `funding_extreme_short` → `funding_extreme_short_etf` (6bps)
- WHALE BOTTOM_CONFIRM: `ls_ratio_recovery` required → soft (retail L/S misses OTC institutional legs)
- ALPHA_CONFLUENCE CVD_SIGNAL: `delta_flip_positive` required → required_any_groups with absorption_signal/cvd_buying
- INSTITUTIONAL_DISTRIBUTION LIQUIDITY_WEAKENING: `total_oi_spike` → `total_oi_spike_etf` (8%)

**Tests:** 1062 pass, 4 skipped (pre-existing CBR cache miss unrelated).

**Pending from W-0109:**
- Slice 2: cvd_cumulative feature pipeline (deferred)
- Slice 3: Glassnode LTH/MVRV → W-0110

**How to apply:** ETF-era threshold changes are complete for the current pattern set. If adding new patterns that use funding/absorption/OI blocks, prefer the `_etf` variants unless targeting altcoin-only universe where ETF arb doesn't apply.
