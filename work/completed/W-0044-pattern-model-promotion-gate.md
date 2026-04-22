# W-0044 Pattern Model Promotion Gate

## Goal

Introduce an explicit pattern-model registry and promotion gate so `candidate` and `active` are distinct runtime states instead of being inferred from training replacement alone.

## Owner

engine

## Scope

- Add a durable pattern-model registry snapshot plane.
- Register replacement-worthy models as `candidate` after training.
- Add an explicit promotion route that marks one candidate model as `active`.
- Expose registry state in pattern stats and a dedicated read route.
- Carry model rollout metadata into entry-time scoring records.

## Non-Goals

- No app/UI changes.
- No worker-control migration in this slice.
- No actual alert suppression or ranking policy yet.
- No DB migration; local JSON registry is sufficient for now.

## Canonical Files

- `AGENTS.md`
- `work/active/W-0044-pattern-model-promotion-gate.md`
- `docs/domains/pattern-ml.md`
- `docs/product/core-loop-system-spec.md`
- `engine/patterns/entry_scorer.py`
- `engine/patterns/model_key.py`
- `engine/patterns/model_registry.py`
- `engine/api/routes/patterns.py`
- `engine/ledger/types.py`
- `engine/ledger/store.py`
- `engine/tests/test_pattern_candidate_routes.py`
- `engine/tests/test_patterns_scanner.py`

## Facts

- `train-model` now emits `training_run` every time and `model` only when `replaced=True`.
- Entry scoring still loads a model directly from `get_engine(...)` without any pattern-owned registry lookup.
- The domain spec says `active` should be an explicit promotion state, not inferred from training success.
- Current stats expose latest model/training records but not a canonical current registry state.
- This slice must stay engine-only because the worktree contains unrelated dirty app and memory changes.
- This slice now adds a JSON-backed registry, `promote-model`, and entry-time rollout metadata (`candidate` or `active`).

## Assumptions

- One pattern can have at most one `active` model at a time.
- Replaced models should default to `candidate` until explicitly promoted.
- Entry-time scoring can continue to run in shadow mode from the best available registry model even before alert gating is implemented.

## Open Questions

- Whether later worker-control should also record failed promotion attempts as durable audit events.

## Decisions

- Add a registry snapshot store separate from append-only ledger records.
- `train-model` writes/updates a `candidate` registry entry when a model is replaced.
- `promote-model` is the only action that can set a model registry entry to `active`.
- Entry scoring records which rollout state (`candidate` or `active`) produced the score.

## Next Steps

1. Commit this engine-only promotion-gate slice.
2. Next slice: add explicit alert policy plane that consumes `active` registry state instead of inferring from score records.
3. Later: move `train-model` and `promote-model` off the public runtime and into worker-control.

## Exit Criteria

- Replacement training creates a registry entry with `rollout_state=\"candidate\"`.
- Explicit promotion flips one registry entry to `active` and demotes prior active state if needed.
- Entry scoring records the rollout state used for scoring.
- Targeted engine tests pass.

## Handoff Checklist

- Active branch: `task/w-0024-terminal-attention-implementation`
- Verification status: `engine/.venv/bin/python -m pytest engine/tests/test_model_registry.py engine/tests/test_pattern_candidate_routes.py engine/tests/test_patterns_scanner.py engine/tests/test_ledger_store.py engine/tests/test_capture_routes.py` passes.
- Remaining blockers: none known.
