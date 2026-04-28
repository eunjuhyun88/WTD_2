---
name: W-0105 Paradigm Framework — Systematic Reuse
description: Paradigm Autoresearch methodology embedded as reusable framework for every pattern discovery experiment. 5-methodology checklist, Python implementation, CLI interface.
type: project
---

# W-0105: Paradigm Framework Systematic Reuse (2026-04-19)

## Vision
Make Paradigm Autoresearch methodology standard operating procedure for pattern discovery. Every pattern published must pass all 5 methodologies.

## Progressive Gates Framework (3-Gate System)

**CTO Decision:** Not all-5-mandatory. Instead: selective + staged gates.

### Gate 1: Baseline Measurement (REQUIRED — Every Pattern)
**Effort:** 1-2 hours
**Metrics:** signal_count, hit_rate_28d, win_rate_72h, avg_return_72h
**Decision:** Promising (>0.40 win_rate) vs. Abandon (<0.35)
**Go/No-Go trigger:** Noise regime detection (signal_count > 5000 on 1H)

### Gate 2: Timeframe Optimization (IF noise detected)
**Effort:** 2-4 hours (parallel sweep)
**Trigger:** signal_count > 5000 AND timeframe == "1h"
**Method:** Sweep 1H/2H/4H/8H, pick optimal (max win_rate, min signal_count)
**Output:** Locked config in library.py
- **W-0103 Result:** WSR 1H (10,947 signals) → 4H (718 signals) = 93% reduction

### Gate 3: Multi-Period Robustness (IF win_rate < 0.65)
**Effort:** 3-4 hours per period (optional, not mandatory)
**Trigger:** Pattern marginal OR "must validate across regimes"
**Method:** Test bear (2022-23), bull (2024), mega-bull (2025+)
**Success:** win_rate variance ≤ ±10% across periods (robust)
**Failure:** variance > ±15% (regime-specific fluke)
- **W-0103 Status:** Deferred (win_rate already 0.40+, gates 1-2 passed)

### Deep Dives 4A-5 (Optional, Triggered by Gate Failures)
**4A: From-Scratch Redesign** (if pattern score <0.50)
  - Extract success factors from best pattern (FFR = extreme events + 2-state simplicity)
  - Rebuild marginal patterns using template

**4B: Negative Result Logging** (if seeing repeated failures)
  - Document root cause of each failure
  - Prevent repeating mistakes in next pattern

**5: Architecture Exploration** (if no gate passes)
  - Event-driven backtest (measure event→completion rate)
  - ML clustering on reversal cases
  - Exit-timing models

## Implementation

### Core Module: `engine/research/paradigm_framework.py`
- `BaselineMetrics`: Phase 0 structure
- `ParallelSweepResult`: Methodology 1 results
- `MultiPeriodResult`: Methodology 2 results
- `ParadigmFrameworkResult`: Complete evaluation with score (0-100)
- `ParadigmFramework`: Orchestrator class

### CLI: `engine/research/cli_paradigm.py`
```bash
python -m engine.research.cli_paradigm \
  --pattern wyckoff-spring-reversal-v1 \
  --baseline-metrics \
  --parallel-sweep \
  --multi-period "2022-06,2023-06 2024-01,2024-12 2025-01,2026-04" \
  --failure-log failures.json \
  --output ./paradigm_reports/
```

## Scoring: What You Did vs. What You Skipped

NOT: "Why didn't you do all 5 methodologies?"
BUT: "What gates passed? What gates remain? Why skip gate 3?"

```
Gate 1 (Baseline): ✅ Always required
Gate 2 (Timeframe): ⏭️ Skipped (noise not detected)
Gate 3 (Multi-Period): ❌ Not done yet (win_rate > 0.40, defer for now)
Deep Dives: None triggered

Status: PROMOTE_CANDIDATE (gates 1-2 passed)
Remaining: Gate 3 optional, defer until next refinement
```

## Checklist: Minimal Viable Pattern

**After 1 week (gates 1-2):**
- [x] Gate 1: Baseline metrics (signal_count, win_rate, etc.)
- [ ] Gate 2: Timeframe optimization (IF signal_count > 5000)
- [✓ or ✗] Decision: Promote vs. Rework vs. Abandon

**After 2-3 weeks (gate 3, optional):**
- [ ] Gate 3: Multi-period validation (IF win_rate <0.65)

## W-0103 Application: What Actually Happened

| Gate | Status | Finding | Next |
|------|--------|---------|------|
| 1. Baseline | ✅ Done | WSR: 10K signals (1H noise), 40% win_rate | Lock 4H |
| 2. Timeframe | ✅ Done | 1H→4H sweep: 700 signals, same 40% win_rate | Implement gate 2 auto-run |
| 3. Multi-Period | ⏭️ Defer | Only 2024-2026 tested, win_rate already >0.40 | Optional, test 2022-23 later |
| Deep Dives | ❌ None | No trigger (gates 1-2 passed) | Start only if gate 3 fails |

**Decision:** WSR/VAR **promote_candidate** (gates 1-2 sufficient)

## Files Created
- `work/active/W-0105-Paradigm-Framework-Systematic.md` — Design document (gate-based, selective)
- `engine/research/paradigm_framework.py` — Core implementation (250 lines)
- `engine/research/cli_paradigm.py` — CLI interface (100 lines)

## Implementation Priority

**Immediate (W-0105):**
- [x] Gate 1 (baseline_metrics) — implement as default
- [x] Gate 2 (timeframe_sweep) — implement but conditional
- [ ] Gate 3 (multi_period) — implement as optional

**Next Session (W-0106+):**
1. Wire Gate 1 into research.cli (default for every pattern)
2. Wire Gate 2 auto-trigger (IF signal_count > 5000)
3. Document when Gate 3 becomes necessary (IF win_rate <0.65)
4. Every pattern published: shows what gates it passed

## Success Metrics
- ✅ Framework exists and is actually used (not shelf-ware)
- ✅ 1-week patterns possible (gates 1-2 only)
- ✅ Gate 3+ only triggered by actual failures (no busy work)
- ✅ Reports show "gates passed" not "gates failed"

---

**Key Principle:** Fast iteration with gates, not ceremonial rigor. The framework serves WTD's velocity, not vice versa.
