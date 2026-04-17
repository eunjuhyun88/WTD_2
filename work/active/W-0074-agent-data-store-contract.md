# W-0074 Agent Data Store Contract

## Goal
Remove agent data store imports from engine character/battle type modules.

## Scope
- Add store-facing battle XP and v2 battle result contract types.
- Update `agentData.ts` to use app contracts.
- Remove unused `getTierForLevel` import.

## Non-Goals
- No character system refactor.
- No battle simulation logic changes.
- No store behavior change.

## Canonical Files
- `app/src/lib/contracts/agentBattle.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/stores/agentData.ts`

## Facts
- `agentData.ts` now imports `BATTLE_XP_REWARDS` and `V2BattleResult` from `$lib/contracts/agentBattle`.
- The unused `getTierForLevel` import was removed.
- XP reward values are stable app progression metadata for the store.

## Assumptions
- Duplicating XP reward constants into contracts is acceptable as an intermediate boundary.

## Open Questions
- Should character progression constants be unified with the broader progression contract later?

## Decisions
- Keep this slice store-focused and avoid touching battle engine internals.

## Next Steps
- Continue with `gameState` and `warRoomStore` type boundaries.

## Exit Criteria
- `agentData.ts` no longer imports `$lib/engine/agentCharacter` or `$lib/engine/v2BattleTypes`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining store `$lib/engine/*` imports listed for later slices.
