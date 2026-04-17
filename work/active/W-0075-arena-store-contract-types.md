# W-0075 Arena Store Contract Types

## Goal
Move arena/war-room store state types away from direct engine imports.

## Scope
- Add app contract types for C02 store state, battle ticks, and war-room rounds.
- Update `gameState.ts` and `warRoomStore.ts` imports.
- Preserve store behavior.

## Non-Goals
- No battle resolver implementation migration.
- No arena API or DB changes.
- No UI behavior change.

## Canonical Files
- `app/src/lib/contracts/gameArena.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/stores/gameState.ts`
- `app/src/lib/stores/warRoomStore.ts`

## Facts
- `gameState.ts` imports C02 and battle tick types from `$lib/contracts/gameArena`.
- `warRoomStore.ts` imports war-room state types from `$lib/contracts/gameArena`.
- These are store/UI state shapes rather than engine execution logic.

## Assumptions
- Structural contract types are sufficient for current store usage.

## Open Questions
- Should battle resolver runtime be wrapped behind an arena facade later?

## Decisions
- Keep this slice type-only.
- Reused the existing `gameArena` contract instead of adding a duplicate arena contract.
- Exported arena `BattleTickState` as `ArenaBattleTickState` from the contracts barrel to avoid colliding with research v4 `BattleTickState`.

## Next Steps
- Continue with COGOCHI `ExtendedMarketData` and any remaining facade-only imports.

## Exit Criteria
- `gameState.ts` and `warRoomStore.ts` no longer import `$lib/engine/types` or `$lib/engine/battleResolver`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct app `$lib/engine/*` imports listed for future slices.
