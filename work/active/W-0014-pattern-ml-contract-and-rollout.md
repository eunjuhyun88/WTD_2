# W-0014 Pattern ML Contract and Rollout

## Goal

Define the target architecture that takes pattern-entry ML from shadow instrumentation to production-safe scoring and alert gating for 1000+ users.

## Owner

contract

## Scope

- define canonical ownership between pattern runtime, ledger, scorer, trainer, registry, and alert policy
- define the pattern-model identity contract and rollout states
- define the durable record shapes required for entry, score, outcome, model, and training-run history
- define runtime placement for scoring, training, promotion, and public reporting
- define the migration sequence from the current JSON shadow ledger to durable production persistence

## Non-Goals

- implementing database migration in this slice
- enabling threshold-based alert suppression in production
- rewriting every existing generic ML or research script
- redesigning the pattern state machine itself

## Canonical Files

- `work/active/W-0014-pattern-ml-contract-and-rollout.md`
- `docs/domains/pattern-ml.md`
- `docs/domains/contracts.md`
- `docs/decisions/ADR-004-runtime-split-and-state-plane.md`
- `engine/patterns/scanner.py`
- `engine/patterns/entry_scorer.py`
- `engine/ledger/store.py`
- `engine/ledger/dataset.py`
- `engine/scoring/lightgbm_engine.py`
- `engine/api/routes/patterns.py`

## Decisions

- pattern runtime remains rule-first; ML only scores committed entry events emitted by the state machine
- pattern models are keyed by a pattern contract, not by end user identity
- public app routes may report shadow metrics but must not own train, promote, or alert-gating decisions
- training, calibration, and model promotion belong to `worker-control`
- production truth for pattern ML moves toward durable DB-backed records; JSON ledger remains a development fallback only

## Next Steps

- rename `PhaseTransition.confidence` to `block_coverage` to remove semantic ambiguity
- introduce a pattern-model registry keyed by `pattern_slug + timeframe + target_name + feature_schema_version + label_policy_version`
- add an internal training job and promotion flow for pattern-specific models
- split the logical ledger into entry, score, outcome, model, and training-run records
- add calibrated alert policy and rollout controls only after shadow metrics are stable

## Exit Criteria

- a canonical design document exists for pattern ML runtime, persistence, and rollout
- model identity, rollout state, and record shapes are explicit enough to implement without chat history
- route ownership for stats, scoring, training, and promotion is fixed
- migration order from the current shadow baseline is explicit
