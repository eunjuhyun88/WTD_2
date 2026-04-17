# W-0078 Bridge Ownership Classification

## Goal
Classify the remaining app-engine bridge files by long-term ownership so future refactors stop at the correct boundary.

## Scope
- Inventory the remaining intentional bridge/facade files under `app/src/lib`.
- Record which bridges should remain app-owned, engine-owned, or transitional.
- Publish the decision as an ADR.

## Non-Goals
- No runtime migration in this slice.
- No backend deployment change.
- No additional code path rewrites beyond documentation.

## Canonical Files
- `docs/decisions/ADR-005-bridge-ownership-and-promotion.md`
- `app/src/lib/lab/backtest.ts`
- `app/src/lib/agents/definitions.ts`
- `app/src/lib/server/opportunity/scanner.ts`
- `app/src/lib/server/research/v4Battle.ts`
- `app/src/lib/server/rag/embedding.ts`
- `app/src/lib/server/cogochi/signalSnapshot.ts`
- `app/src/lib/server/douni/personality.ts`

## Facts
- App direct imports of `$lib/engine/*` are now limited to intentional bridge/facade files.
- Some bridges wrap deterministic product-surface helpers, while others wrap analysis/runtime logic that belongs with engine semantics.
- Without an ownership decision, future slices risk either over-pulling app concerns into engine or duplicating engine logic in app.

## Assumptions
- The accepted ADR can be used as the tie-breaker for future refactor scope.

## Open Questions
- When `engine-api` fully absorbs engine compute, should TypeScript engine runtime bridges become generated API clients instead of local wrappers?

## Decisions
- Record bridge ownership now before further migration.

## Next Steps
- Add ADR-005 with bridge classification and promotion rules.

## Exit Criteria
- A durable ADR exists that classifies every remaining bridge file by ownership.

## Handoff Checklist
- Active work item updated with final ownership decision.
- Subsequent bridge refactors reference ADR-005.
