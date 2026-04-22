# W-0075 Game Store Contract Types

## Goal
Move game/war room store type imports away from direct engine modules.

## Scope
- Add app contract types for C02 outputs, war room rounds, and battle tick state used by stores.
- Update `gameState.ts` and `warRoomStore.ts` imports.
- Preserve runtime battle resolver behavior.

## Non-Goals
- No battle resolver runtime facade in this slice.
- No game logic changes.
- No UI behavior changes.

## Canonical Files
- `app/src/lib/contracts/gameArena.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/stores/gameState.ts`
- `app/src/lib/stores/warRoomStore.ts`

## Facts
- `gameState.ts` imports only types from `engine/types` and `engine/battleResolver`.
- `warRoomStore.ts` imports only war room types from `engine/types`.
- These shapes are app state contracts consumed by stores/UI.

## Assumptions
- Contract copies can structurally mirror the current engine types without runtime changes.

## Open Questions
- Should battle resolver itself get an app-facing facade later for consistency?

## Decisions
- Keep this slice type-only.

## Next Steps
- Add game arena contracts.
- Update store imports.
- Run app typecheck.

## Exit Criteria
- `gameState.ts` and `warRoomStore.ts` no longer import `$lib/engine/types` or `$lib/engine/battleResolver`.
- `npm run check` passes in `app/`.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct app surface `$lib/engine/*` imports listed for later slices.
