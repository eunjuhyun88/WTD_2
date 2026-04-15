# W-0036 Terminal Persistence-First Rollout

## Goal

Land the remaining `/terminal` page-integration slice on top of `origin/main` so terminal persistence is reviewable as a clean app-surface merge unit.

## Owner

app

## Scope

- Reconstruct the app-side `/terminal` persistence wiring on an `origin/main`-based branch.
- Keep this slice limited to page composition plus the minimal workspace components it directly feeds.
- Reuse already separated merge units for analyze contract (`W-0041`) and engine memory durability (`W-0043`).

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

- `origin/main` already contains the app-domain persistence routes and engine memory durability; the remaining W-0036 delta is an app-surface integration problem.
- The old `task/w-0024-terminal-attention-implementation` branch diverges from `origin/main` at `c68b21e`, so its `/terminal/+page.svelte` cannot be copied wholesale.
- The clean branch `codex/w-0044-terminal-page-integration-clean` now limits its diff to four files: `TerminalLeftRail.svelte`, `TerminalContextPanel.svelte`, `TerminalBottomDock.svelte`, and `/terminal/+page.svelte`.
- This clean branch wires persisted watchlist/pins/alerts/macro data into `/terminal`, routes Pin/Alert/Compare/Export through app-domain endpoints, and records durable memory debug events only from explicit actions.
- `npm run check -- --fail-on-warnings` and targeted persistence contract/route tests pass on `codex/w-0044-terminal-page-integration-clean`.

## Assumptions

- `W-0041` analyze contract consumption remains a separate review slice and may land alongside this page-integration branch.
- Postgres migration/application smoke testing can happen after branch review, not inside this reconstruction step.

## Open Questions

- none

## Decisions

- `W-0036` remains the umbrella rollout, but the remaining implementation branch is `codex/w-0044-terminal-page-integration-clean`.
- Keep the page-integration slice limited to the four touched app files; do not pull in pattern-library or broader terminal surface changes from the older branch.
- Reuse `codex/w-0041-terminal-analyze-contract-surface-clean` for explicit analyze-field consumption instead of re-mixing those changes here.
- Preferred merge order is `W-0041` first, then `W-0044`; however, temporary integration validation showed the two slices compose cleanly as a stack on top of `origin/main`.
- Review framing:
  - `W-0041` PR title: `Consume explicit terminal analyze contract`
  - `W-0044` PR title: `Wire terminal persistence into workspace surface`
- Internal rollout should stay gated behind migration apply plus an authenticated browser smoke test; do not infer rollout readiness from unit tests alone.

## Next Steps

1. Pair this branch with `codex/w-0041-terminal-analyze-contract-surface-clean` for review/merge ordering.
2. Apply the terminal persistence SQL migration in the target Postgres environment.
3. Run an authenticated browser smoke test on `/terminal`.
4. If smoke test passes, open stacked or sequential PRs with `W-0041` as the contract base and `W-0044` as the app-surface consumer.

## Exit Criteria

- The `/terminal` page can hydrate watchlist/pins/alerts/macro state from real app-domain routes.
- Pin/Alert/Compare/Export actions use dedicated app endpoints instead of prompt-only behavior.
- The app-surface delta remains isolated to the four intended files and passes app verification.
- Reviewers can evaluate `W-0044` without rereading the old mixed branch or engine-memory implementation history.

## Rollout Gates

- Required before merge:
  - `W-0041` and `W-0044` app checks green
  - targeted mapper/persistence tests green
- Required before internal rollout:
  - terminal persistence SQL migration applied
  - authenticated `/terminal` smoke test passed
  - compare/pin/alert/export actions observed against real app-domain routes

## AI Evaluation

- Research objective: reduce UI semantic inference and increase replayable decision state.
- Success signals:
  - `entryPlan`, `riskPlan`, `flowSummary`, and `sources` render directly without fallback-heavy panel logic
  - re-entering `/terminal` restores enough state that the same decision context can be inspected without re-running ad hoc prompt flows
  - durable actions emit memory debug sessions only for explicit user commits, keeping memory feedback cleaner than passive-view instrumentation
- Metrics to watch after rollout:
  - share of panel renders using explicit analyze fields vs fallback derivation
  - watchlist/pin/alert restore success rate on terminal re-entry
  - export job completion rate
  - memory debug-session volume per durable action, to detect overlogging or missed instrumentation

## Handoff Checklist

- Active branch: `codex/w-0044-terminal-page-integration-clean`
- Verification status: `npm run check -- --fail-on-warnings` passed; targeted persistence tests passed
- Remaining blockers: migration apply and authenticated browser smoke test
