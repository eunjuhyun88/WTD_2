# Battle Page

Route scope:
- `/battle`

Purpose:
- Define the standalone battle-proof route with ready, live-play, and result states.

## Primary User Job

- Use a limited number of daily battles to prove trading judgment on historical charts and leave with a result worth reflecting on.

## Core Flow

1. Ready screen shows battle format, selected symbol, and remaining daily quota.
2. Starting a battle loads historical candles and enters active play.
3. User alternates between `Next Bar`, order actions, and AI-advisor interpretation.
4. Three rounds resolve through either simple or advanced order entry.
5. Result screen reveals dates, PnL, memory card, reflection field, and return actions.

## Guardrails

- Daily limits must stay visible before the user enters play.
- The route should keep chart legibility primary even in advanced mode.
- AI advice must remain supplemental; it should not obscure the user's own action path.
- Result actions should route back into `Lab` or another battle cleanly.

## Key UI Blocks

- ready card with symbol selector and start CTA
- loading state
- battle chart and round HUD
- simple / advanced order controls
- AI advisor panel
- status bar with PnL, trades, round, and timer
- result card with dates, trade history, memory card, and reflection

## State Authority

- battle runtime, rounds, positions, trades, and result: `battleStore`
- today battle count and quota projection: `matchHistoryStore` plus `battleStore`
- reflection field and mode toggle: route local

## Supporting APIs And Data

- `$lib/stores/battleStore`
- `$lib/stores/matchHistoryStore`
- `src/routes/battle/+page.svelte`

## Failure States

- the route hides daily quota state until after battle starts
- symbol selection and loaded chart drift apart
- result screen omits the historical reveal or next-action choices
- docs describe `/battle` as the old `/arena` shell instead of the standalone proof route

## Read These First

- `docs/product-specs/arena.md`
- `docs/page-specs/lab-page.md`
- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/arena-domain-model.md`
