# W-0083 Opportunity Engine Route

## Goal
Promote remote opportunity scanning from an app-side composition over `engine /universe` into a dedicated engine API route so backend truth owns the remote opportunity result shape.

## Scope
- Add a Python `engine-api` route for opportunity scanning.
- Expose request/response schemas for the route.
- Repoint the app remote opportunity adapter to call the dedicated engine route.

## Non-Goals
- No change to local opportunity scanning behavior.
- No migration of LunarCrush, FRED, or CryptoQuant integrations into Python in this slice.
- No app surface contract change.

## Canonical Files
- `engine/api/routes/opportunity.py`
- `engine/api/schemas_opportunity.py`
- `engine/api/schemas.py`
- `engine/api/main.py`
- `engine/tests/test_opportunity_routes.py`
- `app/src/lib/server/engineClient.ts`
- `app/src/lib/server/engine-runtime/remote/opportunity.ts`

## Facts
- Remote opportunity mode currently depends on app-side scoring after fetching seed candidates from `engine /universe`.
- `engine /universe` already provides ranked tokens with trending score, price, market cap, and 24h volume.
- Opportunity scanning is async, so moving it behind HTTP does not require rewriting sync app call sites.
- A dedicated `engine /opportunity/run` route now exists and returns the app-facing opportunity result shape.
- Targeted engine test passes for the new route.

## Assumptions
- A backend-owned remote opportunity score can start with universe-derived proxy signals and neutral defaults for unavailable overlays.

## Open Questions
- Whether social/macro/onchain overlays should eventually move fully into Python or remain optional app enrichments.

## Decisions
- The dedicated engine route will return the same high-level opportunity result shape used by the app bridge.
- Missing 1h and 7d deltas are approximated conservatively from 24h data for now.
- Remote app adapter will stop composing scores locally once the route exists.

## Next Steps
- Resolve unrelated app-wide `svelte-check` blockers so full app verification can be green again.
- Reassess whether local and remote scoring should converge further under a shared spec.

## Exit Criteria
- App remote opportunity adapter no longer depends on app-side scoring helpers. Met.
- Targeted engine route test passes. Met: `uv run pytest tests/test_opportunity_routes.py`.
- `npm run check` passes in `app/`. Blocked by pre-existing unrelated errors in `TerminalBottomDock.svelte`.

## Handoff Checklist
- Work item reflects the proxy-data compromises in the first engine-owned implementation.
- Remaining app-owned local opportunity logic is explicitly left as fallback only.
