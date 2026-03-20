# Market Page

Legacy route:
- `/signals`

Route scope:
- `/signals`

Purpose:
- Define the current hybrid route: community feed, trending posts, AI leaderboard, and drilldown entry into post detail / creator profile.
- Treat this as the current implementation shell for the canonical `Market` surface.

## Primary User Job

- Browse community activity or AI/signal views and convert interesting context into tracking, proof inspection, or Terminal trade actions.

## Core Flow

1. Route reads `?view=` state, defaults to `feed`, and hydrates community posts on mount.
2. `feed` and `trending` render server-backed community posts with `SignalPostCard`.
3. `ai` renders the embedded `OracleLeaderboard`.
4. Feed cards open `/signals/[postId]` for detail and `/creator/[userId]` for author drilldown.
5. Track actions update tracked-signal state; copy-trade actions hand off into `/terminal` via query params.

## Guardrails

- Docs must be explicit that this route is currently three tabs: `feed`, `trending`, and `ai`.
- Feed and trending cards are server-backed community records, not local synthetic signals.
- Query-param view state must round-trip cleanly so shared links land in the expected tab.
- Community reactions and comments must not be mistaken for durable trade execution state.
- Public AI or listing language should stay evidence-backed even before full Market listing primitives exist.
- Terminal handoff must preserve pair, direction, levels, confidence, source, and reason.

## Key UI Blocks

- `ContextBanner`
- social header and tab switcher
- `SignalPostCard`
- `OracleLeaderboard` on the `ai` tab
- detail / creator drilldown links from community cards

## State Authority

- community posts and reactions: `communityStore` plus `/api/community/posts`
- tracked-signal projection: `trackedSignalStore`
- view selection and filters: route local plus URL query param
- copy-trade execution handoff: navigation into `/terminal` bootstrap params

## Supporting APIs And Data

- `/api/community/posts`
- `/api/community/posts/[id]`
- `/api/creator/[userId]`
- `buildAgentSignals`
- `/terminal?copyTrade=1&...`

## Failure States

- docs describe `/agents` as the oracle leaderboard even though the leaderboard is embedded here
- docs describe old `following` / `signals` tabs even though the current route only ships `feed`, `trending`, and `ai`
- signal-to-terminal handoff loses source or level data
- social feed appears durable in the same way as execution state without clear distinction
- query-param view state and rendered tab drift apart

## Read These First

- `docs/product-specs/signals.md`
- `docs/design-docs/unified-product-model.md`
- `docs/page-specs/signals-detail-page.md`
- `docs/page-specs/creator-page.md`
- `docs/references/active/community-chart-signal-copytrade-flow-2026-03-06.md`
- `docs/API_CONTRACT.md`
- `docs/generated/store-authority-map.md`

## Applied Source Inputs

- `2026-03-01__STOCKCLAW_PRD_A01.md`
- `docs/references/active/community-chart-signal-copytrade-flow-2026-03-06.md`
