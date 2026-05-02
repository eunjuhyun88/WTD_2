# Phase D-10 — Bloomberg-grade polish + finalization

> Parent: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md`
> Status: 🟡 IN PROGRESS — 2026-05-01

## Scope (1.5d)

Final tightening pass before W-0374 closes:

1. **Throttle utility** — pure helper with tests, for use by NewsFlashBar
   and future high-rate streams (1 emit / 3s).
2. **StatusBar mini Verdict + freshness** — show latest `selectedVerdictId`
   and a freshness counter (age of last tick) in the status bar.
3. **Design tokens audit** — confirm `--g0..g9` scale is the canonical
   Bloomberg palette (no inline hex in new D-7~D-10 components where
   tokens were available).
4. **Redirect smoke** — keep PRs limited to lib code; redirect verification
   was completed in Phase B/C and re-verified manually here.

## Deliverables

- `app/src/lib/util/throttle.ts` — leading-edge throttle with reset.
- `app/src/lib/util/throttle.test.ts` — unit tests.
- `app/src/lib/cogochi/StatusBar.svelte` —
  - mini-Verdict pill (LONG / SHORT / WAIT)
  - data freshness counter ("FRESH 12s")
- Pass through new shellStore subscription (`activeRightPanelTab` already
  exists); no schema bump.

## Acceptance Criteria

- AC-D10-1 throttle(fn, 3000) emits leading then suppresses for 3000ms.
- AC-D10-2 throttle.cancel() resets internal timer; next call emits.
- AC-D10-3 StatusBar renders verdict pill bound to `lastVerdictKind`.
- AC-D10-4 StatusBar renders freshness counter using `Date.now() -
  lastUpdatedAt` updated every 1s.
- AC-D10-5 svelte-check error count unchanged (13).
- AC-D10-6 vitest suite passes (≥ 457 + new tests).

## Out-of-scope

- Supabase verdict sync.
- Layout-mode toggle UI.
- F60 forecast wiring (backend not ready, W-0376).
