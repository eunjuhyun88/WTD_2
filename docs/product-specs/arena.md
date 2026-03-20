# Battle Product Spec

Legacy file path:
- `docs/product-specs/arena.md`

Canonical surface label:
- `Battle`

Purpose:
- Short product spec for whale encounter combat and its result loop.

## Primary User Job

Resolve a whale encounter and produce a result plus short reflection.

## Surface Role In The Final IA

`Battle` is a focused event screen entered from `World`.

## Current Route Shape

- `/arena` currently includes `Lobby` and `SquadConfig` before the phase loop begins.
- The same match can be viewed through arena, chart, mission, and card modes.
- Result flow currently includes reward modal, replay state, match history, and tournament bracket support.
- Use `docs/page-specs/arena-page.md` for the actual route shell; keep this file focused on Battle intent and migration semantics.

## Phase Model

1. `DRAFT`
2. `ANALYSIS`
3. `HYPOTHESIS`
4. `BATTLE`
5. `RESULT`

## Core Flows

1. Enter from a `World` encounter.
2. Resolve the battle loop through structured rounds.
3. Use override/boost/skip or related interventions.
4. Observe outcome and reflection.
5. Return the durable result to `World` and `Agent`.

## Product Constraints

- Battle should preserve `same data, different interpretation`.
- The user must understand the current phase and what changed.
- Result screens should feel like encounter resolution, not generic dashboard output.
- Durable outcomes should remain compatible with GameRecord, ORPO, and memory systems.
- The shipped route is broader than the target Battle loop, so lobby/draft/replay/tournament concerns will need pruning or remapping over time.

## Target IA

- User-facing label: `Battle`
- Entry source: `World`
- Return targets: `World`, `Agent`

## Local Authority

Read these before using any external design document:
- `docs/design-docs/six-surface-game-loop.md`
- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
- `docs/generated/game-record-schema.md`

## Supporting Docs

- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
- `docs/generated/game-record-schema.md`
- `docs/references/active/ARENA_SYSTEM_SPEC_V3_0.md`
- `docs/references/active/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md`
