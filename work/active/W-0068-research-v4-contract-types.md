# W-0068 Research V4 Contract Types

## Goal
Move app-server v4 research type/config imports away from `$lib/engine/v4/types.js`.

## Scope
- Add app contract types for the v4 research/autoresearch shapes used by server modules.
- Move app-server type-only imports and `V4_CONFIG` consumers to the contract layer.
- Add a server runtime facade for battle state machine calls.

## Non-Goals
- No battle state machine implementation changes.
- No autoresearch algorithm changes.
- No memory DB schema changes.

## Canonical Files
- `app/src/lib/contracts/researchV4.ts`
- `app/src/lib/contracts/index.ts`
- `app/src/lib/server/research/v4Battle.ts`
- `app/src/lib/server/scenarioBuilder.ts`
- `app/src/lib/server/memory/*.ts`
- `app/src/lib/server/orpo/*.ts`
- `app/src/lib/server/autoResearch/*.ts`
- `app/src/lib/server/exchange/patternAnalyzer.ts`
- `app/src/routes/api/lab/forward-walk/+server.ts`

## Facts
- v4 type/config imports now resolve through `app/src/lib/contracts/researchV4.ts`.
- Runtime battle execution now resolves through `app/src/lib/server/research/v4Battle.ts`.
- Server code accesses a limited subset of v4 type fields.
- `V4_CONFIG` consumers use only `AUTO_SL_PERCENT`, `ORPO_MIN_PAIRS`, and `ORPO_MIN_QUALITY` in current app-server files.

## Assumptions
- Contract interfaces can be structural subsets of engine return values for current app-server use.
- Battle execution facade should be a separate slice because it changes runtime import boundaries.

## Open Questions
- Should the battle state machine move under `engine/` backend truth later instead of app TypeScript?

## Decisions
- Use app contract types and a minimal app-owned `V4_CONFIG` contract for server consumers.
- Keep the direct `battleStateMachine` import isolated to `app/src/lib/server/research/v4Battle.ts`.

## Next Steps
- Continue with remaining `scanEngine` agent pool and COGOCHI signal snapshot implementation boundaries.

## Exit Criteria
- No app-server route/module imports `$lib/engine/v4/types.js`. Met.
- No app-server route/module outside the v4 battle facade imports `$lib/engine/v4/battleStateMachine.js`. Met.
- `npm run check` passes in `app/`. Met: 0 errors, 0 warnings.

## Handoff Checklist
- Active work item updated with verification result.
- Remaining direct `$lib/engine/*` imports listed for future slices.
