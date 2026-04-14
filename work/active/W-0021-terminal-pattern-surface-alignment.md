# W-0021 Terminal Pattern Surface Alignment

## Goal

Align `/terminal` and `/patterns` to the same surface shell language as `/dashboard`, with consistent width, header rhythm, and card density.

## Owner

app

## Scope

- refactor `/terminal` shell framing to sit inside the shared surface-page system
- convert `/patterns` from a bespoke black dashboard into the shared surface shell
- keep existing terminal and pattern functionality intact while improving visual hierarchy

## Non-Goals

- changing engine logic or API contracts
- redesigning terminal chart/rail internals from scratch
- changing `/dashboard` itself

## Canonical Files

- `work/active/W-0021-terminal-pattern-surface-alignment.md`
- `docs/product/surfaces.md`
- `app/src/routes/dashboard/+page.svelte`
- `app/src/routes/terminal/+page.svelte`
- `app/src/routes/patterns/+page.svelte`

## Decisions

- `/dashboard` is the reference shell for top-level product surfaces
- terminal can keep a richer workspace body, but its outer frame and header should match the shared system
- patterns should read as a first-class product surface, not a separate embedded tool

## Next Steps

- normalize terminal top chrome and workspace framing
- rebuild patterns sections with surface cards and shared topbar actions
- run app checks after the refactor

## Exit Criteria

- `/terminal` and `/patterns` visually align with `/dashboard` at a glance
- width lines, header density, and card treatment are consistent across the three surfaces
- `npm --prefix app run check` passes
