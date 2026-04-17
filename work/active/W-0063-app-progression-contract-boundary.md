# W-0063 App Progression Contract Boundary

## Goal
Move app-owned progression and direction contracts away from direct `$lib/engine/*` imports.

## Scope
- Add app contract types for trade direction and LP progression.
- Move app progression constants used by routes/stores to the contract layer.
- Update app server/contracts/stores imports to use app contracts.

## Non-Goals
- No engine gameplay refactor.
- No arena/v4 research type migration.
- No database schema or route behavior change.

## Canonical Files
- `app/src/lib/contracts/game.ts`
- `app/src/lib/contracts/progression.ts`
- `app/src/lib/contracts/signals.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/stores/progressionRules.ts`
- `app/src/routes/api/progression/+server.ts`
- `app/src/lib/server/ragService.ts`

## Facts
- `Direction` now resolves through `app/src/lib/contracts/game.ts` for app contract/server use.
- The progression route now imports `LPReason` and LP constants from `app/src/lib/contracts/progression.ts`.
- `progressionRules.ts` is app/store-owned and now imports tier rules from the progression contract.
- Existing progression constants are deterministic value tables with no engine runtime dependency.

## Assumptions
- Progression is an app product contract, not backend engine logic.
- Duplicating these constants into contracts is acceptable as an intermediate boundary step before deleting legacy engine copies.

## Open Questions
- Should legacy engine progression constants be removed after app callers fully migrate?

## Decisions
- Keep this slice focused on app import boundaries; do not rewrite engine constants.
- Export the new contract files through `$lib/contracts`.
- Avoid exporting `Direction` as `Direction` from the contracts barrel because `challenge.ts` already owns that name; export it as `GameDirection`.

## Next Steps
- Continue with remaining COGOCHI/v4/opportunity scanner engine imports in separate slices.

## Exit Criteria
- App contracts/server progression files no longer import `Direction`, `LPReason`, or progression constants from `$lib/engine/types` or `$lib/engine/constants`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct app-server `$lib/engine/*` dependencies identified for later slices.
