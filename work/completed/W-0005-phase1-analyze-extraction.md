# W-0005 Phase 1 Analyze Extraction Plan

## Goal

Execute Phase 1 refactor of the `analyze` hot path by extracting modules with zero intended behavior change and clear verification gates.

## Owner

app

## Scope

- extract orchestration responsibilities from `app/src/routes/api/cogochi/analyze/+server.ts`
- keep endpoint contract stable for `terminal` consumers
- add targeted tests for extracted modules
- add basic trace/latency timing hooks without changing response semantics

## Non-Goals

- changing deep/score decision policy
- introducing new fallback rules
- modifying engine-side business logic
- redesigning terminal UI payload shape

## Canonical Files

- `app/src/routes/api/cogochi/analyze/+server.ts`
- `app/src/lib/server/engineClient.ts`
- `app/src/lib/server/providers/rawSources.ts`
- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/engine/cogochi/layerEngine.ts`

## Implementation Surface (File-Level)

### Create

- `app/src/lib/server/analyze/types.ts`
- `app/src/lib/server/analyze/requestParser.ts`
- `app/src/lib/server/analyze/marketDataCollector.ts`
- `app/src/lib/server/analyze/perpFeatureBuilder.ts`
- `app/src/lib/server/analyze/engineOrchestrator.ts`
- `app/src/lib/server/analyze/responseMapper.ts`
- `app/src/lib/server/analyze/timing.ts`

### Update

- `app/src/routes/api/cogochi/analyze/+server.ts`  
  - keep route signature and output shape
  - replace in-file logic with module orchestration

## Work Breakdown

1. **Type extraction**
   - define internal DTOs for raw inputs, derived perp features, engine settled results
   - isolate route-facing response type aliases

2. **Request parsing**
   - move `symbol`/`tf` parsing and defaulting into parser
   - keep current defaults exactly (`BTCUSDT`, `4h`)

3. **Market data collection**
   - extract parallel `readRaw` fanout into collector module
   - preserve current source IDs and failure handling (`catch(() => null|[])`)

4. **Derived feature assembly**
   - move `oi_notional`, liquidation aggregation, taker ratio, price pct logic
   - preserve numeric scale contracts (`oi_pct` percent vs score fraction conversion)

5. **Engine orchestration**
   - isolate deep/score `Promise.allSettled` logic
   - return a neutral settled-result object for mapper use

6. **Response mapping**
   - produce the final response object shape currently consumed by `terminal/+page.svelte`
   - keep key names unchanged (`deep`, `snapshot`, `ensemble`, `microstructure`, etc.)

7. **Route simplification**
   - route becomes coordinator: parse -> collect -> build -> call engine -> map -> return

8. **Timing hooks**
   - add in-memory timing marks for collector/deep/score/merge/total
   - log server-side only; no response field addition in Phase 1

## Verification

- add or update tests for:
  - parser default/validation behavior
  - feature builder numeric conversions
  - mapper output keys for full and partial engine success
- run app checks:
  - `npm --prefix app run check`
  - relevant test command for route/module tests
- run manual smoke:
  - terminal initial load
  - symbol switch
  - timeframe switch

## Risk Controls

- one compatibility snapshot test for route JSON keys
- no key rename or deletion allowed in this phase
- guard against accidental fallback policy changes

## Decisions

- keep route response keys stable during extraction to avoid terminal regressions
- prioritize boundary extraction over optimization in this phase
- allow existing fallback behavior temporarily until explicit degraded schema phase

## Next Steps

- extract remaining `requestParser` and `responseMapper` modules from `analyze`
- add one integration-style test for partial engine success (`deep` or `score` missing)
- add timing instrumentation module and route-level trace id logging

## Exit Criteria

- `analyze/+server.ts` no longer contains raw-data fanout and detailed merge logic
- extracted modules cover parser/collector/builder/orchestrator/mapper boundaries
- route output remains backward-compatible for terminal consumers
- app checks and smoke flows pass
