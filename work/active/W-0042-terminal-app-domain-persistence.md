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

- The local mixed diff already includes route files, persistence contracts, and a migration.
- These routes are app-owned and should not depend on engine-memory persistence or capture-link code.
- This slice needs app route tests and likely a migration/application note, but not terminal surface parity cleanup.

## Assumptions

- Existing cookie auth and Postgres patterns are sufficient for the first rollout.

## Open Questions

- Whether export polling should remain in this slice or move to a smaller follow-up if it complicates verification.

## Decisions

- Keep the migration and route files together in one app-domain merge unit.
- Hydration/UI proof should be minimal and only enough to demonstrate the routes are used.

## Next Steps

1. Recover the route, client, and migration files from the mixed local branch into a clean branch.
2. Run targeted route tests and `app` check.
3. Document migration application requirements in the PR body.

## Exit Criteria

- Authenticated terminal persistence routes work end-to-end in app tests.
- Migration is present and scoped to this feature.
- The PR contains no engine-memory or analyze-contract changes.

## Handoff Checklist

- Verification status: not yet restaged on a clean branch.
- Remaining blockers: route test rerun on clean branch.
