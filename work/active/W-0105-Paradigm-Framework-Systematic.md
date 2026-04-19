# W-0105 — Paradigm Autoresearch Framework (Systematic Reuse)

## Vision
Embed Ryan Li's Paradigm Autoresearch methodology into every pattern discovery, optimization, and experiment cycle. Make methodology checks as automatic as test coverage.

## Paradigm Framework Checklist (Apply to Every Pattern/Experiment)

### Phase 0: Baseline Measurement (Required)
Before optimization begins:

```python
# ALWAYS establish baseline metrics
baseline = {
    "signal_count": measure_signal_count(),           # Total signals generated
    "hit_rate": measure_hit_rate(days=28),           # % of signals with forward return >0
    "avg_return": measure_avg_return(days=72),       # Average forward 72h return
    "win_rate": measure_win_rate(days=72),           # % signals with +5% or better
    "timeframe": current_config.timeframe,            # What TF are we using?
    "threshold": current_config.threshold,            # Sensitivity level
    "min_bars": current_config.min_bars,              # Minimum bars requirement
}

# Question: Is baseline in "noise" regime?
# WSR 1H: 10K signals = noise. 4H: 700 signals = signal
```

---

### Methodology 1: Parallel Parameter Sweep (P0 — Highest Priority)

**Problem:** Manual tuning (change timeframe → test → linter reverts → repeat)

**Solution:** Auto-test all combinations simultaneously

```python
# engine/research/optimization/parallel_sweep.py (NEW)

param_grid = {
    "timeframe": ["1h", "2h", "4h", "8h"],
    "min_bars": [3, 5, 8, 12],
    "threshold": [0.60, 0.70, 0.80, 0.90],
    "required_groups": [
        [],                              # Strictest: no soft requirements
        [["volume_confirm", "dvol"]],   # Moderate: volume confirmation
        [["all_conditions"]],            # Loose: all conditions required
    ]
}

# Run all 4×4×4×3 = 192 combinations in parallel
# Each backtest tests pattern across 2024-01-01 → today
# Returns: sorted by [win_rate DESC, avg_return DESC, signal_count ASC]

# DECISION RULE:
# 1. If multiple configs have similar win_rate, pick highest win_rate + lowest signal_count
# 2. Never pick a config with >10K daily-average signals (noise threshold)
# 3. Document WHY the winner is optimal
```

**Exit Criteria:**
- ✅ All 192 (or pattern-specific) combinations tested
- ✅ Optimal config identified with clear rationale
- ✅ Config locked in library.py (no manual revert)
- ✅ Baseline metrics improved (signal reduction OR return improvement)

**Applied to W-0103:** WSR 1H (10K signals, noise) → 4H (700 signals, structure)

---

### Methodology 2: Multi-Period Validation (P1 — Essential for Robustness)

**Problem:** All patterns tested on 2024-01 → 2026-04 (only bull market). What about bear markets?

**Solution:** Test across 3+ distinct market regimes

```python
# engine/research/validation/multi_period.py (NEW)

periods = {
    "BEAR_2022Q3_Q4": {"start": "2022-06-01", "end": "2023-06-30"},    # Crash + recovery
    "BULL_2024": {"start": "2024-01-01", "end": "2024-12-31"},          # Strong bull
    "MEGA_BULL_2025+": {"start": "2025-01-01", "end": "2026-04-19"},    # Extreme bull
}

for period_name, period_dates in periods.items():
    metrics = backtest(pattern, period_dates)
    results[period_name] = {
        "signal_count": metrics["count"],
        "win_rate": metrics["win_rate"],
        "avg_72h": metrics["avg_return_72h"],
    }

# DECISION RULE:
# Robust pattern = consistent metrics across ALL periods
# RED FLAG: pattern only works in one period → regime-specific → brittle
```

