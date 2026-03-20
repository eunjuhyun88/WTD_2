# Passport Page

Route scope:
- `/passport`

Purpose:
- Define the current tabbed Passport route: wallet, positions, profile, and arena-learning operations in one surface.

## Primary User Job

- Inspect live or fallback holdings, open/closed positions, profile progress, and arena-learning status from one route.

## Core Flow

1. Hydrate profile, wallet, holdings, agent stats, match history, and saved UI state.
2. Default low-data users toward the `wallet` tab and clearly show whether holdings are `live` or `fallback`.
3. Let the user edit avatar/name, connect wallet, or manually re-sync holdings.
4. Route work is split across four tabs: `wallet`, `positions`, `profile`, and `arena`.
5. `arena` tab exposes learning-pipeline refresh, worker run, retrain queue, and report generation actions.

## Guardrails

- Live holdings and fallback demo holdings must be clearly distinguished.
- Wallet disconnect must clear stale live holdings from the previous session.
- Editable profile fields should resolve into store actions, not linger as unsaved local drafts.
- Learning actions must report refresh/running/error state so the page does not look silently stale.

## Key UI Blocks

- unified passport header with avatar, name, tier, portfolio value, and wallet stamp
- tab bar and quick-action rail
- wallet holdings and sync-status panels
- positions, tracked-signals, and recent-closed-trade panels
- profile metrics and badges
- arena stats plus learning-pipeline reports, datasets, evals, and train jobs

## State Authority

- profile summary, badges, and headline metrics: `userProfileStore` projections
- wallet connection state: `walletStore`
- holdings: `fetchHoldings()` when available, otherwise `HOLDINGS_DATA` with live-price overlay
- tab state and related UI preferences: route local plus preferences API persistence
- learning pipeline data and actions: `/api/profile/passport/learning/*`

## Supporting APIs And Data

- `/api/profile`
- `/api/profile/passport`
- `/api/progression`
- `/api/portfolio/holdings`
- `/api/preferences/*`
- `/api/profile/passport/learning/*`

## Failure States

- page shows stale live holdings after wallet switch or disconnect
- fallback holdings are rendered without telling the user they are demo data
- learning actions run but the status/report sections do not refresh clearly
- docs over-focus on identity and hide that wallet/positions are first-class route concerns

## Read These First

- `docs/product-specs/passport.md`
- `docs/references/active/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md`
- `docs/design-docs/learning-loop.md`
- `docs/API_CONTRACT.md`

## Applied Source Inputs

- `2026-02-20__STOCKCLAW_PassportUX_v1.docx`
- `2026-02-20__STOCKCLAW_UserJourney_Lifecycle_v1.docx`
- `docs/references/active/PASSPORT_BACKEND_ARCHITECTURE_v1_2026-02-25.md`
