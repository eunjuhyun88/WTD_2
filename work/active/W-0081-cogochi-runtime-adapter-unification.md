# W-0081 COGOCHI Runtime Adapter Unification

## Goal
Unify COGOCHI and DOUNI runtime execution behind the same engine-runtime adapter layer used by other engine-owned runtime bridges.

## Scope
- Add `engine-runtime` adapters for COGOCHI signal snapshot and DOUNI personality runtime.
- Repoint `server/cogochi/signalSnapshot.ts` and `server/douni/personality.ts` to those adapters.
- Keep current local runtime behavior unchanged.

## Non-Goals
- No remote HTTP transport implementation in this slice.
- No COGOCHI scoring/prompt logic change.
- No route/store behavior change.

## Canonical Files
- `app/src/lib/server/engine-runtime/cogochi.ts`
- `app/src/lib/server/engine-runtime/douni.ts`
- `app/src/lib/server/engine-runtime/local/cogochi.ts`
- `app/src/lib/server/engine-runtime/local/douni.ts`
- `app/src/lib/server/cogochi/signalSnapshot.ts`
- `app/src/lib/server/douni/personality.ts`

## Facts
- `server/cogochi/signalSnapshot.ts` and `server/douni/personality.ts` now import `engine-runtime` adapters instead of local engine runtime directly.
- The engine-runtime adapter pattern now exists for other engine-owned bridges.
- Unifying these facades under the same adapter layer simplifies future remote transport rollout and performance control.

## Assumptions
- COGOCHI and DOUNI remain transitional facades by ownership, but should still use the standardized runtime adapter boundary.

## Open Questions
- Whether DOUNI personality should eventually remain local app-owned prompt logic even if COGOCHI scoring moves remote.

## Decisions
- Apply the adapter pattern for consistency even though remote transport is not implemented yet.
- Keep remote mode fail-closed for both domains.

## Next Steps
- Continue with first real remote transport implementation for an engine-owned runtime domain.

## Exit Criteria
- `server/cogochi/signalSnapshot.ts` and `server/douni/personality.ts` no longer import `$lib/engine/*` directly. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct `$lib/engine/*` imports in app are limited to `engine-runtime/local/*` plus app-owned bridges.
