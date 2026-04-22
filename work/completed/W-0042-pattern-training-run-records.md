# W-0042 Pattern Training Run Records

## Goal

Split `training_run` execution history from `model` artifact history so pattern training becomes auditable and promotion-safe.

## Owner

engine

## Scope

- Add `training_run` as a first-class ledger record type.
- Emit a `training_run` record from `POST /patterns/{slug}/train-model` for every completed train attempt.
- Restrict `model` record emission to runs that actually replace or create the active saved model artifact.
- Expose latest training-run metadata in pattern stats.

## Non-Goals

- No app/UI changes.
- No worker-control migration in this slice.
- No promotion gate or alert policy changes yet.
- No generic `/train` redesign.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0042-pattern-training-run-records.md`
- `docs/domains/pattern-ml.md`
- `docs/product/core-loop-system-spec.md`
- `engine/ledger/types.py`
- `engine/ledger/store.py`
- `engine/api/routes/patterns.py`
- `engine/tests/test_ledger_store.py`
- `engine/tests/test_pattern_candidate_routes.py`

## Facts

- `POST /patterns/{slug}/train-model` currently appends only a `model` record.
- The domain spec distinguishes `training run record` from `model record`.
- `LightGBMEngine.train()` only persists a model artifact when `replaced=True`.
- Current stats expose `latest_model` but not `latest_training_run`.
- This slice must stay engine-only because the worktree contains unrelated dirty app and memory changes.
- The route now emits `training_run` for each completed train attempt and emits `model` only when `replaced=True`.

## Assumptions

- A completed train attempt that returns metrics should always emit a `training_run` record.
- A `model` record should only exist when a model artifact/version is actually persisted or promoted.

## Open Questions

- Whether failed preflight validations should also be durably logged later in worker-control.

## Decisions

- `training_run` is append-only and emitted for each completed train attempt.
- `model` remains append-only but is emitted only when `replaced=True`.
- Pattern stats expose both `latest_training_run` and `latest_model`.

## Next Steps

1. Commit this engine-only slice.
2. Next slice: add promotion-gate semantics so `candidate` and `active` are no longer inferred only from `replaced`.
3. Later: move training execution into worker-control and keep `engine-api` read-oriented.

## Exit Criteria

- Training attempts create a `training_run` record.
- Non-replaced runs do not create a new `model` record.
- Pattern stats expose latest training-run metadata.
- Targeted engine tests pass.

## Handoff Checklist

- Active branch: `task/w-0024-terminal-attention-implementation`
- Verification status: `engine/.venv/bin/python -m pytest engine/tests/test_ledger_store.py engine/tests/test_pattern_candidate_routes.py engine/tests/test_patterns_scanner.py engine/tests/test_capture_routes.py` passes.
- Remaining blockers: none known.
