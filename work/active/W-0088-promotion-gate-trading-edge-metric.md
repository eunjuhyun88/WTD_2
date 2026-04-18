# W-0088 Promotion Gate — Trading-Edge Parallel Metric

## Goal

Add `entry_profitable_at_N` as a parallel acceptance path in the promotion gate so non-V-reversal recoveries (KOMA, DYM) can promote on trading edge alone, while strict pattern-completion (TRADOOR) continues to promote via existing 6 metrics.

## Owner

engine

## Scope

- Extend `VariantCaseResult` with `entry_close: float | None` and `forward_peak_return_pct: float | None`.
- Extend `_slice_case_frames` to load forward window of `entry_profit_horizon_bars` after `case.end_at` for return measurement only (not used in pattern detection).
- Extend `evaluate_variant_on_case` to compute entry_close + forward_peak_return when `entry_hit=True`.
- Extend `PromotionGatePolicy` with `min_entry_profit_pct`, `entry_profit_horizon_bars`, `min_entry_profitable_rate` fields (defaults: 5.0%, 48 bars, 0.5).
- Extend `PromotionReport` with `entry_profitable_rate: float` field + `gate_results["entry_profitable_rate"]` boolean.
- Modify `build_promotion_report` decision logic to OR-combine two paths:
  - **strict_pass**: all 6 original gates pass (TRADOOR-class)
  - **trading_edge_pass**: `reference_recall` + `phase_fidelity` + `lead_time_bars` + `robustness_spread` + `holdout_passed` + `entry_profitable_rate` all pass; `false_discovery_rate` waived (KOMA/DYM-class — pattern incomplete but tradeable)
- Surface decision path in `PromotionReport.decision` ("promote_candidate__strict" | "promote_candidate__trading_edge" | "reject") with reasons preserved.
- Add tests covering all four cases: V-reversal pass, slow-recovery pass via trading-edge path, pump-and-dump reject (entry/target hit but forward return < threshold), no-entry reject.

## Non-Goals

- No changes to phase-detection logic, block calibration, or state machine.
- No promotion of H6 holdouts (KOMA / FARTCOIN / DYM) into canonical benchmark pack — separate slice (W-0086 next-slice 6).
- No forward-walk simulation, slippage layer, or realistic entry price — separate slices (W-0086 next-slices 4 & 5).
- No FARTCOIN FAKE_DUMP diagnosis — separate slice (W-0086 next-slice 2).
- No removal of `breakout_above_high` dead code — separate slice (W-0086 next-slice 3).

## Canonical Files

- `engine/research/pattern_search.py` — `VariantCaseResult`, `PromotionGatePolicy`, `PromotionReport`, `_slice_case_frames`, `evaluate_variant_on_case`, `_promotion_metrics_from_cases`, `build_promotion_report`
- `engine/tests/test_pattern_search.py` — promotion gate tests
- `work/active/W-0086-checkpoint-2026-04-18.md` — context: H6 metric-conflation lesson driving this slice

## Facts

- Current gate uses `all(gate_results.values())` — single conjunction (pattern_search.py:1527).
- VariantCaseResult lacks any return-based field; only phase/entry/target booleans (pattern_search.py:212-225).
- `_slice_case_frames` clips at `end_pos + 1` — no forward bars available without explicit extension (pattern_search.py:2491-2515).
- H6 result confirmed: KOMA / DYM forward-return positive (+20.9% / +7.1%) but pattern path stops at ACCUMULATION → both rejected by current gate despite tradeable signal.
- TRADOOR completes full path → strict_pass already works; this change must not regress.

## Assumptions

- Forward window of 48 bars (= 2 days at 1h timeframe) is a reasonable default for a "trading edge" measurement; overridable via policy.
- `load_klines(..., offline=True)` provides bars beyond `case.end_at` when available — to be verified during implementation; if not, fall back to extending end_at virtually for the data fetch only.

## Open Questions

- (resolved during implementation) — None blocking start.

## Decisions

- OR-combine semantics chosen over (a) metric replacement and (b) two separate gates. Reason: preserves all existing structural information, atomic single-axis change, directly addresses H6 metric-conflation lesson without architecture-level refactor.
- `false_discovery_rate` waived in trading-edge path because by definition KOMA/DYM-class cases enter but don't reach `target_phase` → FDR=1.0 by construction; including it would defeat the parallel-path purpose.
- Forward-return measured as **peak** (max return across horizon), not close-to-close at horizon end. Rationale: TRADOOR closed-case showed +60.71% at 48h vs +111.00% peak — peak captures actionable opportunity; close-at-N is a stricter metric and can be a follow-up slice.

## Next Steps

1. ~~Implement VariantCaseResult fields + slice extension + return computation.~~ — done (commits c4bba19 + fc4e4fd)
2. ~~Implement policy + report extension + OR-gate logic.~~ — done (commit fb1e318)
3. ~~Add unit tests + verify existing tests stay green.~~ — done (5 new tests pass; full suite 720 passed, 1 pre-existing unrelated failure in test_research_inspection.py).
4. Run scratch H6 multi-symbol pack against new gate; expect KOMA / DYM to flip to `decision_path="trading_edge"`, FARTCOIN to stay rejected (no entry). **Pending — operator action.**

## Exit Criteria

- ✅ All existing engine tests still pass (no regressions). Pre-existing failures (`test_security_runtime.py` collection error, `test_research_inspection.py` AttributeError) confirmed unchanged on HEAD before commits.
- ✅ New unit tests pass: V-reversal strict, slow-recovery trading-edge, pump-and-dump reject, no-entry reject, plus parallel-path-disabled fallback.
- ✅ `PromotionReport` schema includes `entry_profitable_rate`, `entry_profitable_gate`, `decision_path` fields; decision_path values are one of `"strict" | "trading_edge" | "rejected"`.
- ✅ Atomic commit chain: each of 4 commits changes one logical axis; all commits keep baseline test count.
- ⚠️ H6 scratch verification (slice 4 above) still pending — recommended before promoting H6 holdouts into the canonical pack (W-0086 next-slice 6).

## Handoff Checklist

- Scope and decisions current.
- Next agent can run `pytest engine/tests/test_pattern_search.py` to validate.
- Forward-return measurement uses peak (decision noted above) — close-at-N is explicit follow-up if needed.
- H6 multi-symbol verification is part of exit criteria but is run on scratch tools (`/tmp/h6_run.py` recreated from W-0086 checkpoint), not committed.