**Exit Criteria:**
- ✅ Tested on bear/bull/mega-bull periods
- ✅ Win rate within ±10% across periods (robustness threshold)
- ✅ Document which periods show degradation (if any)
- ✅ If fails: re-tune pattern to be period-agnostic

**Applied to W-0103:** WSR/VAR/FFR all tested 2024-2026. Need to test 2022-2023 bear market.

---

### Methodology 3: From-Scratch Restarts (P1 — For Radical Improvement)

**Problem:** Pattern may be built on wrong foundational assumptions. Example: WSR based on Wyckoff textbook, but what if WSR structure is suboptimal?

**Solution:** Use ONE proven pattern as template, extract success factors, rebuild others

```python
# Step 1: Identify the ONE pattern that actually works
# W-0103: FFR only pattern with +5.3% avg_72h edge

# Step 2: Analyze FFR success factors
ffr_factors = {
    "trigger": "funding rate extreme (>0.001)",        # Clear external event
    "timeframe": "1h",                                  # Short frame = responsive
    "states": 2,                                        # EXTREME → REVERSAL (simple)
    "data_source": "external (Binance funding API)",    # NOT OHLCV-only
}

# Step 3: Apply to WSR
# Current WSR: 5 phases (COMPRESSION→SPRING→SOS→LPS→MARKUP) = complex
# Redesigned WSR: 3 phases (EXTREME_SELL→ABSORPTION→BREAKOUT) = simple
# Rationale: Reduce false positives from over-specification

# Compare: WSR v1 (10K signals) vs WSR v2-redesigned (500 signals)
# If WSR v2 maintains 40%+ hit rate, redesign is valid
```

**Exit Criteria:**
- ✅ Success factors of best pattern explicitly documented
- ✅ Redesigned pattern tested against baseline
- ✅ At least 30% signal reduction achieved
- ✅ Hit rate ≥ baseline

**Status for W-0103:** Documented in paradigm analysis. WSR redesign not yet started.

---

### Methodology 4: Negative Result Logging (P2 — Documentation)

**Problem:** Only success cases recorded. Why did pattern fail on SYMBOL X? Prevents learning.

**Solution:** Log all failures with root cause

```python
# engine/research/logging/failure_catalog.md (NEW)

| Symbol | Date | Phase Failed | Root Cause | Lesson |
|--------|------|------------|-----------|--------|
| PEPE | 2025-10 | higher_lows_sequence | 8-bar gap (timeout) | Min_bars=16 too strict for altcoins |
| SOLANA | 2024-Q2 | volume_spike_down | σ threshold 3 too loose | Alts have higher volatility |
| DOGE | 2025-05 | compression_detect | false positive on wedge | Need volatility filter |

# Benefits:
# 1. Future design: never repeat same mistake
# 2. Pattern family signals: "this pattern fails on low-cap alts"
# 3. ML training: negative examples improve model calibration
```

**Exit Criteria:**
- ✅ Failure catalog exists
- ✅ At least 10 documented failures with root causes
- ✅ Pattern design updated to address recurring failures

---

### Methodology 5: Multi-Model Architecture Exploration (P2 — Long-term)

**Problem:** Current system: bar-by-bar state machine. Are there better architectures?

**Solution:** Explore 3 alternative architectures

#### 5A: Event-Driven Backtest
```python
# Instead of: scan all bars, detect pattern
# Do: start from known events, measure completion rate

compression_events = load_compression_events()  # 114K events
for event in compression_events:
    if pattern_completes_within(event, 28_days):
        measure_forward_return()
# Metric: "45% of compression events → breakout within 28d"
# vs "pattern detection rate: 200 signals/month"
```

#### 5B: ML-Driven Discovery
```python
# Instead of: hand-design phases
# Do: cluster all reversal candles, find natural patterns

reversals = load_all_bottom_reversals()  # 5000+ cases
features = vectorize_ohlcv(reversals)
clusters = kmeans(features, k=4)
# Result: auto-discovered 4 natural patterns (might differ from TRADOOR/FFR/WSR)
```

