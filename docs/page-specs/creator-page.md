# Creator Page

Route scope:
- `/creator/[userId]`

Purpose:
- Define the public creator drilldown route linked from community signal cards and signal detail pages.

## Primary User Job

- Inspect a creator's public profile, recent signals, and proof of activity before deciding whether to track, copy, or ignore that creator.

## Core Flow

1. Route loads the canonical creator record from `/api/creator/[userId]`.
2. Recent posts and conversion proof hydrate below the hero summary.
3. From this route, users can move back into `/signals` or hand off into `/terminal`.

## Guardrails

- Use canonical `userId` as the only route identifier.
- Do not synthesize public performance from local-only state.
- Any Terminal handoff must preserve the source creator context.

## Key UI Blocks

- creator summary hero
- public performance strip
- recent signals list
- terminal handoff CTA

## State Authority

- creator profile: `/api/creator/[userId]`
- recent signal list: creator-linked community records
- terminal handoff: query-based navigation into `/terminal`

## Read These First

- `docs/page-specs/signals-detail-page.md`
- `docs/product-specs/signals.md`
- `docs/API_CONTRACT.md`
