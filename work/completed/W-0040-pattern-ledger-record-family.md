# W-0040 Pattern Ledger Record Family

## Goal

Add an append-only pattern ledger record family so the core loop can measure `entry -> capture -> outcome -> verdict` flow without overloading `PatternOutcome`.

## Owner

engine

## Scope

- Introduce append-only `LedgerRecord` types for `entry`, `capture`, `score`, `outcome`, `verdict`, and `model`.
- Persist records as JSON, separate from `PatternOutcome` projection files.
- Emit records from existing pattern entry, capture, outcome-close, and verdict paths.
- Add record-family stats with at least `entry_count`, `capture_count`, and `capture_to_entry_rate`.

## Non-Goals

- No database migration away from JSON.
- No app/UI changes in this slice.
- No replacement of `PatternOutcome` or `CaptureRecord`.
- No pattern-specific model training redesign.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0040-pattern-ledger-record-family.md`
- `engine/ledger/types.py`
- `engine/ledger/store.py`
- `engine/patterns/scanner.py`
- `engine/api/routes/captures.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_ledger_store.py`
- `engine/tests/test_capture_routes.py`
- `engine/tests/test_patterns_scanner.py`

## Facts

- `PatternOutcome` is currently both the read model and the only durable trace of entry/outcome events.
- `CaptureRecord` now canonically links Save Setup to `candidate_transition_id`, but that linkage is not yet reflected in the ledger family.
- `entry:capture` ratio is the first operational quality metric for pattern noise.
- Existing worktree has unrelated app/memory changes; this slice must stay engine-only.
- `entry`, `score`, `capture`, `outcome`, and `verdict` emission now exist through current scanner/capture/pattern routes. `model` exists as store capability but is not auto-emitted yet.

## Assumptions

- Append-only JSON files are sufficient for this stage.
- `model` record emission can start as an explicit store capability even if no pattern-specific trainer emits it yet.

## Open Questions

- Whether later we want one unified event store for capture + ledger or keep them intentionally separated.

## Decisions

- Keep `PatternOutcome` as a projection/read model.
- Add `LedgerRecord` as the append-only event family beside it.
- Include `capture` in the family even though it lives in a separate capture plane, because `entry:capture` ratio is a required metric.

## Next Steps

1. Commit the engine-only ledger family slice.
2. Next slice: decide whether pattern-specific training should emit `model` records directly.
3. Expose record-family timeline/list endpoints only if the app actually needs them.

## Exit Criteria

- Entry creates `entry` and `score` records.
- Save Setup capture creates a `capture` record.
- Outcome close creates an `outcome` record.
- User verdict creates a `verdict` record.
- Pattern stats expose `capture_to_entry_rate`.

## Handoff Checklist

- Active branch: `task/w-0024-terminal-attention-implementation`
- Verification status: `engine/.venv/bin/python -m pytest engine/tests/test_ledger_store.py engine/tests/test_patterns_scanner.py engine/tests/test_capture_routes.py engine/tests/test_pattern_candidate_routes.py` passes.
- Remaining blockers: none for this slice.
