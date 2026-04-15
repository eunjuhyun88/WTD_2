# W-0036 Terminal Persistence-First Rollout

## Goal

Land the remaining `/terminal` page-integration slice on top of latest `origin/main` so terminal persistence is reviewable as a clean app-surface merge unit.

## Owner

app

## Scope

- Reconstruct the app-side `/terminal` persistence wiring on an `origin/main`-based branch.
- Keep this slice limited to page composition plus the minimal workspace components it directly feeds.
- Preserve already-merged analyze contract (`#52`), Save Setup capture-link (`#53`), app-domain persistence (`#50`), and engine memory durability (`#51`) work.

## Non-Goals

- No standalone memory retrieval work.
- No reintroduction of the older `task/w-0024-terminal-attention-implementation` branch as a merge unit.
- No pattern-library or analysis-rail redesign work in this slice.

## Canonical Files

- `work/active/W-0036-terminal-persistence-first-rollout.md`
- `docs/domains/terminal-html-backend-parity.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/components/terminal/workspace/TerminalLeftRail.svelte`
- `app/src/components/terminal/workspace/TerminalContextPanel.svelte`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`

## Facts

- `origin/main` already contains the app-domain persistence routes, engine memory durability, explicit analyze contract consumption, and the Save Setup capture-link slice; the remaining W-0036 delta is an app-surface integration problem.
- The old `task/w-0024-terminal-attention-implementation` branch diverges from `origin/main` at `c68b21e`, so its `/terminal/+page.svelte` cannot be copied wholesale.
- The current clean branch `codex/w-0036-terminal-page-mainline` limits its diff to four files: `TerminalLeftRail.svelte`, `TerminalContextPanel.svelte`, `TerminalBottomDock.svelte`, and `/terminal/+page.svelte`.
- This clean branch wires persisted watchlist/pins/alerts/macro data into `/terminal`, routes Pin/Alert/Compare/Export through app-domain endpoints, and records durable memory debug events only from explicit actions.
- `npm run check -- --fail-on-warnings` and targeted persistence contract/route tests pass on `codex/w-0036-terminal-page-mainline`.

## Assumptions

- The merged analyze contract slice remains the baseline truth for `TerminalContextPanel` and `panelAdapter`.
- Postgres migration/application smoke testing can happen after branch review, not inside this reconstruction step.

## Open Questions

- none

## Decisions

- `W-0036` remains the umbrella rollout, but the remaining implementation branch is `codex/w-0036-terminal-page-mainline`.
- Keep the page-integration slice limited to the four touched app files; do not pull in pattern-library or broader terminal surface changes from the older branch.
- Preserve `origin/main` behavior from `#52` and `#53` while replaying only the page wiring from the older clean integration commit.

## Next Steps

1. Review this branch as the remaining page-integration slice on top of current `origin/main`.
2. Apply the terminal persistence SQL migration in the target Postgres environment.
3. Run an authenticated browser smoke test on `/terminal`.

## Exit Criteria

- The `/terminal` page can hydrate watchlist/pins/alerts/macro state from real app-domain routes.
- Pin/Alert/Compare/Export actions use dedicated app endpoints instead of prompt-only behavior.
- The app-surface delta remains isolated to the four intended files and passes app verification.

## Handoff Checklist

- Active branch: `codex/w-0036-terminal-page-mainline`
- Verification status: `npm run check -- --fail-on-warnings` passed; targeted persistence tests passed
- Remaining blockers: migration apply and authenticated browser smoke test
