# W-0071 Lab Backtest Boundary

## Goal
Move lab/backtest UI imports away from direct `$lib/engine/backtestEngine` paths.

## Scope
- Add app contract types for lab strategy/backtest records.
- Add a lab facade for backtest execution.
- Update lab components, lab route, and strategy store imports.

## Non-Goals
- No backtest algorithm changes.
- No lab UI behavior changes.
- No indicator implementation migration.

## Canonical Files
- `app/src/lib/contracts/backtest.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/lab/backtest.ts`
- `app/src/routes/lab/+page.svelte`
- `app/src/components/lab/*.svelte`
- `app/src/components/terminal/StrategyCard.svelte`
- `app/src/lib/stores/strategyStore.ts`

## Facts
- Lab UI imports strategy/backtest types from `$lib/lab/backtest`.
- The lab page imports `runMultiCycleBacktest` from `$lib/lab/backtest`.
- Backtest result/strategy shapes are app product contracts for the lab surface.

## Assumptions
- Contract types can structurally mirror the current engine types without behavior change.

## Open Questions
- Should the backtest implementation eventually move to backend `engine/` Python or stay as client-side deterministic lab tooling?

## Decisions
- Keep runtime engine import isolated to `app/src/lib/lab/backtest.ts`.
- Keep this slice focused on import boundaries.

## Next Steps
- Continue with chart pattern detector and agent data surface boundaries.

## Exit Criteria
- No lab component/store/page imports `$lib/engine/backtestEngine` directly. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining app surface `$lib/engine/*` imports listed for later slices.
