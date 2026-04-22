# W-0020 Home Surface Refactor

## Goal

Refactor `/` into a cleaner landing surface that matches the stronger visual hierarchy of `/lab` and routes users into the right product surface quickly.

## Owner

app

## Scope

- replace the current animation-heavy home composition with a clearer surface shell
- align the home hierarchy with the `surface-page` system used by `lab`, `dashboard`, and related routes
- make Terminal, Lab, and Dashboard entry points visually obvious
- keep home maintenance-only for performance regressions; do not reopen visual redesign scope

## Non-Goals

- redesigning `terminal`, `lab`, or `dashboard` internals
- changing backend contracts or engine behavior
- deleting legacy home components unless explicitly requested
- changing home copy or section order beyond maintenance needs

## Canonical Files

- `work/active/W-0020-home-surface-refactor.md`
- `docs/product/surfaces.md`
- `docs/product/pages/01-home.md`
- `app/src/routes/+page.svelte`
- `app/src/components/home/WebGLAsciiBackground.svelte`
- `app/src/app.css`
- `app/src/lib/home/homeLanding.ts`

## Facts

- `/` mounts `WebGLAsciiBackground`, which creates a fullscreen WebGL2 canvas and runs a continuous `requestAnimationFrame` loop.
- Local observation on 2026-04-16 showed Safari `WebContent` near 1.4 GB RSS while `http://localhost:5174/` was open, while the local Vite server process stayed below 300 MB RSS.
- The home product spec is frozen and only allows maintenance work such as responsive, accessibility, or similar regressions.

## Assumptions

- The memory spike is primarily browser-side rendering cost from the animated home background, not a backend or route-data issue.

## Open Questions

- None.

## Decisions

- the landing page should act as routing and framing, not as the densest product surface
- the visual language should reuse the `surface-page` system instead of introducing another bespoke shell
- prompt-first launch into Terminal remains the primary CTA
- home performance fixes should preserve the existing layout and copy while reducing browser rendering cost
- reduced-motion environments should skip the animated WebGL layer
- browser engine alone should not force a visibly different home background profile on desktop-class machines
- the lower-cost tier should prefer memory savings over visibly choppier motion
- Safari motion parity now takes precedence over aggressive visual downgrades; keep the effect near-original and save memory mostly through buffer format and texture sizing
- visual parity is more sensitive to trail precision than to moderate buffer-size reductions; preserve float trail buffers when available and save memory through scale, canvas DPR, and texture limits first
- home pointer/parallax easing should be time-based instead of frame-based so motion quality remains stable when Safari delivers different frame cadence
- `lite` quality should be reserved for actual lower-resource heuristics such as reduced motion or low-memory devices, not Safari UA alone
- critical hero copy should not depend on post-mount reveal timing; initial paint parity matters more than entry animation polish
- WebGL workload should adapt to observed frame time so slower engines can recover smoothness without a hard browser-specific fork
- when desktop browsers still diverge on smoothness, prefer slightly lighter shared defaults over another Safari-specific branch so motion parity improves without splitting the look
- trail buffer resizing must clear ping-pong state because resizing during active rendering can surface rectangular seams in the center field
- shader cost should be reduced surgically in the paint/grow passes before lowering visual quality further
- hero text readability glows must not be clipped by the hero panel box because clipped blur creates a visible rectangular tone boundary

## Next Steps

- visually compare Safari and Chrome after refresh, focusing on hero text glow seams and pointer trail smoothness

## Exit Criteria

- `/` reads clearly at a glance and routes users to Terminal, Lab, or Dashboard without clutter
- the home page uses the same broad surface language as `/lab`
- Safari home visits keep the background effect without center-field buffer seams
- `npm --prefix app run check` passes after the refactor

## Handoff Checklist

- active work item remains `W-0020-home-surface-refactor`
- home layout/copy unchanged; only animation/runtime behavior adjusted
- verify `app/src/routes/+page.svelte` and `app/src/components/home/WebGLAsciiBackground.svelte` together because gating spans both files
- `npm --prefix app run check` passed with 0 errors and 0 warnings after WebGL seam/smoothness changes
