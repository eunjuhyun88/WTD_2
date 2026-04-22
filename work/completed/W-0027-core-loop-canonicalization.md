# W-0027 Core Loop Canonicalization

## Goal

Record the product's actual core loop in canonical docs so future engine, app, and research work uses the same loop definition.

## Owner

research

## Scope

- define the canonical product core loop based on the TRADOOR/PTB pattern workflow
- distinguish the product core loop from runtime or scheduler loops
- connect the loop to current engine/app building blocks and known missing pieces
- update the product brief to point at the canonical loop doc

## Non-Goals

- implementing the missing state machine or result ledger
- changing engine routes, scheduler behavior, or UI flow
- rewriting legacy design docs under `app/docs/`

## Canonical Files

- `work/active/W-0027-core-loop-canonicalization.md`
- `docs/product/core-loop.md`
- `docs/product/brief.md`
- `docs/domains/pattern-ml.md`

## Decisions

- the canonical "core loop" is the pattern learning loop, not the worker scheduler loop
- the source example is the TRADOOR/PTB OI-reversal workflow, but the doc must generalize beyond a single coin
- legacy design notes in `app/docs/` can inform the canonical doc, but they are not the source of truth

## Next Steps

- align future state-machine and ledger work items to the canonical loop terms
- update domain docs when `Pattern Object`, `State Machine`, or `Result Ledger` become implemented engine modules
- add route and storage references once the save/evaluate/refinement path is fully wired

## Exit Criteria

- a canonical product doc defines the core loop in concrete terms
- the product brief points readers to that canonical loop doc
- the repo no longer relies on chat history or legacy `app/docs/` notes to explain the core loop
