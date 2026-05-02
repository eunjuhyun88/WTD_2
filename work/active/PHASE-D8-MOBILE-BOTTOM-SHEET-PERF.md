# Phase D-8 — Mobile bottom-sheet + perf tuning

> Parent: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md`
> Status: 🟡 IN PROGRESS — 2026-05-01

## Scope (1.5d)

Replace the legacy `AIPanel` mobile fallback with a Bloomberg-style bottom
sheet that exposes the same 5-tab AI Agent surface introduced in D-7
(Decision / Pattern / Verdict / Research / Judge), and apply targeted
perf hygiene (CSS containment, throttled crosshair) to keep INP ≤ 200ms.

## Deliverables

1. `BottomSheet.svelte` — generalized bottom-up sheet (mirror of `DrawerSlide`).
2. `MobileAgentSheet.svelte` — 5-tab AI agent sheet for `MOBILE` viewport.
3. `AppShell.svelte` mobile branch wires `MobileAgentSheet` (replaces `AIPanel`).
4. CSS containment (`contain: layout paint;`) on heavy panels (chart canvas,
   right panel, sheet body) to bound paint scope.
5. Unit tests for any pure helper introduced.

## Acceptance Criteria

- AC-D8-1 BottomSheet opens via prop, closes on Esc / backdrop / ✕.
- AC-D8-2 MobileAgentSheet exposes 5 tabs (Decision/Pattern/Verdict/Research/Judge).
- AC-D8-3 Active mobile tab persists into shellStore (`rightPanelTab`).
- AC-D8-4 AI Search input present in sheet, runs `routeAIQuery` on Enter.
- AC-D8-5 Mobile sheet uses `viewportTier === 'MOBILE'` only.
- AC-D8-6 No regression in vitest suite (442 tests still pass).
- AC-D8-7 svelte-check error count unchanged from D-7 baseline (13).

## Out-of-scope

- Chart pane swipe (sub-pane navigation) — deferred to D-10 polish.
- Drawing toolbar mobile horizontal strip — deferred (touch precision OQ-5).
- LCP/INP measurement infra — deferred to D-10.
