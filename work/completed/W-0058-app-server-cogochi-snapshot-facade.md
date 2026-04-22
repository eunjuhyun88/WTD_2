# W-0058 App Server Cogochi Snapshot Facade

## Goal

Put the app-side COGOCHI `SignalSnapshot` implementation behind one server facade so server flows stop importing the app engine implementation directly.

## Owner

app

## Scope

- add a server-owned snapshot facade for the current TypeScript COGOCHI implementation
- update `douni` and scanner server consumers to use that facade
- keep runtime behavior and payload shapes unchanged

## Non-Goals

- porting the TypeScript COGOCHI implementation into Python `engine/`
- changing the `SignalSnapshot` schema
- removing every non-COGOCHI `$lib/engine/*` app-server import

## Canonical Files

- `work/active/W-0058-app-server-cogochi-snapshot-facade.md`
- `app/src/lib/server/cogochi/signalSnapshot.ts`
- `app/src/lib/server/douni/toolExecutor.ts`
- `app/src/lib/server/douni/contextBuilder.ts`
- `app/src/lib/server/douni/types.ts`
- `app/src/lib/server/scanner.ts`
- `docs/domains/contracts.md`

## Facts

- `toolExecutor` directly imports `computeSignalSnapshot`, `signSnapshot`, `SignalSnapshot`, `ExtendedMarketData`, and `MarketContext` from app engine files.
- `scanner.ts` directly imports `computeSignalSnapshot`, `SignalSnapshot`, `ExtendedMarketData`, and `MarketContext`.
- `douni` context/type files only need the snapshot type and do not need the implementation module.
- A facade creates one replacement seam for a future `engine/` API-backed implementation.
- After the facade change, direct COGOCHI implementation imports under `app/src/lib/server` are isolated to `app/src/lib/server/cogochi/signalSnapshot.ts`.
- `npm run check` passes after routing current consumers through the facade.

## Assumptions

- the current TypeScript COGOCHI implementation remains the active local implementation until a dedicated engine-backed contract exists.

## Open Questions

- whether the eventual backend contract should return the full `SignalSnapshot` or a thinner Douni/terminal projection.

## Decisions

- keep signing behavior inside the facade behind an explicit option
- export server-prefixed type aliases so consumers stop reaching into `$lib/engine/cogochi/types`

## Next Steps

- route current `douni` and scanner consumers through the facade
- run app checks and targeted tests
- follow up by addressing market-context type imports in provider/snapshot services

## Exit Criteria

- `douni` and scanner server code no longer import `computeSignalSnapshot` or `signSnapshot` directly
- snapshot type imports in `douni` server files route through the facade
- app verification passes

## Handoff Checklist

- active work item is this file
- touched files and rationale are reflected here
- verification results are recorded before handoff
  `npm run check`
- remaining boundary debt is listed in Open Questions or Next Steps
