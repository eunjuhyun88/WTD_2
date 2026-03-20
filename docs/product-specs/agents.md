# Agent Product Spec

Legacy file path:
- `docs/product-specs/agents.md`

Canonical surface label:
- `Agent`

Purpose:
- Short product spec for the merged agent hub: growth, training record, trainer card, sharing, and rental state.

## Primary User Job

Inspect one owned agent as a living asset: growth, record, training state, shareability, and rental readiness.

## Surface Role In The Merged Product

`Agent` is the merged hub that absorbs the old `Lab` and `Passport` responsibilities.

The user should be able to:
- inspect stage, record, HP flow, and whale history
- inspect doctrine, retained memory, and training state
- review trainer card, share state, and rental status
- make focused training adjustments without leaving the agent identity context

## Agent Submodes

- `Standby / Hangar`
  - passive companion state with stage, streak, readiness, and quick actions
- `Train`
  - doctrine, prompts, memory, and specialization editing
- `Record`
  - stage, record, HP flow, whales defeated, trainer card, share, rental

## Current Implementation Bridge

- `/agents` currently ships as a collection page, not an oracle leaderboard.
- `/lab` currently owns most training-workbench behavior.
- `/passport` currently owns durable profile, holdings, and learning-report behavior.
- The final `Agent` surface will merge selected responsibilities from `/lab` and `/passport`.
- Use `docs/page-specs/agents-page.md`, `docs/page-specs/lab-page.md`, and `docs/page-specs/passport-page.md` for current route contracts.

## Core Flows

1. Browse or select an owned character.
2. Inspect its stage, record, doctrine, and retained memory.
3. Review training state or reflection history.
4. Inspect trainer card, share state, and rental readiness.
5. Decide whether to return to `Terminal`, `World`, or `Battle`.

## Product Constraints

- This surface should emphasize ownership, specialization, and learning-memory semantics, not prediction ranking theater.
- Empty or partially hydrated stat state should still degrade cleanly through metadata/default fallbacks.
- Character identity should map to meaningful specialization, not cosmetic-only flavor.
- Progression should come from evidence, not idle grind.
- Standby presence should increase attachment and clarity, not create meaningless pet-maintenance chores.
- Agent identity, proof, and rental state should remain readable for future agents and humans.

## Target IA

- User-facing label: `Agent`
- Primary tabs: `Train`, `Record`
- Legacy surfaces absorbed over time:
  - `Lab`
  - `Passport`

## Supporting Docs

- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/unified-product-model.md`
- `docs/page-specs/agents-page.md`
- `docs/page-specs/lab-page.md`
- `docs/page-specs/passport-page.md`
- `docs/generated/store-authority-map.md`
