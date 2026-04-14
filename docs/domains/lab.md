# Domain: Lab

## Goal

Provide controlled research workflows for testing hypotheses and inspecting outcomes.

## Canonical Areas

- `app/src/routes/lab`
- `app/src/lib/research`
- `app/scripts/research`
- `app/src/routes/api/patterns`
- `engine/challenge`
- `engine/api/routes/patterns.py`

## Boundary

- Owns experiment orchestration and result visualization in app context.
- Uses contracts to call engine-backed analysis/evaluation paths.

## Inputs

- selected challenge slug
- evaluation requests from the app surface
- engine-generated summaries and instance rows

## Outputs

- challenge detail views
- evaluation result summaries
- links back into terminal context for inspection

## Related Files

- `app/src/routes/lab/+page.svelte`
- `app/src/routes/api/patterns/*`
- `docs/domains/evaluation.md`
- `docs/domains/contracts.md`

## Non-Goals

- direct engine logic duplication
- product marketing copy
