# W-0053 Terminal Page Slimming

## Goal

Reduce `/terminal/+page.svelte` orchestration weight by moving durable action fan-out, session bootstrap, and refresh scheduling into dedicated helpers without changing the merged chart/capture baseline.

## Owner

app

## Scope

- move `/terminal` dock action branching to helper/controller surfaces
- move session bootstrap and refresh cadence definitions out of `+page.svelte`
- move remaining `loadAnalysis()` fan-out that does not belong in page presentation
- keep the slice limited to page orchestration and terminal app-domain helpers

## Non-Goals

- chart architecture or chart-area UI changes owned by `W-0048`
- selected-range capture contract work already merged in `W-0051`
- refinement control-plane, replication harness, or engine runtime changes

## Canonical Files

- `AGENTS.md`
- `work/active/W-0053-terminal-page-slimming.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/lib/terminal/terminalController.ts`
- `app/src/lib/terminal/terminalController.test.ts`
- `app/src/routes/api/terminal/session/+server.ts`
- `app/src/routes/api/terminal/session/session.test.ts`

## Facts

- the dirty root already contains `terminalController.ts`, its test, and `/api/terminal/session` route files that are not yet in clean `main`
- the largest remaining orchestration diff is in `app/src/routes/terminal/+page.svelte`, not in chart widgets or persistence routes
- `W-0051` chart-range capture substrate is already merged on `main`, so `Save Setup` contract work should not be reopened here
- `W-0048` owns chart architecture, metrics dock, and chart-area structure, so this lane should not mix chart-surface changes back into page control work
- a narrower clean salvage now exists in `/tmp/wtd-v2-w0053-page-slimming-v2` on branch `codex/w-0053-terminal-page-slimming-v2`
- targeted verification now passes for this slice: `npm run check -- --fail-on-warnings` and `npm test -- --run src/lib/terminal/terminalController.test.ts src/routes/api/terminal/session/session.test.ts src/routes/api/terminal/watchlist/watchlist.test.ts`

## Assumptions

- the current controller/session extraction in the dirty tree is directionally correct and can be salvaged into a clean branch
- page-slimming can merge independently before any wider chart architecture rollout

## Open Questions

- whether `Save Setup` open/close state should stay in page or move fully behind the controller after this slice

## Decisions

- this work is a separate page-orchestration lane, not part of `W-0048`
- the first merge unit should carry controller/session extraction plus the minimum `+page.svelte` changes needed to consume them
- chart-area, metrics dock, and right-rail visual changes stay out of this branch
- `PatternLibraryPanel`, `CollectedMetricsDock`, chart-focus props, and other `W-0048` chart extras were explicitly trimmed back out of this lane after salvage

## Next Steps

1. stage and commit the clean `W-0053` salvage
2. push the branch and open a narrow draft PR for page orchestration slimming only
3. mark the broader `#65` branch as superseded by narrower slices if needed

## Exit Criteria

- `/terminal/+page.svelte` no longer owns the extracted dock branching and session bootstrap concerns directly
- controller/session helpers are covered by targeted app tests
- the slice is mergeable without chart-surface or capture-contract changes

## Handoff Checklist

- this lane owns orchestration slimming only
- do not pull `ChartBoard`, `CollectedMetricsDock`, `SaveSetupModal`, or `terminalPersistence` contract changes into this branch
- next agent should diff only controller/session/page files against the dirty root
- `+page.svelte` in this lane has already been trimmed to remove chart-lane props/imports while keeping controller/session extraction
