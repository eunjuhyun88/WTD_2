# World Page

Route scope:
- `/world`

Purpose:
- Define the target main-play route where a prepared agent traverses a BTC-history chart world map and enters `Battle`.

## Primary User Job

- Understand where the agent is in the world run and decide whether to continue traversal or enter an encounter.

## Core Flow

1. Route checks `Terminal` readiness and redirects or blocks if the agent is not world-ready.
2. World loads the BTC-history map, current era, agent position, whale markers, and auto progression state.
3. User monitors traversal speed, HP, streak, and intervention card inventory.
4. When an encounter is available, the route surfaces `Enter Battle`.
5. After battle resolution, the route refreshes world state and progression markers.

## Guardrails

- Do not treat this route like a market-analysis workstation.
- The chart is world state first, analytics substrate second.
- If World is locked, explain the exact missing readiness steps from `Terminal`.
- Encounter entry must be obvious but should not turn the whole route into a Battle screen.

## Key UI Blocks

- world header with era, speed, HP, and streak
- BTC-history chart map
- agent position marker
- whale encounter markers
- intervention card rail
- auto progression log
- `Enter Battle` CTA

## State Authority

- world progression and encounter state: server-authoritative game state
- chart map projection and local viewport state: route local + shared chart runtime
- readiness gate: derived from `Terminal` completion state
- battle handoff state: route-local navigation payload plus durable encounter identity

## Supporting APIs And Data

- future world progression API
- future readiness gate API or derived agent readiness projection
- chart/history data source reused from current chart stack

## Failure States

- World opens for an unprepared agent
- chart looks like a trading terminal instead of a map
- battle markers and actual encounter state drift apart
- world progression appears local-only and loses durable continuity

## Read These First

- `docs/product-specs/world.md`
- `docs/design-docs/six-surface-game-loop.md`
- `docs/product-specs/terminal.md`
- `docs/product-specs/arena.md`
