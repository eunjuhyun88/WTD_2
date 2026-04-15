# W-0040 Pattern Candidate Capture Contract

## Goal

Expose enough engine-owned candidate metadata for `/terminal` Save Setup to create a canonical `CaptureRecord`.

## Owner

contract

## Scope

- Extend pattern candidate responses with candidate records that include `transition_id`.
- Preserve the existing `entry_candidates` shape for current app compatibility.
- Include phase, timeframe, pattern version, scan id, block scores, and feature snapshot when available.
- Add targeted engine route/helper tests for the richer candidate response.

## Non-Goals

- No app Save Setup rewiring in this slice.
- No new alert policy engine.
- No outcome/verdict UI changes.
- No removal of legacy `entry_candidates`.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0040-pattern-candidate-capture-contract.md`
- `engine/patterns/scanner.py`
- `engine/patterns/state_store.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_patterns_scanner.py`

## Facts

- `CaptureRecord` now requires a valid `candidate_transition_id` for `pattern_candidate` captures.
- `/patterns/candidates` now returns legacy `entry_candidates` plus rich `candidate_records`.
- `PatternStateStore.pattern_states.last_transition_id` links an active state to the durable transition evidence.
- Existing app consumers need `entry_candidates` to remain backward compatible.

## Assumptions

- Candidate records can be derived from durable state plus the referenced transition.
- Missing transition evidence should not remove the legacy symbol from `entry_candidates`; it should only omit rich evidence fields.

## Open Questions

- Whether future app routes should expose these records as-is or map them to camelCase in an app contract adapter.

## Decisions

- Add `candidate_records` alongside `entry_candidates`, not instead of it.
- Treat engine response field names as snake_case.
- Use `transition_id` as the canonical Save Setup linkage key.
- Use `W-0040` for this follow-up contract work because `W-0038` is reserved for the CTO integration board.

## Next Steps

1. Land the candidate metadata contract with the capture-record engine slice.
2. Start the app slice that maps `candidate_records` into PatternStatusBar and ChartBoard Save Setup context.
3. Keep `/api/engine/captures` as the only canonical pattern candidate Save Setup target.

## Exit Criteria

- `/patterns/candidates` returns legacy symbols plus rich candidate records.
- Each rich record includes `transition_id` when state evidence exists.
- Existing candidate consumers remain compatible.
- Targeted engine tests pass.

## Handoff Checklist

- Active branch: `codex/w-0037-pattern-capture-record-clean`
- Verification status: pending in this cleaned branch.
- Remaining blockers: app Save Setup still needs a later app slice.
