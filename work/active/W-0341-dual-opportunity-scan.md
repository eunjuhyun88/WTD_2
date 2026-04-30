W-0341 — Dual Opportunity Scan (TS scanner + Engine alerts union)
Wave: Core Closure | Priority: P1 | Effort: S | Owner: app
Status: Implemented | Created: 2026-04-30

## Goal
Opportunity scan uses both the TS local scanner (momentum/volume/social) AND the engine Python
scanner (building blocks) — answers "둘다 쓰며안돼?" with a concrete union.

## Scope

**Modified:**
- `app/src/lib/engine/opportunityScanner.ts` — add optional `engineSignal`, `engineBlocks`, `enginePWin` to `OpportunityScore`
- `app/src/lib/server/opportunityScan.ts` — add `fetchRecentEngineAlerts()`, `mergeEngineAlerts()`, parallel fetch in `getOrRunOpportunityScan()`
- `app/src/lib/server/engine-runtime/local/opportunity.ts` — re-export `OpportunityScore`
- `app/src/lib/server/engine-runtime/opportunity.ts` — re-export `OpportunityScore`
- `app/src/lib/server/opportunity/scanner.ts` — re-export `OpportunityScore`

## How it works
1. `getOrRunOpportunityScan` runs TS scan + `fetchRecentEngineAlerts` in parallel
2. Engine alerts from last 30 min are fetched from `engine_alerts` table (best p_win per symbol)
3. For symbols in BOTH sources: engine blocks added to alerts, totalScore boosted by up to +10
4. For engine-only symbols: stub coin injected with score derived from p_win + block count
5. All merged coins re-sorted by totalScore desc

## Non-Goals
- Changing the TS scanner's core logic
- Fetching live price data for engine-only stub coins (snapshot.price used as fallback)
- New UI components for engine vs TS differentiation

## Exit Criteria
- TypeScript: 0 new errors introduced (verified: only pre-existing InfoChip error)
- `getOrRunOpportunityScan` calls both sources in parallel
- Engine-confirmed symbols get score boost (up to +10) + engine block alerts
- Engine-only symbols appear as stub coins if engine_alerts table has recent data
- Graceful: if engine_alerts query fails, fetchRecentEngineAlerts returns [] (no-op)

## Decisions
- 30-min engine alert window: scanner runs every 15 min, so 2 cycles of coverage
- Score boost formula: `min(10, floor(p_win * 8 + block_count))` — conservative, TS momentum is primary
- Stub coin totalScore: `min(80, 40 + p_win * 40 + block_count * 2)` — caps at 80 to avoid engine signals dominating
- Direction for stubs: defaults 'long' (engine blocks are predominantly long-entry patterns)
