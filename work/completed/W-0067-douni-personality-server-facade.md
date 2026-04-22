# W-0067 DOUNI Personality Server Facade

## Goal
Keep DOUNI terminal server modules from importing COGOCHI personality and snapshot engine paths directly.

## Scope
- Add a server facade for DOUNI personality prompt builders and profile types.
- Update DOUNI context builder and terminal message route imports.
- Use the existing server COGOCHI signal snapshot facade for snapshot types.

## Non-Goals
- No DOUNI prompt text changes.
- No COGOCHI signal engine migration.
- No LLM/tool loop behavior change.

## Canonical Files
- `app/src/lib/server/douni/personality.ts`
- `app/src/lib/server/douni/contextBuilder.ts`
- `app/src/routes/api/cogochi/terminal/message/+server.ts`
- `app/src/lib/server/cogochi/signalSnapshot.ts`

## Facts
- `contextBuilder.ts` imports prompt builders and `DouniProfile` from `$lib/server/douni/personality`.
- The terminal message route imports `DouniProfile` from the DOUNI facade and `SignalSnapshot` from the COGOCHI snapshot facade.
- `app/src/lib/server/cogochi/signalSnapshot.ts` already acts as the server facade for COGOCHI signal snapshots.

## Assumptions
- A thin server facade is the correct intermediate step before moving DOUNI prompt code out of the app engine folder.

## Open Questions
- Should DOUNI personality prompt code be promoted to `app/src/lib/server/douni` permanently?

## Decisions
- Keep engine implementation import isolated to a server facade in this slice.
- Use `ServerSignalSnapshot` from the existing signal snapshot facade instead of importing raw engine snapshot types.
- Keep the direct personality engine import isolated to `app/src/lib/server/douni/personality.ts`.

## Next Steps
- Continue with v4 research/memory type boundaries in separate slices.

## Exit Criteria
- No route or non-facade DOUNI server module imports `$lib/engine/cogochi/douni/douniPersonality`. Met.
- Terminal message route no longer imports `$lib/engine/cogochi/types`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct COGOCHI engine imports are isolated or listed for future slices.
