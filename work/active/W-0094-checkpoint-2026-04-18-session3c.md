# W-0094 Checkpoint — 2026-04-18 Session 3c

## Session Summary

W-0088 Phase B 완료: pending capture → PatternOutcome 자동 해소 (flywheel axis 2 닫힘).

## Commit

| hash | description |
|------|-------------|
| `d0b8f85` | feat(W-0088-B): flywheel closure — outcome resolver (axis 1→2) |

## What Changed

### engine/patterns/outcome_policy.py (new)
- `OutcomePolicy` dataclass: hit_threshold_pct=+0.15, miss_threshold_pct=-0.10, evaluation_window_hours=72.0
- `OutcomeDecision` dataclass: outcome + entry/peak/exit prices + max_gain/exit_return pcts
- `decide_outcome(entry_price, forward_closes, policy) → OutcomeDecision | None`
  - peak≥hit → success, else exit≤miss → failure, else timeout
  - success takes precedence when both would trigger
- `policy_for(pattern_slug)` + `register_policy(slug, policy)` — per-pattern hook

### engine/scanner/jobs/outcome_resolver.py (new)
- `resolve_outcomes(now_ms_val, capture_store, ledger_store, klines_loader)` — injectable for tests
- Walks distinct policy windows via `CaptureStore.list_due_for_outcome`
- Per capture: loads OHLCV → entry_price from bar at/after captured_at_ms → forward closes inside window → decide_outcome → PatternOutcome save → LEDGER:outcome append → capture status=outcome_ready
- Idempotent (skips non-pending captures); data-missing captures stay pending_outcome
- `outcome_resolver_job()` async entrypoint for APScheduler

### engine/capture/store.py
- `list(status=...)` filter added
- `list_due_for_outcome(now_ms_val, window_hours, limit)` — SQL cutoff query
- `update_status(capture_id, status, outcome_id?, verdict_id?)` — returns bool

### engine/scanner/scheduler.py
- Job 3b `outcome_resolver` registered — hourly interval, max_instances=1, coalesce

## Tests

- `test_outcome_policy.py` (8): success/failure/timeout, custom thresholds, HIT-wins, empty/non-positive, ledger-constant guard
- `test_outcome_resolver.py` (5): success promotion, failure promotion, still-inside-window skip, no-forward-data skip, idempotent second run
- **759 engine tests green (+13 new)**, 0 regression

## Flywheel Status
- Axis 1 (Capture): **CLOSED** (W-0088 Phase A)
- Axis 2 (Outcome): **CLOSED** — this commit
- Axis 3 (Verdict): open — Phase C (dashboard inbox + POST /verdict)
- Axis 4 (Refinement): open — Phase D (refinement_trigger.py)

## Next Recommended
Phase C — dashboard verdict inbox + `engine/api/routes/verdict.py`, or  
Phase D — `engine/scanner/jobs/refinement_trigger.py` (time + verdict-count gated).

Phase C 가 axis 3 를 닫아 "user 라벨 → training data" 경로를 완성하므로 먼저 권장.
