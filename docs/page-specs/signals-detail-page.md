# Signal Detail Page

Route scope:
- `/signals/[postId]`

Purpose:
- Define the current single-post route for a server-backed community signal, full evidence, reaction state, comments, and trade handoff.

## Primary User Job

- Inspect one community signal in depth, evaluate its evidence, react or comment, and convert it into tracking or a Terminal copy-trade handoff.

## Core Flow

1. Route loads one post through `/api/community/posts/[id]`.
2. The author header links into `/creator/[userId]` when the record has an owner.
3. Signal attachment and evidence render in expanded form instead of feed-card preview form.
4. Reaction toggles call `communityStore.toggleReaction(...)`, then the route refetches the canonical post record.
5. Comment CRUD goes through `/api/community/posts/[id]/comments` and updates the local comment count mirror.
6. Track actions issue durable tracked-signal mutations; copy-trade actions hand off into `/terminal` via query params.

## Guardrails

- This route is a detail view over server-backed community state, not a local synthetic card surface.
- Comment count shown in the route header must stay aligned with the comments API response.
- Author drilldown must only use canonical `userId`; do not infer creator identity from display text.
- Terminal handoff must preserve pair, direction, entry, TP, SL, confidence, and reason.

## Key UI Blocks

- sticky back-nav
- author header with creator drilldown
- expanded signal attachment block
- full evidence list
- reaction / comment / track / copy-trade action bar
- `CommentSection`

## State Authority

- post detail: route-local loader backed by `/api/community/posts/[id]`
- likes and optimistic reaction flip: `communityStore`
- comments: `/api/community/posts/[id]/comments`
- tracked-signal mutation: `trackedSignalStore`
- notification side effect: `notificationEvents`
- copy-trade execution handoff: navigation into `/terminal?copyTrade=1&...`

## Supporting APIs And Data

- `/api/community/posts/[id]`
- `/api/community/posts/[id]/comments`
- `/api/community/posts/[id]/comments/[commentId]`
- `/api/creator/[userId]`
- `/terminal?copyTrade=1&...`

## Failure States

- detail route renders stale like/comment counts after reaction or comment mutation
- creator drilldown uses author label instead of canonical `userId`
- copy-trade handoff drops levels or reason from the original attachment
- comment CRUD silently diverges from `community_posts.comment_count`

## Read These First

- `docs/product-specs/signals.md`
- `docs/page-specs/signals-page.md`
- `docs/API_CONTRACT.md`
- `docs/references/active/community-chart-signal-copytrade-flow-2026-03-06.md`

