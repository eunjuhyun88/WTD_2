# W-0077 COGOCHI Contract Promotion

## Goal
Promote COGOCHI signal and DOUNI profile types to app contracts so facades stop re-exporting engine types.

## Scope
- Add app contract types for `SignalSnapshot`, `ExtendedMarketData`, and DOUNI profile options.
- Update COGOCHI and DOUNI server facades to expose contract types and cast internally.
- Preserve current runtime behavior.

## Non-Goals
- No COGOCHI layer logic changes.
- No DOUNI prompt changes.
- No route/store behavior changes.

## Canonical Files
- `app/src/lib/contracts/cogochi.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/server/cogochi/signalSnapshot.ts`
- `app/src/lib/server/douni/personality.ts`

## Facts
- `server/cogochi/signalSnapshot.ts` now exposes COGOCHI contract types from `app/src/lib/contracts/cogochi.ts`.
- `server/douni/personality.ts` now exposes `DouniProfile` and prompt option contract types and wraps engine functions.
- App routes/services already consume these through facades, so the surface is centralized.

## Assumptions
- Structural contract types with `unknown` layer payloads are sufficient for current app consumers.

## Open Questions
- Should full layer result contracts be promoted later if the UI starts reading individual `l1..l19` payloads directly?

## Decisions
- Keep engine runtime imports in facades, but stop exposing engine types through them.
- Use thin structural layer contracts for the subset of snapshot fields the app currently reads.

## Next Steps
- Continue only if a facade should be promoted from bridge to fully app-owned implementation.

## Exit Criteria
- Facades expose app contract types instead of direct engine type re-exports. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct app `$lib/engine/*` imports are intentional runtime facades/bridges only.
