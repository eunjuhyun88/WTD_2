# W-0062 Binance Market Data Contract Types

## Goal
Move app-server Binance market data type dependencies from `$lib/engine/types` to an app contract boundary.

## Scope
- Define Binance kline/ticker contract types in the app contract layer.
- Update app server/API type-only imports for Binance market data.
- Preserve existing provider fetch behavior and compatibility re-exports.

## Non-Goals
- No runtime fetcher rewrite.
- No engine Python/backend refactor.
- No progression, RAG, arena, or COGOCHI type migration in this slice.

## Canonical Files
- `app/src/lib/contracts/marketContext.ts`
- `app/src/lib/server/providers/binance.ts`
- `app/src/lib/server/providers/rawSources.ts`
- `app/src/lib/server/analyze/types.ts`
- `app/src/lib/server/analyze/helpers.ts`
- `app/src/lib/server/multiTimeframeContext.ts`
- `app/src/routes/api/cycles/klines/+server.ts`
- `app/src/lib/server/scenarioBuilder.ts`

## Facts
- `engine/` is the only backend truth; `app/` should keep engine coupling behind contracts or server facades.
- `MarketKline` already exists in `app/src/lib/contracts/marketContext.ts`.
- App server/API Binance market data imports now resolve through `$lib/contracts/marketContext` or the Binance provider re-export.
- Current Binance fetcher returns the same OHLCV and 24hr ticker shapes used by callers.

## Assumptions
- `BinanceKline` is structurally identical to `MarketKline` for current app-server use.
- Moving type-only imports does not change runtime output.

## Open Questions
- Should `Direction` and `LPReason` move to contracts in a separate game/progression type slice?

## Decisions
- Keep this slice type-only and avoid moving runtime constants or engine services.
- Re-export Binance market data types from the Binance provider for existing local import paths.
- Leave `Direction`, `LPReason`, v4 research types, and COGOCHI types for separate bounded slices.

## Next Steps
- Pick the next boundary slice from remaining direct `$lib/engine/*` imports.

## Exit Criteria
- No app-server/API `BinanceKline` or `Binance24hr` import remains from `$lib/engine/types`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct `$lib/engine/*` app-server dependencies are known and left for separate slices.
