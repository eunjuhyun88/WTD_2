# W-0105 — Paradigm Autoresearch Framework: Progressive Gates

## Vision
Embed methodology rigor **progressively**, not all at once. Start fast, add depth only when needed.

---

## The 3-Gate System (Fast → Deep)

### Gate 1: Baseline Measurement ⚡ (REQUIRED — All Patterns)
**Timeline:** Week 1, 1-2 hours
**Purpose:** Rapid "go/no-go" decision
**Exit:** Promising (>0.40 win_rate) vs. Abandon (<0.35)

```python
baseline = {
    "signal_count": N,           # Daily avg signals
    "hit_rate_28d": 0.XX,        # % of signals with any return
    "win_rate_72h": 0.XX,        # % with +5% return
    "avg_return_72h": 0.XX,      # Average 72h return
    "timeframe": "1h",           # Current config
    "threshold": 0.70,
    "min_bars": 5,
}

# Decision tree:
if signal_count > 5000 and timeframe == "1h":
    print("⚠️  NOISE: Try Gate 2 (timeframe optimization)")

elif win_rate < 0.35:
    print("❌ ABANDON: Not worth further work")

elif win_rate >= 0.40:
    print("✅ PROMISING: Move to Gate 2 or promote_candidate")
```

---

### Gate 2: Timeframe Optimization ⏱️ (IF signal_count > 5000)
**Timeline:** Week 1, parallel with Gate 1
**Purpose:** Reduce false positives
**Exit:** Optimal timeframe identified (4H, 8H, etc.)

```python
# Only if Gate 1 revealed noise (10K+ signals on 1H)
sweep_timeframes = ["1h", "2h", "4h", "8h", "12h"]

# Run parallel backtests for each
# Pick winner: max(win_rate) AND min(signal_count)

# Example: WSR 1H (10,947 signals) → 4H (718 signals)
# Same 40% win_rate, 93% fewer false positives = WINNER
```

---

### Gate 3: Multi-Period Robustness 📊 (IF win_rate < 0.65 OR pattern marginal)
**Timeline:** Week 2-3, 3-4 hours per period
**Purpose:** Validate robustness across market regimes
**Exit:** Robust pattern (±10% win_rate across periods) vs. Regime-specific fluke

```python
test_periods = [
    ("BEAR_2022-23", "2022-06-01", "2023-06-30"),
    ("BULL_2024", "2024-01-01", "2024-12-31"),
    ("MEGA_BULL_2025+", "2025-01-01", "2026-04-19"),
]

results = {}
for name, start, end in test_periods:
    metrics = backtest(pattern, start, end)
    results[name] = metrics["win_rate"]

# ROBUST if max(results) - min(results) <= 0.10
# RISKY if variance > 0.15
```

---

## Deep Dives: Only If Gates 2-3 Reveal Issues

### Deep Dive 4A: From-Scratch Redesign
**Trigger:** Win_rate <0.50 OR multi-period shows structural failure
**Effort:** 1-2 weeks
**Method:** Extract success factors from best pattern (FFR), rebuild

---

### Deep Dive 4B: Negative Result Logging
**Trigger:** See same failure twice (e.g., "higher_lows_sequence timeout on altcoins")
**Effort:** 4-8 hours per failure
**Method:** Document failure → prevent in next pattern

---

### Deep Dive 5: Architecture Exploration
**Trigger:** No gate passes despite multiple iterations
**Effort:** 2-3 weeks
**Method:** Try event-driven, ML clustering, or exit-timing model

---

## Implementation: Check-as-You-Go

### Python API (Recommended)
```python
from engine.research.paradigm_framework import ParadigmFramework, BaselineMetrics

fw = ParadigmFramework(pattern_name="pattern-x")

# Gate 1: ALWAYS
baseline = BaselineMetrics(signal_count=700, hit_rate_28d=0.45, ...)
fw.set_baseline(baseline)

# Gate 2: IF signal_count > 5000
if baseline.signal_count > 5000:
    sweep_result = run_parallel_sweep()
    fw.set_parallel_sweep(sweep_result)

# Gate 3: IF win_rate < 0.65
if baseline.win_rate_72h < 0.65:
    period_result = run_multi_period()
    fw.set_multi_period(period_result)

# Report: shows what you DID + what you SKIPPED
report = fw.generate_report()
print(report.to_markdown())
```

### CLI Interface
```bash
# Minimal: Gate 1 only
python -m engine.research.cli_paradigm \
  --pattern pattern-x \
  --baseline-metrics \
  --output ./reports/

# With optimization: Gate 1 + 2
python -m engine.research.cli_paradigm \
  --pattern pattern-x \
  --baseline-metrics \
  --parallel-sweep \
  --output ./reports/

# Full validation: Gate 1 + 2 + 3
python -m engine.research.cli_paradigm \
  --pattern pattern-x \
  --baseline-metrics \
  --parallel-sweep \
  --multi-period "2022-06,2023-06 2024-01,2024-12 2025-01,2026-04" \
  --output ./reports/
```

---

## Scoring: Reflects What You Actually Did

```python
# NOT: "Why didn't you do all 5 methodologies?"
# BUT: "What gates did you pass? What gates remain?"

score = {
    "gate_1_baseline": ✅ done,
    "gate_2_timeframe": ⏭️ skipped (signal_count < 5000),
    "gate_3_multiperiod": ❌ not done yet,
    "deep_dives_triggered": [] (none needed),

    "overall_readiness": "PROMOTE_CANDIDATE (gates 1-2 passed)",
}
```

---

## W-0103/W-0104 Application

| Gate | Status | What To Do |
|------|--------|-----------|
| 1. Baseline | ✅ Done | WSR 4H: 700 signals, 40% win_rate |
| 2. Timeframe | ✅ Done | 1H → 4H sweep proved 4H optimal |
| 3. Multi-Period | ⏭️ Skip for now | Not needed (win_rate already 0.40+) |
| Deep Dives | ❌ Not triggered | Only if gate 3 shows weakness |

**Decision:** WSR/VAR ready for promote_candidate after gates 1-2. Gate 3 deferred.

---

## Checklist: Every Pattern Discovery Session

```
Gate 1: Baseline Measurement (REQUIRED)
  [ ] Signal count measured
  [ ] Hit rate 28d calculated
  [ ] Win rate 72h calculated
  [ ] Avg return 72h calculated
  [ ] Go/no-go decision made

Gate 2: Timeframe Optimization (IF noise detected)
  [ ] Sweep 4-6 timeframes in parallel
  [ ] Pick optimal (max win_rate, min signal_count)
  [ ] Lock in library.py

Gate 3: Multi-Period Robustness (IF marginal)
  [ ] Test bear market (2022-23)
  [ ] Test bull market (2024)
  [ ] Test mega-bull (2025+)
  [ ] Check variance < ±10%

Deep Dives: Only If Needed
  [ ] (triggered by gate failures)
```

---

## Success Metrics

- **Pattern library entry has:** Gate 1 + 2 minimum (gate 3 optional)
- **Every pattern can answer:** "What gates passed? What gates remain?"
- **Honest score:** Shows what was validated, what was skipped
- **No vanity metrics:** Only gates that materially improved the pattern count

---

## Why This Works

✅ **Fast:** Baseline + timeframe = 1 week
✅ **Rigorous:** Gates are evidence-based (not ceremonial)
✅ **Selective:** Deep dives only when gates fail
✅ **Honest:** Score reflects actual work done
✅ **Scalable:** Same gates apply to pattern 1 or pattern 50
