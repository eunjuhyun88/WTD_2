# W-0020 Home Surface Refactor

## Goal

Refactor `/` into a cleaner landing surface that matches the stronger visual hierarchy of `/lab` and routes users into the right product surface quickly.

## Owner

app

## Scope

- replace the current animation-heavy home composition with a clearer surface shell
- align the home hierarchy with the `surface-page` system used by `lab`, `dashboard`, and related routes
- make Terminal, Lab, and Dashboard entry points visually obvious

## Non-Goals

- redesigning `terminal`, `lab`, or `dashboard` internals
- changing backend contracts or engine behavior
- deleting legacy home components unless explicitly requested

## Canonical Files

- `work/active/W-0020-home-surface-refactor.md`
- `docs/product/surfaces.md`
- `app/src/routes/+page.svelte`
- `app/src/app.css`
- `app/src/lib/home/homeLanding.ts`

## Decisions

- the landing page should act as routing and framing, not as the densest product surface
- the visual language should reuse the `surface-page` system instead of introducing another bespoke shell
- prompt-first launch into Terminal remains the primary CTA

## Next Steps

- validate the new home hierarchy in browser against `/lab`
- decide whether the old home components should be removed or kept as unused reference code
- tighten any remaining spacing inconsistencies after visual review

## Exit Criteria

- `/` reads clearly at a glance and routes users to Terminal, Lab, or Dashboard without clutter
- the home page uses the same broad surface language as `/lab`
- `npm --prefix app run check` passes after the refactor
