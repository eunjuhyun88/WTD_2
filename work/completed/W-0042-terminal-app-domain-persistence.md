# W-0042 Terminal App-Domain Persistence

## Goal

Add authenticated app-domain persistence for terminal watchlist, pins, alerts, exports, and macro calendar hydration.

## Owner

app

## Scope

- Add terminal persistence contracts, API clients, server persistence helpers, and SQL migration.
- Add route handlers for `watchlist`, `pins`, `alerts`, `exports`, and `macro-calendar`.
- Hydrate terminal UI from persisted app-domain state only where needed to prove the routes.

## Non-Goals

- No analyze contract expansion.
- No engine memory state changes.
- No Save Setup capture posting.

## Canonical Files

- `work/active/W-0042-terminal-app-domain-persistence.md`
- `app/src/lib/api/terminalPersistence.ts`
- `app/src/lib/contracts/terminalPersistence.ts`
- `app/src/lib/contracts/terminalPersistence.test.ts`
- `app/src/lib/server/terminalPersistence.ts`
- `app/src/lib/server/migrations/004_terminal_persistence.sql`
- `app/src/routes/api/terminal/watchlist/+server.ts`
- `app/src/routes/api/terminal/pins/+server.ts`
- `app/src/routes/api/terminal/alerts/+server.ts`
- `app/src/routes/api/terminal/exports/+server.ts`
- `app/src/routes/api/market/macro-calendar/+server.ts`

## Facts

- This slice has been reconstructed on clean branch `codex/w-0042-terminal-app-domain-persistence-v2` from current `origin/main`.
- The route files, persistence contracts, and migration are app-owned and do not depend on engine-memory persistence or capture-link code.
- Targeted route/contract tests pass.
- `npm run check -- --fail-on-warnings` passes with the watchlist preview helper lowered to avoid depending on `W-0041` analyze contract fields.

## Assumptions

- Existing cookie auth and Postgres patterns are sufficient for the first rollout.

## Open Questions

- Whether export polling should remain in this slice or move to a smaller follow-up if it complicates verification.

## Decisions

- Keep the migration and route files together in one app-domain merge unit.
- Hydration/UI proof should be minimal and only enough to demonstrate the routes are used.

## Next Steps

1. Commit and open the clean `W-0042` PR.
2. Document migration application requirements in the PR body.
3. Leave terminal surface hydration and analyze-field consumption to later slices.

## Exit Criteria

- Authenticated terminal persistence routes work end-to-end in app tests.
- Migration is present and scoped to this feature.
- The PR contains no engine-memory or analyze-contract changes.

## Handoff Checklist

- Verification status: `npm test -- --run src/lib/contracts/terminalPersistence.test.ts src/routes/api/terminal/watchlist/watchlist.test.ts src/routes/api/terminal/alerts/alerts.test.ts src/routes/api/terminal/exports/exports.test.ts` and `npm run check -- --fail-on-warnings` passed.
- Remaining blockers: migration still needs application in the target Postgres environment.
