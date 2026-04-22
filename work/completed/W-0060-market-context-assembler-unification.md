# W-0060 Market Context Assembler Unification

## Goal

Remove duplicate market-context assembly logic from the provider registry by delegating to the canonical market snapshot collector.

## Owner

app

## Scope

- keep the legacy `assembleMarketContext` export stable
- delegate context construction to `collectMarketSnapshot`
- remove duplicate provider fetch and trend assembly logic from `providers/registry.ts`

## Non-Goals

- changing `/api/market/snapshot` response behavior
- changing provider cache TTL policy
- adding a new public route or contract

## Canonical Files

- `work/active/W-0060-market-context-assembler-unification.md`
- `app/src/lib/server/providers/registry.ts`
- `app/src/lib/server/providers/index.ts`
- `app/src/lib/server/marketSnapshotService.ts`

## Facts

- `assembleMarketContext` is exported from the provider barrel but has no direct local callers in `app/src`.
- `providers/registry.ts` duplicates source fetching and `MarketContext` assembly already handled by `marketSnapshotService.ts`.
- `marketSnapshotService.ts` is the active route-backed collector for `/api/market/snapshot`.
- `providers/registry.ts` now delegates to `collectMarketSnapshot(..., persist: false)`.
- `npm run check` passes after unifying the assembler path.

## Assumptions

- preserving the exported function signature is enough compatibility for any latent callers.

## Open Questions

- whether provider health should be rebuilt from the canonical collector's source status or removed entirely in a later cleanup.

## Decisions

- use `collectMarketSnapshot(..., { persist: false })` for compatibility assembly to avoid persistence side effects
- return an empty health array until a real canonical health model is introduced

## Next Steps

- replace registry internals with a compatibility wrapper
- run app verification
- follow up by removing remaining `$lib/engine/*` calculation imports in `marketSnapshotService`

## Exit Criteria

- `providers/registry.ts` no longer duplicates market source fetches
- `assembleMarketContext` remains available for compatibility
- app verification passes

## Handoff Checklist

- active work item is this file
- touched files and rationale are reflected here
- verification results are recorded before handoff
  `npm run check`
- remaining boundary debt is listed in Open Questions or Next Steps
