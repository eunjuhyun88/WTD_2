# Agent Page

Route scope:
- `/agent`

Purpose:
- Define the roster route that lists owned agents, provides a create-agent entry, and hands one selected agent into HQ or Lab.

## Primary User Job

- Review owned agents quickly, then choose whether to manage one in HQ or train one in `Lab`.

## Core Flow

1. Route hydrates agent stats and renders one card per owned agent.
2. Each card exposes `Manage` and `Train` actions.
3. `Manage` routes to `/agent/[id]`.
4. `Train` routes to `/lab` with the selected agent deep link.
5. Create card routes to `/onboard?path=builder`.

## Guardrails

- Treat this route as a roster surface, not the full doctrine editor.
- Every card should surface enough record and memory context to support a next action.
- The create-agent CTA should stay visible even when the roster is populated.

## Key UI Blocks

- page header and roster framing copy
- owned-agent card grid
- manage / train CTAs per agent
- create-agent card

## State Authority

- roster stats and identity: `agentData` plus `AGDEFS`
- route handoffs: route-local navigation into `/agent/[id]`, `/lab`, and `/onboard`

## Supporting APIs And Data

- `$lib/data/agents`
- `$lib/stores/agentData`
- `$lib/utils/deepLinks`
- `src/routes/agent/+page.svelte`

## Failure States

- roster cards hide the train/manage split
- create-agent CTA disappears behind existing inventory
- docs confuse `/agent` with `/agent/[id]`

## Read These First

- `docs/product-specs/agents.md`
- `docs/page-specs/lab-page.md`
- `docs/design-docs/cogochi-uiux-architecture.md`
