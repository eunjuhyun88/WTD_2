# Phase D-9 — AI refinement

> Parent: `work/active/W-0374-cogochi-bloomberg-ux-restructure.md`
> Status: 🟡 IN PROGRESS — 2026-05-01

## Scope (2d)

Polish the AI Search + AI overlay experience introduced in D-5 ~ D-7:

1. **AI Search history** — recent-50 queries persisted to localStorage, surfaced
   as ⌘L recent suggestions.
2. **Pattern recall UX** — loading skeleton + empty state for pattern tab.
3. **Decision auto-refresh** — switching to Decision tab re-runs analyze if
   the last result is stale (> 90s) or for a different symbol.
4. **AI overlay range** — `aiQueryRouter` understands "X~Y zone" / "X-Y range"
   and dispatches `AIRangeBox` via `setAIOverlayShapes`.

## Deliverables

- `app/src/lib/cogochi/aiSearchHistory.ts` — pure store with `push/clear/recent`.
- `app/src/lib/cogochi/aiSearchHistory.test.ts` — unit tests.
- `app/src/lib/cogochi/aiQueryRouter.ts` — add `'range'` action, helper
  `extractRange`.
- `app/src/lib/cogochi/aiQueryRouter.test.ts` — range tests.
- `app/src/lib/cogochi/AIAgentPanel.svelte` —
  - integrate history (suggestions chip strip)
  - pattern loading skeleton + empty state
  - auto-refresh effect on decision tab activation
  - dispatch `range` action via `runRange`

## Acceptance Criteria

- AC-D9-1 history.push limits to 50, deduplicates consecutive entries.
- AC-D9-2 history.recent(n) returns latest n queries (most-recent first).
- AC-D9-3 SSR-safe (no `window` access at module load).
- AC-D9-4 AIAgentPanel shows up to 4 recent queries below search input.
- AC-D9-5 Pattern tab renders skeleton when patternLoading=true.
- AC-D9-6 Pattern tab renders empty state when patternRecords=[] after load.
- AC-D9-7 routeAIQuery("BTC 95000~96000 zone") → range action.
- AC-D9-8 Decision auto-refresh triggers on tab activation if last analyze
  is older than 90 seconds OR symbol differs from current.
- AC-D9-9 svelte-check error count unchanged from D-8 baseline (13).
- AC-D9-10 vitest suite passes (442 + new tests).

## Out-of-scope

- Supabase persistence (localStorage only this phase).
- AI annotation/arrow shape routing (overlay range covers AC19 partially).
- Mode-aware history scoping (per-symbol vs global) → OQ-9.
