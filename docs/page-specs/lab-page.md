# Lab Page

Route scope:
- `/lab`

Purpose:
- Define the model-training workbench route that turns owned-character state into doctrine review, retained memory review, backtest context, and release-readiness actions.

## Primary User Job

- Inspect one active creature-agent, understand its current doctrine and memory state, then decide whether to retune it in Terminal, redeploy it to Arena, or prepare it for Market-facing release.

## Core Flow

1. Route hydrates `agentStats` on mount and maps agent metadata plus learned stats into a selectable workbench roster.
2. The top-level standby state shows the active creature's live presence, stage, streak, and next recommended action.
3. Left roster rail exposes the active cast with level, win rate, retained memory count, and source context.
4. Selecting one creature updates the workbench spotlight and model-training cards in place.
5. The main workbench shows doctrine, retained lessons, backtest or comparison context, and release-readiness framing for the selected creature.
6. CTA buttons route the user back into Terminal, Arena, Market, or Passport depending on the next training step.

## Guardrails

- Document this route as a model-training workbench, not a generic profile gallery or a duplicate of `/agents`.
- Keep the selected-creature drill-down on the same route; there is no standalone child detail page today.
- Route copy should preserve the distinction between visible creature care and the underlying AI-model training loop.
- Route copy should make clear that progression comes from evidence and training, not idle character maintenance.
- Standby state should communicate attachment and status in seconds, then route the user into meaningful training or action.
- Empty or partially hydrated agent stats must still degrade through metadata defaults rather than collapsing the route.

## Key UI Blocks

- lab hero with route framing and next-step CTAs
- active-creature standby viewport or hangar card
- roster rail for active creature selection
- selected-creature spotlight card
- doctrine card
- retained-memory card
- backtest or comparison card when present
- next-moves queue

## State Authority

- roster metadata and character identity: `AGDEFS`
- learned performance projection: `agentStats`
- selected creature: route-local state
- navigation handoff: deep link helpers to Terminal, Arena, Market, and Passport

## Supporting APIs And Data

- `$lib/data/agents`
- `$lib/stores/agentData`
- `$lib/utils/deepLinks`
- `src/routes/lab/+page.svelte`

## Failure States

- docs confuse `/lab` with the general `/agents` roster instead of the training workbench
- missing stats break selection instead of falling back to metadata values
- CTA links drift away from the canonical Terminal/Arena/Market/Passport entry points
- the route stops explaining release-readiness and retained-memory context

## Read These First

- `docs/product-specs/agents.md`
- `docs/design-docs/unified-product-model.md`
- `docs/page-specs/agents-page.md`
- `docs/generated/store-authority-map.md`

## Applied Source Inputs

- `src/routes/lab/+page.svelte`
- `src/lib/stores/agentData.ts`
- `src/lib/utils/deepLinks.ts`
