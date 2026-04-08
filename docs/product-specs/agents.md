# Agent Product Spec

Legacy file path:
- `docs/product-specs/agents.md`

Canonical surface label:
- `Agent`

Purpose:
- Short product spec for the agent roster plus per-agent HQ surfaces.

## Primary User Job

Inspect owned agents as living assets, then open one agent HQ to manage doctrine, memory, history, and record.

## Surface Role In The Official IA

`Agent` now spans two official routes:
- `/agent` = roster and creation entry
- `/agent/[id]` = operational HQ for one agent

The user should be able to:
- inspect roster health, stage, win rate, and memory depth
- open a focused HQ for one agent
- edit doctrine and inspect retained memory
- review version history and battle record
- route the agent back into `Lab`

## Surface Split

- `/agent`
  - collection page with cards, stats, create-agent CTA, and direct lab handoff
- `/agent/[id]`
  - tabs for `Overview`, `Doctrine`, `Memory`, `History`, and `Record`

## Current Implementation Bridge

- `/agent` currently ships as the collection page.
- `/agent/[id]` currently ships as the per-agent HQ.
- `/lab` remains the separate training workbench and should not be collapsed into the roster route.
- `/passport` remains a legacy or phase-2 proof slice rather than the main agent-management surface.
- Use `docs/page-specs/agent-page.md`, `docs/page-specs/agent-detail-page.md`, and `docs/page-specs/lab-page.md` for current route contracts.

## Core Flows

1. Browse owned agents from the roster.
2. Open one agent HQ.
3. Inspect doctrine, memory, history, and record.
4. Save changes or route back to `Lab`.
5. Use the agent's record as proof for later market readiness.

## Product Constraints

- This surface should emphasize ownership, specialization, and learning-memory semantics, not prediction ranking theater.
- Empty or partially hydrated stat state should still degrade cleanly through metadata/default fallbacks.
- Character identity should map to meaningful specialization, not cosmetic-only flavor.
- Progression should come from evidence, not idle grind.
- Agent HQ should not swallow the dedicated `Lab` workbench.
- Agent identity, proof, and rental state should remain readable for future agents and humans.

## Target IA

- User-facing label: `Agent`
- Primary routes:
  - `/agent`
  - `/agent/[id]`
- Related supporting routes:
  - `/lab`
  - `/battle`
  - `/market`

## Supporting Docs

- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/unified-product-model.md`
- `docs/page-specs/agent-page.md`
- `docs/page-specs/agent-detail-page.md`
- `docs/page-specs/lab-page.md`
- `docs/page-specs/passport-page.md`
- `docs/generated/store-authority-map.md`
