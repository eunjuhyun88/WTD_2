# W-0035 Pattern Transition Persistence

## Goal

Make pattern phase transitions and current phase state durable so scanner runs can restore state, ledger entries can point back to the originating transition, and the runtime remains restartable from files.

## Owner

engine

## Scope

- Add durable engine-side records for pattern phase transitions and current pattern state.
- Extend phase transition metadata so scanner and ledger records carry `transition_id`, `scan_id`, block evidence, and data quality.
- Keep the pattern scanner and state machine restartable without chat history.

## Non-Goals

- No app or `/terminal` surface work.
- No redesign of pattern semantics or phase ordering.
- No ML rollout or alert policy changes beyond carrying transition metadata through existing records.

## Canonical Files

- `work/active/W-0035-pattern-transition-persistence.md`
- `docs/product/core-loop-system-spec.md`
- `docs/domains/pattern-ml.md`
- `engine/patterns/types.py`
- `engine/patterns/state_machine.py`
- `engine/patterns/state_store.py`
- `engine/patterns/scanner.py`
- `engine/ledger/types.py`
- `engine/ledger/store.py`
- `engine/tests/test_pattern_state_store.py`
- `engine/tests/test_patterns_state_machine_durable.py`

## Facts

- The durable pattern transition implementation is committed on `codex/w-0035-pattern-transition-persistence`.
- `PatternStateStore` persists append-only transitions and upserted current pattern state in SQLite.
- Scanner and ledger records now carry transition metadata for entry linkage.
- Targeted pattern runtime and ledger compatibility tests pass.

## Assumptions

- SQLite is an acceptable local durability layer for pattern runtime state in this slice.
- Transition evidence can be stored as JSON blobs without introducing a broader schema migration yet.

## Open Questions

- Whether `block_coverage` should be renamed in this slice or deferred to a later contract cleanup.

## Decisions

- Treat the current uncommitted engine changes as one engine logic change set, separate from prior terminal/app work.
- Use one append-only transitions table plus one upserted current-state table for restartable runtime hydration.
- Keep scanner and ledger wiring minimal: persist transition metadata and reuse existing ledger storage.

## Next Steps

1. Open PR for durable transition persistence.
2. Continue with CaptureRecord linkage in the next slice.
3. Keep generated `engine/state/*.sqlite*` files out of version control.

## Exit Criteria

- `PatternStateStore` exists and satisfies the current engine tests.
- `PhaseTransition` and current-state records carry the metadata already referenced by scanner and tests.
- Targeted engine tests for durable transition/state behavior pass.
- Ledger compatibility tests pass after adding entry transition metadata.

## Handoff Checklist

- Active branch: `codex/w-0035-pattern-transition-persistence`
- Verification status: `uv run pytest tests/test_pattern_state_store.py tests/test_patterns_state_machine_durable.py tests/test_patterns_scanner.py tests/test_ledger_store.py tests/test_ledger_dataset.py` passed.
- Remaining blockers: none for durable transition persistence; next blocker is CaptureRecord linkage.
