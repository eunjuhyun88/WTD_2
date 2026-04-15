# W-0046 Pattern Seed Scout Research Lane

## Goal

Reintroduce pattern-seed matching as an optional research surface without breaking the chart-first `/terminal` attention model.

## Owner

research

## Scope

- Preserve the pattern-seed idea as a research lane, not always-on terminal chrome.
- Reuse the existing seed-matching route and scoring logic where it still fits.
- Redesign the surface so thesis-driven exploration opens on demand from `/terminal` instead of occupying permanent top-of-page space.

## Non-Goals

- No permanent full-width scout panel in the default terminal layout.
- No rewrite of the terminal attention model.
- No coupling to terminal persistence rollout or pattern capture write paths.

## Canonical Files

- `work/active/W-0046-pattern-seed-scout-research-lane.md`
- `work/active/W-0024-terminal-interactive-port.md`
- `docs/product/terminal-attention-workspace.md`
- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/api/terminal/opportunity-scan/+server.ts`
- `app/src/lib/engine/opportunityScanner.ts`

## Facts

- Closed PR `#24` implemented a thesis-driven pattern-seed scout with one API route, one component, one test, and a small `/terminal` integration.
- The idea is research-useful because it converts natural-language theses into ranked symbol candidates using existing board and scan signals.
- The closed implementation mounted the scout as a permanent full-width panel near the top of `/terminal`.
- Current terminal direction is chart-first with compact progressive disclosure, not large always-on research slabs.

## Assumptions

- The seed-matching route logic can be reused with limited changes if the UI entry point changes.
- An optional panel, drawer, or modal would preserve the research value without diluting core terminal attention.

## Open Questions

- Should the scout live behind a bottom-dock action, a pattern-library side panel, or a separate research route?
- Should snapshot uploads remain filename-only hints or become actual image-assisted matching later?

## Decisions

- Do not merge the original `#24` implementation as-is.
- Treat pattern-seed matching as a research lane, not default terminal chrome.
- Preserve the idea for a later clean slice rather than discarding it.

## Next Steps

- Design the smallest optional entry point for pattern-seed research from `/terminal`.
- Re-slice the `#24` code into a clean branch once the surface location is chosen.
- Keep the route and ranking logic independent from terminal persistence and rail chrome changes.

## Exit Criteria

- A clean work item and PR exist for an optional pattern-seed research surface that fits the chart-first terminal model.

## Handoff Checklist

- Original implementation was intentionally closed as PR `#24` for re-slicing, not rejected on technical quality.
- The next agent should start from the old `task/W-0025-terminal-pattern-seed-flow` branch or commit `566c361` if code reuse is needed.
- The key design constraint is optionality: the scout must not become permanent terminal header/body chrome.
