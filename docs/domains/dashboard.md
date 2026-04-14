# Domain: Dashboard

## Goal

Summarize system state, alerts, and key performance indicators for fast operator awareness.

## Canonical Areas

- `app/src/routes/dashboard`
- related dashboard API routes in `app/src/routes/api`
- `docs/domains/contracts.md`

## Boundary

- Owns aggregation and display logic only.
- Must consume precomputed engine outputs or contract-safe summaries.

## Inputs

- summarized challenge and evaluation data
- watchlist or saved-search state
- adapter/status summaries when available

## Outputs

- operator-facing overview cards and lists
- deep links into `/terminal` and `/lab`

## Related Files

- `app/src/routes/dashboard/+page.svelte`
- `docs/product/surfaces.md`

## Non-Goals

- scanner execution
- per-block analytics logic
