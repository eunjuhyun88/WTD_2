# W-0046 Pattern Seed Scout Research Lane

## Goal

Reintroduce pattern-seed matching as an optional research surface inside `/terminal` without breaking the chart-first attention model.

## Owner

research

## Scope

- Add an on-demand research entry from the terminal bottom dock.
- Reuse a dedicated seed-match route to rank board and scan symbols from a free-form thesis.
- Open the scout as a temporary drawer/panel, not permanent terminal chrome.

## Non-Goals

- No always-on top-of-page research slab.
- No terminal persistence changes.
- No pattern capture write-path changes.

## Canonical Files

- `work/active/W-0046-pattern-seed-scout-research-lane.md`
- `app/src/components/terminal/workspace/TerminalBottomDock.svelte`
- `app/src/components/terminal/workspace/PatternSeedScoutPanel.svelte`
- `app/src/routes/api/terminal/pattern-seed/match/+server.ts`
- `app/src/routes/api/terminal/pattern-seed/match/match.test.ts`
- `app/src/routes/terminal/+page.svelte`

## Facts

- Closed PR `#24` proved the thesis-to-candidate matching idea but mounted it as permanent terminal surface.
- Current terminal direction is chart-first and relies on progressive disclosure rather than persistent research chrome.
- The bottom dock already owns quick actions and is the smallest optional entry point available on current `main`.
- The matching route can reuse `runOpportunityScan` plus current board asset snapshots without touching engine contracts.
- `npm run check -- --fail-on-warnings` passes on the clean scout branch.
- `npm test -- --run src/routes/api/terminal/pattern-seed/match/match.test.ts` passes on the clean scout branch.

## Assumptions

- Users will accept a drawer-style research lane if it opens only on demand.
- A filename-only snapshot hint is sufficient for v1; image-aware matching can wait.

## Open Questions

- Whether the scout should later move behind a dedicated research route once usage is proven.

## Decisions

- Keep the scout optional and dock-triggered.
- Prefer a right-side drawer/panel over injecting a permanent body section into `/terminal`.
- Treat this as research tooling, not core terminal chrome.

## Next Steps

- Implement the dock-triggered scout drawer and seed-match route.
- Verify app check plus targeted route tests.
- Land this as a separate research slice from terminal persistence and capture work.

## Exit Criteria

- `/terminal` can open and close the scout on demand from the dock.
- The scout returns ranked candidates and can pivot terminal focus to a chosen symbol.
- No permanent research slab is added to the default terminal layout.

## Handoff Checklist

- The original `#24` idea was closed for surface mismatch, not technical failure.
- The next agent should keep the scout optional even if the ranking logic expands later.
- Verification status: app check and targeted route test passed on this branch.
