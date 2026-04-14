# Domain: Dashboard

## Goal

Act as the Day-1 "My Stuff Inbox":
quick return surface for saved work, watches, and adapter placeholder status.

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
- Does not own scanner execution, challenge evaluation, or training pipelines.

## Inputs

- challenge summaries (same canonical source as lab list)
- watch state (Day-1 local storage, shape-compatible for later persistence)
- adapter status placeholder inputs (empty/phase-gated)

## Outputs

- three stacked sections in fixed order:
  - My Challenges
  - Watching
  - My Adapters
- deep links into `/lab` and `/terminal`
- stable empty states with Day-1 scope messaging

## Section Contract

My Challenges:

- top recent items
- each row links to `/lab?slug=<slug>`
- create-new action routes to `/terminal`

Watching:

- saved terminal queries with status (`live`/`paused`)
- add action routes to terminal compose flow

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
- challenge rows route to lab with slug context
- watching rows/actions route to terminal context
- adapters section remains explicit placeholder for Day-1
