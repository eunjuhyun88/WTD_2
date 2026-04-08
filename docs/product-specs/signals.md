# Signals / Community Product Spec

Legacy file path:
- `docs/product-specs/signals.md`

Purpose:
- Short product spec for the secondary public/community route that remains outside the main builder loop.

## Primary User Job

Browse public signal and community context that may later feed into the core agent loop.

## Surface Role In The Final IA

`/signals` is no longer a primary top-level surface in the official IA.

It remains a secondary public/community route while the core product centers on:
- `Home`
- `Onboard`
- `Dashboard`
- `Terminal`
- `Lab`
- `Battle`
- `Agent`

## Current Route Shape

- `/signals` is currently a hybrid route with `feed`, `trending`, and `ai` tabs.
- Community-post views are server-backed social records, not local synthetic signal cards.
- Feed cards now drill into `/signals/[postId]` for detail and `/creator/[userId]` for public author context.
- The oracle leaderboard currently lives on `/signals?view=ai`, not on `/agents`.
- The legacy `/oracle` route is now only a redirect shim into `/signals?view=ai`.
- Copy-trade handoff currently jumps back into `/terminal` through query params.
- Use `docs/page-specs/signals-page.md` for the actual route contract; keep this file focused on surface intent.

## Core Flows

1. Browse or filter signals.
2. Open one signal or public agent context in detail and inspect its evidence/comments.
3. Inspect a creator's public context from the community surface.
4. Track, react, or convert a signal into a trade/action path.

## Product Constraints

- Durable tracking and trade effects should have clear server authority even though the current route still mixes server-backed and client-derived signal views.
- The user must be able to distinguish community discovery from the core game loop.
- Community reactions should not redefine durable state authority.
- Public creator context should stay separate from authenticated Passport identity.

## Supporting Docs

- `docs/design-docs/cogochi-uiux-architecture.md`
- `docs/design-docs/unified-product-model.md`
- `docs/product-specs/agents.md`
- `docs/references/active/community-chart-signal-copytrade-flow-2026-03-06.md`
- `docs/API_CONTRACT.md`
- `docs/INTERACTION_CALL_MAP.md`
- `docs/page-specs/signals-detail-page.md`
- `docs/page-specs/creator-page.md`
