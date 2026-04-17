# W-0076 Data Engine COGOCHI Type Facade

## Goal
Remove the remaining non-facade direct COGOCHI type import in the data engine context builder.

## Scope
- Update `data-engine/context/contextBuilder.ts` to use the existing server COGOCHI snapshot facade type.
- Preserve context builder behavior and output shape.

## Non-Goals
- No COGOCHI signal computation changes.
- No data engine fetch changes.

## Canonical Files
- `app/src/lib/data-engine/context/contextBuilder.ts`
- `app/src/lib/server/cogochi/signalSnapshot.ts`

## Facts
- `contextBuilder.ts` imports `ServerExtendedMarketData` from `$lib/server/cogochi/signalSnapshot`.
- `server/cogochi/signalSnapshot.ts` already exports `ServerExtendedMarketData`.

## Assumptions
- `ServerExtendedMarketData` is the correct app-server boundary type for the data engine as well.

## Open Questions
- Should the data-engine package ultimately depend on server facades, or should COGOCHI contracts be promoted to a neutral app contract file?

## Decisions
- Use the existing server facade now to avoid another duplicate type definition.

## Next Steps
- Continue with remaining intentional facades and bridge cleanup only if they need promotion to contracts.

## Exit Criteria
- `contextBuilder.ts` no longer imports `$lib/engine/cogochi/types`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct app `$lib/engine/*` imports are intentional facades/bridges only.
