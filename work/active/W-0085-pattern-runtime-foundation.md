# W-0085 Pattern Runtime Foundation

## Goal

Implement the first runtime slice that turns the pattern engine from latest-bar rule matching into replay-first, score-based phase detection with failure-aware ledger evidence.

## Owner

engine

## Scope

- extend pattern contracts to support one-of groups, soft scoring, and anchor/window guards
- add the first post-dump accumulation substitute blocks needed for the TRADOOR/PTB family
- add replay restoration for recent bars before live evaluation
- persist phase-attempt failures so refinement can explain misses
- keep the slice narrow to the TRADOOR/PTB reference family and the existing JSON/SQLite local runtime

## Non-Goals

- full benchmark-pack persistence
- parallel refinement runner
- automated promotion gate
- user overlay or preset UI

## Canonical Files

- `AGENTS.md`
- `work/active/W-0085-pattern-runtime-foundation.md`
- `docs/domains/multi-timeframe-autoresearch-search.md`
- `engine/patterns/types.py`
- `engine/patterns/library.py`
- `engine/patterns/state_machine.py`
- `engine/patterns/replay.py`
- `engine/patterns/scanner.py`
- `engine/ledger/types.py`
- `engine/ledger/store.py`
- `engine/building_blocks/confirmations/__init__.py`
- `engine/scoring/block_evaluator.py`
- `engine/tests/test_patterns_state_machine.py`

## Facts

- the current scanner can now evaluate PTBUSDT/TRADOORUSDT, but replay inspection shows PTBUSDT only reaches `REAL_DUMP` before timing out and TRADOORUSDT stalls earlier
- `ACCUMULATION` currently hard-requires `funding_flip`, which rejects structurally valid post-dump accumulation windows without a one-bar sign flip
- the current runtime persists transitions and outcomes but not failed phase attempts or missing-block reasons
- the system spec now treats replay restore and score-based phase contracts as the minimum runtime foundation
- Phase 1 runtime foundation now includes score-based `ACCUMULATION`, replay restore before latest-bar evaluation, `phase_attempt` JSON ledger records, and current-state upserts without transitions

## Assumptions

- local JSON + SQLite persistence is sufficient for the first runtime slice
- replay restore can start with the pattern's native timeframe only; full timeframe-family search is a later slice

## Open Questions

- whether `phase_attempt_record` should live in the JSON ledger, SQLite runtime store, or both in Phase 1

## Decisions

- implement replay restore as an engine module first and wire it into the scanner before broader search infrastructure
- keep the first new confirmation set small: `positive_funding_bias`, `ls_ratio_recovery`, `post_dump_compression`, `reclaim_after_dump`
- treat `ACCUMULATION` as the only score-based phase in the initial slice; earlier phases remain boolean-gated
- persist failed phase-advance evidence in the existing JSON record family first, while keeping SQLite limited to active runtime state plus transition evidence
- replay restore resets one symbol from scratch each scan and suppresses callbacks; only the latest live bar emits transitions, entries, successes, and phase-attempt ledger records

## Next Steps

1. Run PTB/TRADOOR historical replay against real cached data and inspect whether `phase_attempt` evidence now explains misses concretely.
2. Decide whether `phase_attempt` also needs SQLite indexing before benchmark-pack and refinement-runner work starts.
3. Start the next slice: benchmark pack plus parallel refinement runner.

## Exit Criteria

- the engine can replay recent bars and restore current phase before latest-bar evaluation
- `ACCUMULATION` can be reached through hard-required plus one-of plus score-threshold logic
- failed accumulation attempts are persisted with missing-block context
- targeted tests pass and the engine can explain PTB/TRADOOR misses or hits structurally

## Handoff Checklist

- this slice is runtime foundation only
- do not mix in benchmark-pack persistence or UI work
- preserve the rule-first runtime as the authority even while adding score-based accumulation logic
