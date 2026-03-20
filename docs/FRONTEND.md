# FRONTEND

Purpose:
- Canonical frontend architecture map for routes, state authority, and layering.
- Read before touching route shells, stores, or shared UI contracts.

## Route Surfaces

| Surface | Role | Primary concerns | Deep docs |
| --- | --- | --- | --- |
| Home | entry and positioning | narrative clarity, navigation, onboarding | `docs/product-specs/index.md` |
| Terminal | intel and action | scan orchestration, feed clarity, responsive layouts | `docs/product-specs/terminal.md` |
| Arena | structured decision loop | phase clarity, chart legibility, outcome recording | `docs/product-specs/arena.md` |
| Signals | discover and track | signal authority, action conversion | `docs/product-specs/signals.md` |
| Passport | profile and progression | server-derived identity, learning history | `docs/product-specs/passport.md` |

## State Authority

| Domain | Canonical owner | Notes |
| --- | --- | --- |
| Live prices | `priceStore` | Do not mirror market truth into unrelated stores. |
| Arena route/session flow | `gameState` and route-local state | Transient only. |
| Profile and badges | server + `userProfileStore` projection | Client may cache; it does not define truth. |
| Quick trades | server + `quickTradeStore` | Optimistic entries must reconcile to server-issued truth. |
| Tracked signals | server + `trackedSignalStore` | Local persistence is fallback only. |
| Scan/intel results | server APIs + local view state | Separate fetch/orchestration from presentation. |

## Layering Rules

1. Route file owns entry/exit and high-level composition.
2. View-model or orchestration modules own derived UI state and decision glue.
3. Presentation components own rendering and user events only.
4. Shared utilities should centralize invariants, not duplicate behavior.
5. Server contracts must be validated at the boundary.

## Current Hot Files

- `src/routes/terminal/+page.svelte`
- `src/components/terminal/IntelPanel.svelte`
- `src/routes/arena/+page.svelte`
- `src/components/arena/ChartPanel.svelte`
- `src/routes/passport/+page.svelte`

When editing these, update the relevant canonical doc if authority or behavior changed.

## Source Docs

- `docs/FE_STATE_MAP.md`
- `docs/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`
- `docs/terminal-refactor-master-plan-2026-03-06.md`
- `docs/terminal-uiux-refactor-design-v3-2026-03-06.md`
- `docs/generated/route-map.md`
- `docs/generated/store-authority-map.md`
- `docs/generated/api-group-map.md`
