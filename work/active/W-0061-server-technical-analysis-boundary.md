# W-0061 Server Technical Analysis Boundary

## Goal

Move server-used technical analysis primitives out of the app engine namespace.

## Owner

app

## Scope

- add a neutral technical-analysis module for trend, divergence, and indicator helpers
- update server/API code to use the neutral module
- preserve existing calculation behavior

## Non-Goals

- changing indicator formulas
- removing client-side engine imports
- consolidating all market snapshot persistence logic

## Canonical Files

- `work/active/W-0061-server-technical-analysis-boundary.md`
- `app/src/lib/market/technicalAnalysis.ts`
- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/server/multiTimeframeContext.ts`
- `app/src/routes/api/yahoo/[symbol]/+server.ts`

## Facts

- `marketSnapshotService`, `multiTimeframeContext`, and the Yahoo API route import pure calculations from `$lib/engine/*`.
- The imported functions are deterministic utilities and do not require app-engine runtime state.
- Moving these functions reduces server dependence on the app engine namespace without changing behavior.
- Server/API imports of `$lib/engine/trend` and `$lib/engine/indicators` are removed for the touched paths.
- `npm run check` passes after switching to the neutral module.

## Assumptions

- copied pure functions remain behavior-compatible with the current app engine implementations.

## Open Questions

- whether the original `$lib/engine/indicators` and `$lib/engine/trend` modules should later re-export from this neutral module.

## Decisions

- keep the neutral module small and limited to functions currently used by server/API code
- move type definitions needed by these helpers into the neutral module

## Next Steps

- switch server/API imports to `$lib/market/technicalAnalysis`
- run app verification
- follow up with remaining server `$lib/engine/*` imports by domain

## Exit Criteria

- current server/API technical-analysis imports no longer point at `$lib/engine/*`
- app verification passes

## Handoff Checklist

- active work item is this file
- touched files and rationale are reflected here
- verification results are recorded before handoff
  `npm run check`
- remaining boundary debt is listed in Open Questions or Next Steps
