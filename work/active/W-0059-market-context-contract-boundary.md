# W-0059 Market Context Contract Boundary

## Goal

Move `MarketContext` out of the app engine implementation namespace and into a neutral contract module.

## Owner

contract

## Scope

- define a neutral app-side `MarketContext` contract type
- keep `factorEngine` source-compatible by re-exporting the contract type
- update server/context builders to import the contract type directly

## Non-Goals

- changing market-context payload shape
- consolidating duplicate market-context assembly logic
- moving data provider fetchers into Python `engine/`

## Canonical Files

- `work/active/W-0059-market-context-contract-boundary.md`
- `app/src/lib/contracts/marketContext.ts`
- `app/src/lib/engine/factorEngine.ts`
- `app/src/lib/server/cogochi/signalSnapshot.ts`
- `app/src/lib/server/providers/registry.ts`
- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/data-engine/context/contextBuilder.ts`
- `docs/domains/contracts.md`

## Facts

- `MarketContext` currently lives in `app/src/lib/engine/factorEngine.ts` beside implementation code.
- Server code imports `MarketContext` from `factorEngine` only for type annotations.
- `factorEngine` can keep source compatibility by re-exporting the moved type.
- This slice does not change runtime code paths or response payloads.
- Current server/context imports now point at `$lib/contracts/marketContext`.
- `npm run check` passes after moving the contract type.

## Assumptions

- TypeScript structural typing is sufficient for existing `BinanceKline` and trend objects to satisfy the neutral contract shape.

## Open Questions

- whether `ExtendedMarketData` should also move into a neutral contract module or stay tied to COGOCHI snapshot execution.

## Decisions

- move only `MarketContext` in this slice to keep the change reversible
- leave old `factorEngine` imports source-compatible for code outside this slice

## Next Steps

- update current server/context imports to the neutral contract
- run app verification
- follow up with duplicated market-context assembly consolidation

## Exit Criteria

- server/context builders no longer import `MarketContext` from `$lib/engine/factorEngine`
- `factorEngine` continues to compile with the moved type
- app verification passes

## Handoff Checklist

- active work item is this file
- touched files and rationale are reflected here
- verification results are recorded before handoff
  `npm run check`
- remaining boundary debt is listed in Open Questions or Next Steps
