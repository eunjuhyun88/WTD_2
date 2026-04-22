# W-0072 Chart Pattern Contract Types

## Goal
Move chart pattern display types out of direct engine imports.

## Scope
- Add chart pattern contract types.
- Update chart surface type imports.
- Preserve pattern detector implementation for a later runtime facade slice.

## Non-Goals
- No pattern detection logic changes.
- No chart rendering behavior changes.

## Canonical Files
- `app/src/lib/contracts/chartPatterns.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/chart/chartTypes.ts`

## Facts
- `chartTypes.ts` imports pattern display types from `$lib/contracts/chartPatterns`.
- Those pattern types are stable UI contracts.

## Assumptions
- The detector implementation can continue using its own internal exports until migrated later.

## Open Questions
- Should pattern detection move to `app/src/lib/chart` or backend `engine/` later?

## Decisions
- Keep this slice type-only.

## Next Steps
- Continue with agent data and store type boundaries.

## Exit Criteria
- `chartTypes.ts` no longer imports `$lib/engine/patternDetector`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining app surface `$lib/engine/*` imports listed for later slices.