#### 5C: Exit Timing Model
```python
# Current problem: entry detected, exit unclear
# Solution: add EXIT_PULLBACK phase to measure profit-taking

VAR v2 = {
    "SELLING_CLIMAX": ...,
    "ABSORPTION": ...,
    "BASE_FORMATION": ...,
    "BREAKOUT": ...,
    "EXIT_PULLBACK": measure_profit_taking(),  # NEW
}
# Now: entry + exit are both time-bounded
```

**Exit Criteria:**
- ✅ Designed (not implemented unless promising)
- ✅ Comparison to baseline: does alt architecture improve metrics?

---

## Implementation: Embed Framework in Code

### Option A: CLI Command (Recommended)
```bash
# Use standard CLI for every experiment
python -m engine.research.paradigm_framework \
  --pattern wyckoff-spring-reversal-v1 \
  --base-metrics                    # Phase 0
  --parallel-sweep                  # Methodology 1
  --multi-period 2022-01 2026-04   # Methodology 2
  --from-scratch-candidates ffr     # Methodology 3 (optional)
  --failure-log                      # Methodology 4 (optional)
  --report output/paradigm_report.md # Write results
```

### Option B: Python API (For Agents)
```python
from engine.research.paradigm_framework import ParadigmFramework

fw = ParadigmFramework(pattern="wyckoff-spring-reversal-v1")
fw.measure_baseline()
fw.run_parallel_sweep(grid=custom_grid)
fw.validate_multi_period(periods=["2022-06:2023-06", "2024-01:2024-12", "2025-01:2026-04"])
fw.generate_report()
```

---

## Checklist for Every Pattern Discovery Session

**Before starting a new pattern (W-0106, W-0107, etc.):**

- [ ] Phase 0: Baseline metrics established (signal_count, hit_rate, win_rate)
- [ ] Methodology 1: Parallel sweep completed (or documented why skipped)
- [ ] Methodology 2: Multi-period validation planned (at least 3 regimes)
- [ ] Methodology 3: From-scratch restart considered (vs incremental tuning)
- [ ] Methodology 4: Failure catalog started (minimum 5 documented failures)
- [ ] Methodology 5: Architecture exploration brainstorm done

**When publishing pattern (promote_candidate):**
- [ ] All 5 methodologies have been applied
- [ ] Trade-offs documented (why this config vs alternatives)
- [ ] Failure modes documented (when pattern breaks)
- [ ] Period validation passed (robust across regimes)

---

## W-0103 Application Summary

| Methodology | Status | W-0103 Findings | Next Action |
|-------------|--------|-----------------|-------------|
| Phase 0 (Baseline) | ✅ Done | WSR 1H=10K (noise), 4H=700 (signal) | Lock 4H in library.py |
| 1. Parallel Sweep | ❌ Manual | 4H found empirically, not systematic | Automate: sweep_parameters.py |
| 2. Multi-Period | ❌ Pending | Only 2024-2026 tested | Test 2022-2023 bear market |
| 3. From-Scratch | 📋 Analyzed | FFR success factors extracted | WSR v2 redesign (3→5 phases) |
| 4. Neg. Results | ❌ Minimal | FARTCOIN timeout documented | Expand failure catalog |
| 5. Multi-Model | 📋 Proposed | Event-driven, ML clustering outlined | Architecture A/B test |

---

## Next Session (W-0105 Implementation)

1. **Immediate:** Create `engine/research/paradigm_framework.py` CLI
2. **Week 1:** Run on VAR + WSR patterns (W-0103/W-0104)
3. **Week 2+:** Apply to every new pattern discovery
4. **Metrics:** Track framework adoption (% of patterns that pass all 5 methodologies)

---

## Success Metric

> "Every pattern published in PATTERN_LIBRARY has full Paradigm Framework documentation."

Once this is standard, pattern quality becomes systematic, not serendipitous.
