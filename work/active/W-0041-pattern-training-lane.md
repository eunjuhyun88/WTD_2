# W-0041 Pattern Training Lane

## Goal

Implement a pattern-specific training route that builds datasets from the pattern ledger, trains a scoped model, and emits a `model` ledger record.

## Owner

engine

## Scope

- Add a canonical `model_key` helper for pattern-scoped models.
- Add `POST /patterns/{slug}/train-model`.
- Reuse existing ledger-derived training rows and LightGBM engine internals.
- Emit a `model` ledger record after each training run.
- Report latest model metadata in pattern stats.

## Non-Goals

- No app/UI changes.
- No worker-control split in this slice.
- No alert gating or promotion-to-active policy.
- No generic `/train` redesign.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0041-pattern-training-lane.md`
- `docs/domains/pattern-ml.md`
- `engine/ledger/dataset.py`
- `engine/ledger/store.py`
- `engine/patterns/model_key.py`
- `engine/api/routes/patterns.py`
- `engine/scoring/lightgbm_engine.py`
- `engine/tests/test_pattern_candidate_routes.py`

## Facts

- The core loop now durably records `entry`, `capture`, `score`, `outcome`, and `verdict`.
- `model` record storage capability exists but is not yet emitted automatically.
- Existing generic `/train` is feature-agnostic and does not encode `pattern_slug` ownership.
- Current worktree has unrelated app/memory changes; this slice must stay engine-only.
- `POST /patterns/{slug}/train-model` now trains with a deterministic `model_key` and appends a `model` record on each train attempt.

## Assumptions

- Pattern-scoped models can reuse `LightGBMEngine` by using a deterministic pattern model key as the engine identity.
- `PatternOutcome.feature_snapshot` remains the canonical training source for now.

## Open Questions

- Whether a later training-run record should be separate from the `model` record in this route or handled in worker-control.

## Decisions

- Use pattern-scoped route ownership: `POST /patterns/{slug}/train-model`.
- Keep `generic /train` intact and separate.
- Emit `model` records for every train attempt, with `replaced` status in payload.

## Next Steps

1. Commit the engine-only training-lane slice.
2. Next slice: decide whether training-run records should be split from `model` records.
3. Later: move pattern training/promotion out of public runtime and into worker-control.

## Exit Criteria

- `POST /patterns/{slug}/train-model` trains from ledger-derived records.
- Successful train appends a `model` ledger record.
- Pattern stats expose latest model metadata.
- Targeted engine tests pass.

## Handoff Checklist

- Active branch: `task/w-0024-terminal-attention-implementation`
- Verification status: `engine/.venv/bin/python -m pytest engine/tests/test_pattern_candidate_routes.py engine/tests/test_ledger_store.py engine/tests/test_patterns_scanner.py engine/tests/test_capture_routes.py` passes.
- Remaining blockers: none for this slice.
