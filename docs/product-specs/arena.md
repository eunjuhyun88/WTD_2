# Battle Product Spec

Legacy file path:
- `docs/product-specs/arena.md`

Canonical surface label:
- `Battle`

Purpose:
- Short product spec for whale encounter combat and its result loop.

## Primary User Job

Prove a trained doctrine against historical chart data and leave with a legible result plus reflection.

## Surface Role In The Official IA

`Battle` is a focused proof surface entered from `Lab`, `Dashboard`, or an already-selected agent context.

## Current Route Shape

- `/battle` currently ships as a standalone route with:
  - ready screen
  - loading state
  - active battle with simple/advanced order flows
  - result screen with reflection and replay
- `/arena` remains a legacy shell and reference surface.
- Use `docs/page-specs/battle-page.md` for the actual route contract; keep this file focused on Battle intent.

## Phase Model

1. `ready`
2. `loading`
3. `playing`
4. `round_break`
5. `result`

## Core Flows

1. Enter with a selected symbol and available daily quota.
2. Resolve three rounds of historical chart play.
3. Use simple or advanced order entry while reading AI advice.
4. Observe result, memory-card reveal, and reflection.
5. Return the durable result to `Lab` or `Agent HQ`.

## Product Constraints

- Battle should preserve `same data, different interpretation`.
- The user must understand the current phase and what changed.
- Result screens should feel like encounter resolution, not generic dashboard output.
- Durable outcomes should remain compatible with GameRecord, ORPO, and memory systems.
- Daily battle limits must remain explicit.
- The route should feel like proof of lab work, not a detached sandbox.

## Target IA

- User-facing label: `Battle`
- Primary route: `/battle`
- Entry sources:
  - `/lab`
  - `/dashboard`
  - `/agent/[id]`
- Return targets:
  - `/lab`
  - `/agent/[id]`

## Local Authority

Read these before using any external design document:
- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
- `docs/generated/game-record-schema.md`

## Supporting Docs

- `docs/design-docs/arena-domain-model.md`
- `docs/design-docs/learning-loop.md`
- `docs/generated/game-record-schema.md`
- `docs/references/active/ARENA_SYSTEM_SPEC_V3_0.md`
- `docs/references/active/ORPO_DATA_SCHEMA_PIPELINE_v1_2026-02-26.md`
