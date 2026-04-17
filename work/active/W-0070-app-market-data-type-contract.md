# W-0070 App Market Data Type Contract

## Goal
Move app surface Binance market data type imports from `$lib/engine/types` to app contracts.

## Scope
- Update client/API/chart/lab type-only imports for `BinanceKline` and `Binance24hr`.
- Preserve runtime Binance fetch behavior.
- Leave backtest runtime imports for a separate lab boundary slice.

## Non-Goals
- No lab backtest engine migration.
- No chart pattern detector migration.
- No COGOCHI `ExtendedMarketData` migration in this slice.

## Canonical Files
- `app/src/lib/api/binance.ts`
- `app/src/lib/chart/chartTypes.ts`
- `app/src/lib/chart-engine/adapters/fromLabReplay.ts`
- `app/src/components/lab/LabChart.svelte`
- `app/src/routes/lab/+page.svelte`
- `app/src/lib/data-engine/context/contextBuilder.ts`

## Facts
- `BinanceKline` and `Binance24hr` already exist in `app/src/lib/contracts/marketContext.ts`.
- App surface files now import these market data types from `$lib/contracts/marketContext`.
- These imports are type-only and do not require runtime behavior changes.

## Assumptions
- Contract `BinanceKline` remains structurally identical to the legacy engine type.

## Open Questions
- Should `ExtendedMarketData` become a dedicated COGOCHI contract in the next slice?

## Decisions
- Use the existing market context contract instead of creating another market data file.

## Next Steps
- Continue with lab backtest and chart pattern detector app-surface boundaries.

## Exit Criteria
- No app surface file imports `BinanceKline` or `Binance24hr` from `$lib/engine/types`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining app surface `$lib/engine/*` imports listed for later slices.
