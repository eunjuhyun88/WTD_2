# W-0082 Opportunity Remote Universe Transport

## Goal
Make `ENGINE_RUNTIME_MODE=remote` work for the opportunity scanner by moving seed-universe selection onto `engine-api` while keeping app-side scoring overlays unchanged.

## Scope
- Split opportunity scanning into seed-universe acquisition and score/alert enrichment.
- Add a remote adapter that sources candidate coins from `engine /universe`.
- Keep the public opportunity scanner facade and result contract stable.

## Non-Goals
- No full Python port of opportunity scoring in this slice.
- No change to alert extraction semantics.
- No new engine route in this slice.

## Canonical Files
- `app/src/lib/engine/opportunityScanner.ts`
- `app/src/lib/server/engine-runtime/opportunity.ts`
- `app/src/lib/server/engine-runtime/remote/opportunity.ts`
- `app/src/lib/server/engineClient.ts`
- `docs/decisions/ADR-006-core-loop-runtime-adapter-boundary.md`

## Facts
- `opportunity` is one of the few engine-owned runtime bridges with an async surface, so it can support HTTP transport without an async boundary rewrite.
- The current scanner mixes two concerns: candidate-universe acquisition from external APIs and app-side overlay scoring.
- `engine-api` already exposes `/universe` with cached ranked token metadata and trending score.
- The scanner now shares one `scoreOpportunitySeedCoins()` pipeline across local and remote modes.
- `app` typecheck passes after wiring the first remote opportunity transport.

## Assumptions
- Using engine `/universe` as the remote seed list is an acceptable first separation step even if 1h and 7d momentum are temporarily approximated.

## Open Questions
- Whether the long-term backend truth for opportunity scoring should live fully in Python or remain an app-owned product overlay on top of engine universe data.

## Decisions
- Remote opportunity mode will use `engine.universe(sort='trending')` as the authoritative candidate source.
- App-side score composition stays shared between local and remote modes to avoid contract drift.
- Missing 1h and 7d deltas in engine universe payload are filled with conservative proxies until a dedicated engine route exists.

## Next Steps
- Evaluate whether remote opportunity quality is good enough with `/universe` proxies or whether a dedicated engine route is needed.
- Decide whether a dedicated engine opportunity route is justified after observing remote-mode quality.

## Exit Criteria
- `ENGINE_RUNTIME_MODE=remote` no longer fail-closes for the opportunity scanner. Met.
- Opportunity result and alert contracts remain stable for app callers. Met.
- `npm run check` passes in `app/`. Met: `svelte-check found 0 errors and 0 warnings`.

## Handoff Checklist
- Work item reflects the actual transport split and proxy-data caveat.
- Remaining remote fail-closed domains are called out separately from opportunity.
