# W-0057 App Server Chart Boundary

## Goal

Stop app server chart-response code from importing chart helper logic through the `app/src/lib/engine/cogochi/*` namespace.

## Owner

app

## Scope

- extract pure chart indicator/support-resistance helpers into a neutral app module
- switch `analyze` and `douni` server flows to that neutral module
- keep existing response shapes and chart payload behavior unchanged

## Non-Goals

- moving `computeSignalSnapshot` into `engine/`
- redesigning analyze or terminal payloads
- cleaning every remaining `$lib/engine/*` server import in one slice

## Canonical Files

- `work/active/W-0057-app-server-chart-boundary.md`
- `app/src/lib/chart/analysisPrimitives.ts`
- `app/src/lib/server/analyze/responseMapper.ts`
- `app/src/lib/server/analyze/responseMapper.test.ts`
- `app/src/lib/server/douni/toolExecutor.ts`
- `app/src/lib/engine/cogochi/layerEngine.ts`
- `app/src/lib/engine/cogochi/supportResistance.ts`
- `docs/domains/contracts.md`

## Facts

- `app/src/lib/server/analyze/responseMapper.ts` imports chart helper logic from `$lib/engine/cogochi/*`.
- `app/src/lib/server/douni/toolExecutor.ts` uses the same helper imports for annotations and indicator overlays.
- `computeIndicatorSeries` is a small pure helper inside `app/src/lib/engine/cogochi/layerEngine.ts`.
- `detectSupportResistance` is a pure helper in `app/src/lib/engine/cogochi/supportResistance.ts` and does not require engine state.
- `npm run check` and `npm run test -- src/lib/server/analyze/responseMapper.test.ts` pass after moving the active server consumers.

## Assumptions

- keeping these helpers in `app/` is acceptable for this slice because they are presentation-support calculations, not engine decision authority.

## Open Questions

- whether the remaining `computeSignalSnapshot` usage in `douni` should be proxied through `engine/` or replaced by a narrower contract helper.

## Decisions

- create one neutral chart-analysis module instead of copying logic into each server flow
- preserve old cogochi helper exports as compatibility wrappers while moving active server consumers off the engine namespace

## Next Steps

- land the neutral chart-analysis module and swap the current server imports
- run app verification for the touched TypeScript files
- queue a follow-up slice for remaining server imports of `$lib/engine/*`

## Exit Criteria

- `responseMapper` and `toolExecutor` no longer import chart helper logic from `$lib/engine/cogochi/*`
- chart annotations and indicator series payloads remain shape-compatible
- app checks pass for the touched slice

## Handoff Checklist

- active work item is this file
- touched files and rationale are reflected here
- verification results are recorded before handoff
  `npm run check`
  `npm run test -- src/lib/server/analyze/responseMapper.test.ts`
- remaining boundary debt is listed in Open Questions or Next Steps
