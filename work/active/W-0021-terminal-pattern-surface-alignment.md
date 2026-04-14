# W-0021 Terminal Pattern Surface Alignment

## Goal

Align `/terminal`, `/patterns`, and `/lab` to the same fixed surface shell language as `/dashboard`, with a shared product header, fixed local hero, and consistent width, header rhythm, and card density.

## Owner

app

## Scope

- refactor `/terminal` shell framing to sit inside the shared surface-page system
- convert `/patterns` from a bespoke black dashboard into the shared surface shell
- normalize `/lab` onto the same fixed header + scroll body pattern
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
- top-level product surfaces use a shared fixed app header, while only the body region scrolls
- terminal can keep a richer workspace body, but its outer frame and header should match the shared system
- patterns should read as a first-class product surface, not a separate embedded tool

## Next Steps

- tighten terminal top chrome and workspace framing against the shared fixed shell
- finish applying the shared fixed shell to patterns and lab
- run app checks after the refactor

## Exit Criteria

- `/terminal`, `/patterns`, and `/lab` visually align with `/dashboard` at a glance
- width lines, header density, and card treatment are consistent across the four surfaces
- the global product header remains fixed while page-local content changes underneath
- `npm --prefix app run check` passes
