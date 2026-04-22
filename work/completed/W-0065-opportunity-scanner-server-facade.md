# W-0065 Opportunity Scanner Server Facade

## Goal
Isolate terminal opportunity scan routes from direct engine implementation imports.

## Scope
- Add a server-owned opportunity scanner facade.
- Move route/type consumers to the facade import path.
- Preserve scan execution, alert extraction, caching, and DB persistence behavior.

## Non-Goals
- No opportunity scoring logic changes.
- No DB schema changes.
- No terminal UI changes.

## Canonical Files
- `app/src/lib/server/opportunity/scanner.ts`
- `app/src/routes/api/terminal/opportunity-scan/+server.ts`
- `app/src/lib/server/terminalParity.ts`

## Facts
- The opportunity scan route imports `runOpportunityScan`, `extractAlerts`, and result types from the server facade.
- `terminalParity.ts` imports `OpportunityAlert` from the server facade.
- Route-level caching and persistence can remain unchanged if the facade preserves the same exports.

## Assumptions
- A thin server facade is the correct intermediate boundary before moving scanner implementation out of `app/src/lib/engine`.

## Open Questions
- Should opportunity scanner execution eventually live in `engine/` Python or a dedicated app server domain module?

## Decisions
- Keep facade as a compatibility layer and do not modify scoring internals.
- Keep the direct `$lib/engine/opportunityScanner` import isolated to `app/src/lib/server/opportunity/scanner.ts`.

## Next Steps
- Continue with COGOCHI/v4/RAG embedding boundaries in separate slices.

## Exit Criteria
- No route or non-facade server file imports `$lib/engine/opportunityScanner`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct `$lib/engine/*` dependencies listed for future slices.
