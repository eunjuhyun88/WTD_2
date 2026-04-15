# W-0028 Pattern Engine Rearchitecture

## Goal

Re-derive the optimal pattern-engine architecture from actual repository reality, identifying what is implemented, what is structurally missing, and what must be reconnected so the product core loop can close cleanly.

## Owner

research

## Scope

- compare `app/docs/PATTERN_ENGINE.md` and `app/docs/PATTERN_ENGINE_VALIDATION.md` against the current engine/app codebase
- identify implemented layers, partial layers, and architectural gaps
- define the canonical target structure for pattern runtime, ledger, ML scoring, alert policy, and app contracts
- define the migration order that preserves current work while removing structural drift

## Non-Goals

- implementing the rearchitecture in this work item
- replacing the current JSON ledger in this slice
- redesigning unrelated terminal surfaces
- rewriting legacy `app/docs/` design notes in place

## Canonical Files

- `work/active/W-0028-pattern-engine-rearchitecture.md`
- `docs/domains/pattern-engine-runtime.md`
- `app/docs/PATTERN_ENGINE.md`
- `app/docs/PATTERN_ENGINE_VALIDATION.md`
- `docs/domains/pattern-ml.md`
- `docs/product/core-loop.md`

## Decisions

- `app/docs/PATTERN_ENGINE*.md` remain useful origin docs, but canonical runtime design must live under `docs/domains/`
- the current repo has moved past the old "missing state machine / missing ledger" diagnosis; the new problem is structural misalignment between implemented pieces
- the correct rearchitecture keeps the rule-first pattern runtime and treats ML as a downstream scoring plane, not the source of truth
- the app must stop inventing or flattening pattern state that the engine already knows

## Next Steps

- align future implementation slices to the target planes in `docs/domains/pattern-engine-runtime.md`
- create child work items for contract cleanup, state persistence, pattern registry, and save-to-ledger wiring
- update `docs/domains/pattern-ml.md` and route contracts once the first cleanup slice lands

## Exit Criteria

- a canonical domain doc exists that compares actual code with the older pattern-engine design
- the repo has a clear statement of what is implemented, partial, and structurally missing
- the optimal target structure and migration order can be executed without relying on chat history
