# Domain: Dashboard

## Goal

Act as the Day-1 monitoring and judgment inbox:
clear pending live alerts first, preserve watch continuity, and provide lightweight return paths to saved setups.

## Canonical Areas

- `app/src/routes/dashboard`
- related dashboard API routes in `app/src/routes/api`
- `docs/domains/contracts.md`
- `docs/product/pages/00-system-application.md`
- `docs/product/pages/04-dashboard.md`

## Boundary

- Owns section composition, ordering, and deep-link actions.
- Owns lightweight aggregation and rendering only.
- Must consume contract-safe summaries or local Day-1 watch state.
- Owns fast manual judgment UX for pending alerts.
- Does not own scanner execution, challenge evaluation, or training pipelines.

## Inputs

- signal alerts with manual and automatic feedback fields
- watch state (Day-1 local storage, shape-compatible for later persistence)
- saved setup summaries (same canonical source as lab list)
- adapter status placeholder inputs (empty/phase-gated)

## Outputs

- four stacked sections in fixed order:
  - Signal Alerts
  - Watching
  - Saved Setups
  - My Adapters
- deep links into `/lab` and `/terminal`
- stable empty states with Day-1 scope messaging

## Section Contract

Signal Alerts:

- pending alerts sorted above judged alerts
- each row links to terminal alert drilldown context
- manual feedback actions remain directly accessible

Watching:

- saved terminal queries with status (`live`/`paused`)
- open action routes to terminal inspect context

Saved Setups:

- top recent evaluated setup summaries
- each row links to `/lab?slug=<slug>`
- create-new action routes to terminal review/capture flow

My Adapters:

- explicit Phase-2 placeholder only
- no pseudo metrics that imply available training surface

## Storage Contract (Day-1)

Watching key shape should remain stable:

- key: `cogochi.watches`
- fields: `slug`, `query`, `createdAt`, `lastEvaluatedAt`, `status`

Day-2+ may migrate this state to shared persistence; dashboard UI contract should remain compatible.

## Resilience Contract

- Section-level failures should degrade per section, not fail the full page.
- If one data source fails, other sections still render.

## Related Files

- `app/src/routes/dashboard/+page.svelte`
- `app/src/routes/api/challenges/+server.ts`
- `docs/product/surfaces.md`

## Non-Goals

- scanner execution
- per-block analytics logic
- deep analysis UI that belongs to terminal or lab
- character greeting or persona copy layers

## Acceptance Checks

- section order stays fixed and labels are stable
- signal alerts prioritize feedback-pending state and route to terminal drilldown
- watching rows/actions route to terminal context
- saved setup rows route to lab with slug context
- adapters section remains explicit placeholder for Day-1
