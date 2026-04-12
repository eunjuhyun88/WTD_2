# FILE_CLASSIFICATION.md -- src/ Directory Classification

Last updated: 2026-04-12

Classifies every file in `src/` across 4 axes for the Cogochi day-1 cleanup plan.

## Classification Axes

| Axis | Values |
|---|---|
| **surface** | terminal, lab, dashboard, home, global-shell, settings, legacy-surface, server-only, shared-infra |
| **layer** | ui-page, ui-component, chart-render, client-state, client-glue, api-route, server-orch, provider, domain-engine, research, shared-type, asset |
| **ownership** | keep, keep-refactor, server-keep, WTD-candidate, legacy-park, legacy-delete |
| **action** | keep, keep-refactor, split, redirect, unlink, archive, delete |

---

## 1. Root Files

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `app.d.ts` | shared-infra | shared-type | keep | keep | -- | SvelteKit type declarations |
| `app.css` | shared-infra | asset | keep | keep | -- | Global styles |

---

## 2. Routes -- Pages

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `routes/+layout.svelte` | global-shell | ui-page | keep-refactor | keep-refactor | 2 | Imports gameState (HD-1) |
| `routes/+page.svelte` | home | ui-page | keep-refactor | keep-refactor | 2 | Home landing |
| `routes/terminal/+page.svelte` | terminal | ui-page | keep | keep | -- | Primary surface |
| `routes/lab/+page.svelte` | lab | ui-page | keep | keep | -- | AutoResearch |
| `routes/dashboard/+page.svelte` | dashboard | ui-page | keep | keep | -- | Optional analytics |
| `routes/settings/+page.svelte` | settings | ui-page | keep-refactor | keep-refactor | 2 | Imports gameState (HD-4) |
| `routes/holdings/+page.svelte` | settings | ui-page | keep | keep | -- | Portfolio holdings |
| `routes/passport/+page.svelte` | legacy-surface | ui-page | legacy-park | unlink | 5 | Deferred surface |
| `routes/passport/wallet/[chain]/[address]/+page.svelte` | legacy-surface | ui-page | legacy-park | unlink | 5 | Deferred surface |
| `routes/passport/wallet/[chain]/[address]/+page.ts` | legacy-surface | ui-page | legacy-park | unlink | 5 | Deferred surface |
| `routes/cogochi/+layout.svelte` | legacy-surface | ui-page | legacy-park | unlink | 5 | Old cogochi shell |
| `routes/cogochi/+layout.ts` | legacy-surface | ui-page | legacy-park | unlink | 5 | Old cogochi shell |
| `routes/cogochi/+page.svelte` | legacy-surface | ui-page | legacy-park | unlink | 5 | Old cogochi page |
| `routes/cogochi/scanner/+page.svelte` | legacy-surface | ui-page | legacy-park | unlink | 5 | Old scanner UI |
| `routes/cogochi/scanner/+page.ts` | legacy-surface | ui-page | legacy-park | unlink | 5 | Old scanner route |
| `routes/scanner/+page.ts` | legacy-surface | ui-page | legacy-park | redirect | 6 | Redirect to /terminal |
| `routes/agent/+page.svelte` | legacy-surface | ui-page | legacy-park | redirect | 6 | Redirect to /lab |
| `routes/agent/[id]/+page.svelte` | legacy-surface | ui-page | legacy-park | redirect | 6 | Redirect to /lab |
| `routes/agents/+page.svelte` | legacy-surface | ui-page | legacy-park | redirect | 6 | Redirect to /lab |
| `routes/arena/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Arena v1 |
| `routes/arena-v2/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Arena v2 |
| `routes/arena-v2/+page.server.ts` | legacy-surface | ui-page | legacy-delete | archive | 3 | Arena v2 SSR |
| `routes/arena-war/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Arena war |
| `routes/battle/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Battle page |
| `routes/world/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | World map |
| `routes/oracle/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Oracle page |
| `routes/live/+page.ts` | legacy-surface | ui-page | legacy-delete | archive | 3 | Live feed |
| `routes/signals/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Signals feed |
| `routes/signals/[postId]/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Signal detail |
| `routes/create/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Create page |
| `routes/onboard/+page.svelte` | legacy-surface | ui-page | legacy-delete | archive | 3 | Onboarding |
| `routes/terminal-legacy/+page.svelte` | legacy-surface | ui-page | legacy-delete | delete | 3 | Dead terminal |
| `routes/creator/[userId]/+page.svelte` | legacy-surface | ui-page | legacy-delete | delete | 3 | Dead creator |

---

## 3. Routes -- API

### 3.1 Active API Routes (keep)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `api/terminal/compare/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/intel-agent-shadow/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/intel-agent-shadow/execute/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/intel-policy/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/opportunity-scan/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/scan/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/scan/[id]/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/scan/[id]/signals/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/terminal/scan/history/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/lab/autorun/+server.ts` | lab | api-route | server-keep | keep | -- | |
| `api/lab/forward-walk/+server.ts` | lab | api-route | server-keep | keep | -- | |
| `api/wizard/+server.ts` | terminal | api-route | server-keep | keep | -- | Block search wizard |
| `api/auth/login/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/auth/logout/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/auth/nonce/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/auth/register/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/auth/session/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/auth/verify-wallet/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/auth/wallet/+server.ts` | global-shell | api-route | server-keep | keep | -- | |
| `api/market/snapshot/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/trending/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/news/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/flow/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/events/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/alerts/onchain/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/derivatives/[pair]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/ads/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/community-takeovers/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/orders/[chainId]/[tokenAddress]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/pairs/[chainId]/[pairId]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/search/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/token-boosts/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/token-pairs/[chainId]/[tokenAddress]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/token-profiles/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/market/dex/tokens/[chainId]/[tokenAddresses]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/coinalyze/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/coingecko/global/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/etherscan/onchain/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/feargreed/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/macro/fred/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/macro/indicators/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/yahoo/[symbol]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/senti/social/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/onchain/cryptoquant/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/cycles/klines/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/cogochi/analyze/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/cogochi/terminal/message/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/cogochi/thermometer/+server.ts` | terminal | api-route | server-keep | keep | -- | |
| `api/gmx/balance/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/gmx/close/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/gmx/confirm/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/gmx/markets/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/gmx/positions/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/gmx/prepare/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/polymarket/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/polymarket/[id]/close/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/polymarket/auth/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/polymarket/prepare/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/polymarket/status/[id]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/polymarket/submit/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/positions/unified/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/quick-trades/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/quick-trades/[id]/close/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/quick-trades/open/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/quick-trades/prices/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/polymarket/markets/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/polymarket/orderbook/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/pnl/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/pnl/summary/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/portfolio/holdings/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/exchange/analysis/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/exchange/connect/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/exchange/import/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/signals/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/signals/[id]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/signals/[id]/convert/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/signals/track/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/signal-actions/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/predictions/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/predictions/positions/[id]/close/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/predictions/positions/open/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/predictions/vote/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/datasets/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/evals/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/reports/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/reports/generate/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/status/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/train-jobs/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/profile/passport/learning/workers/run/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/preferences/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/notifications/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/notifications/[id]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/notifications/read/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/progression/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/ui-state/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/memory/[agentId]/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/doctrine/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/activity/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/activity/reaction/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/wallet/intel/+server.ts` | server-only | api-route | server-keep | keep | -- | |
| `api/chat/messages/+server.ts` | server-only | api-route | server-keep | keep | -- | |

### 3.2 Legacy API Routes (archive)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `api/arena/analyze/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena/draft/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena/hypothesis/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena/match/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena/match/[id]/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena/match/[id]/warroom/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena/resolve/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena-war/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/arena-war/rag/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/battle/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/battle/tick/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/agents/stats/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/agents/stats/[agentId]/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/matches/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/tournaments/active/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/tournaments/[id]/bracket/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/tournaments/[id]/register/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/cogochi/battle/start/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/cogochi/battle/scenarios/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/cogochi/battle/[battleId]/action/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/cogochi/battle/[battleId]/stream/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |
| `api/cogochi/skills/catalog/+server.ts` | legacy-surface | api-route | legacy-delete | archive | 4 | |

### 3.3 Legacy API Routes (unlink)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `api/cogochi/chat/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/cogochi/scan/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/copy-trades/publish/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/copy-trades/runs/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/copy-trades/runs/[id]/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/community/posts/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/community/posts/[id]/react/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/marketplace/list/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/marketplace/publish/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |
| `api/marketplace/subscribe/+server.ts` | legacy-surface | api-route | legacy-park | unlink | 5 | |

---

## 4. Components

### 4.1 Active Components (keep)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `components/terminal/BottomPanel.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/DirectionBadge.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/GmxTradePanel.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/IntelPanel.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/PolymarketBetPanel.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/StrategyCard.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/VerdictBanner.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/VerdictCard.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/WarRoom.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/intelHelpers.ts` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/terminalHelpers.ts` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/terminalLayoutController.ts` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/research/DualPaneFlowChartBlock.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/research/HeatmapFlowChartBlock.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/research/InlinePriceChartBlock.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/research/MetricStripBlock.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/research/ResearchBlockRenderer.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/warroom/WarRoomFooterSection.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/warroom/WarRoomHeaderSection.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/warroom/WarRoomSignalFeed.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/warroom/types.ts` | terminal | ui-component | keep | keep | -- | |
| `components/terminal/warroom/warroom.css` | terminal | asset | keep | keep | -- | |
| `components/wallet-intel/WalletActionPlanCard.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletBehaviorCards.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletClusterView.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletEvidenceRail.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletFlowMap.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletIdentityCard.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletIntelShell.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletMarketOverlay.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletSummaryPanel.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/wallet-intel/WalletTokenBubbleGraph.svelte` | terminal | ui-component | keep | keep | -- | |
| `components/lab/CycleSelector.svelte` | lab | ui-component | keep | keep | -- | |
| `components/lab/LabChart.svelte` | lab | ui-component | keep | keep | -- | |
| `components/lab/LabToolbar.svelte` | lab | ui-component | keep | keep | -- | |
| `components/lab/PositionBar.svelte` | lab | ui-component | keep | keep | -- | |
| `components/lab/ResultPanel.svelte` | lab | ui-component | keep | keep | -- | |
| `components/lab/StrategyBuilder.svelte` | lab | ui-component | keep | keep | -- | |
| `components/home/HomeBackground.svelte` | home | ui-component | keep | keep | -- | |
| `components/home/HomeFinalCta.svelte` | home | ui-component | keep | keep | -- | |
| `components/home/HomeHero.svelte` | home | ui-component | keep | keep | -- | |
| `components/home/HomeLearningLoop.svelte` | home | ui-component | keep | keep | -- | |
| `components/home/HomeSurfaceCards.svelte` | home | ui-component | keep | keep | -- | |
| `components/home/WebGLAsciiBackground.svelte` | home | ui-component | keep | keep | -- | |
| `components/home/homeData.ts` | home | ui-component | keep | keep | -- | |
| `components/layout/BottomBar.svelte` | global-shell | ui-component | keep | keep | -- | |
| `components/layout/Header.svelte` | global-shell | ui-component | keep | keep | -- | |
| `components/layout/MobileBottomNav.svelte` | global-shell | ui-component | keep | keep | -- | |
| `components/modals/WalletModal.svelte` | global-shell | ui-component | keep | keep | -- | |
| `components/modals/SettingsModal.svelte` | global-shell | ui-component | keep | keep | -- | |
| `components/modals/PassportModal.svelte` | global-shell | ui-component | keep | keep | -- | |
| `components/shared/ActivityFeedItem.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5: verify after Batch 4 |
| `components/shared/ContextBanner.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/DeltaCard.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/EmptyState.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/EvolutionTimeline.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/HPBar.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5: may be arena-only |
| `components/shared/InlineActionButton.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/MoodBadge.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5: may be arena-only |
| `components/shared/NotificationTray.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/P0Banner.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/PartyTray.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/PhaseTransition.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/PokemonFrame.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/StreakCounter.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/ToastStack.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/TokenDropdown.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |
| `components/shared/TypewriterBox.svelte` | shared-infra | ui-component | keep | keep | 9 | HD-5 |

### 4.2 Legacy Components (archive)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `components/arena/ArenaEventCard.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/ArenaHUD.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/ArenaRewardModal.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/BattleStage.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/ChartPanel.svelte` | legacy-surface | chart-render | legacy-delete | archive | 4 | |
| `components/arena/ChartTheme.ts` | legacy-surface | chart-render | legacy-delete | archive | 4 | |
| `components/arena/HypothesisPanel.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/Lobby.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/MVPVote.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/MatchHistory.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/PhaseGuide.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/ResultPanel.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/SpeechBubble.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/SquadConfig.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/ViewPicker.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/WarRoomPanel.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/arenaState.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `components/arena/chart/chartDrawingEngine.ts` | legacy-surface | chart-render | legacy-delete | archive | 4 | HD-6: eval reusability |
| `components/arena/chart/chartDrawingSession.ts` | legacy-surface | chart-render | legacy-delete | archive | 4 | |
| `components/arena/chart/chartOverlayRenderer.ts` | legacy-surface | chart-render | legacy-delete | archive | 4 | |
| `components/arena/chart/chartPositionInteraction.ts` | legacy-surface | chart-render | legacy-delete | archive | 4 | |
| `components/arena/chart/chartRuntimeBindings.ts` | legacy-surface | chart-render | legacy-delete | archive | 4 | |
| `components/arena/views/AgentArenaView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/views/CardDuelView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/views/ChartWarView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena/views/MissionControlView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/AnalysisScreen.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/BattleCardView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/BattleChartView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/BattleMissionView.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/BattleScreen.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/DraftScreen.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/HypothesisScreen.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/ResultScreen.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-v2/shared/PhaseBar.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/ActionFeed.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/AgentSprite.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/AnalyzePhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/BattleCanvas.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/BattleEffects.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/BattlePhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/BattleVisualizer.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/ChallengeOverlay.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/DraftPhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/HumanCallPhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/JudgePhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/ResultPhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/RevealPhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/SetupPhase.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/arena-war/VSMeterBar.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/battle/AIAdvisor.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/battle/BattleChart.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/battle/OrderPanel.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/battle/PositionCard.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/agent/AgentCard.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/agent/DoctrineEditor.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/agent/MemoryCard.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/community/OracleLeaderboard.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/live/LivePanel.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/modals/CopyTradeModal.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |
| `components/modals/OracleModal.svelte` | legacy-surface | ui-component | legacy-delete | archive | 4 | |

### 4.3 Legacy Components (unlink)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `components/cogochi/AlphaMarketBar.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/ArtifactPanel.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/CgChart.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/CgLayerPanel.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/DataCard.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/DeepDivePanel.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/DouniChat.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/MarketThermometer.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/QuickPanel.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/cogochi/ScannerPanel.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/passportHelpers.ts` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/wallet/WalletAlertHistory.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/wallet/WalletClusterTimeline.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/wallet/WalletDossierHeader.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/wallet/WalletEvidenceSnapshots.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/wallet/WalletRelatedEntities.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |
| `components/passport/wallet/WalletThesisHistory.svelte` | legacy-surface | ui-component | legacy-park | unlink | 5 | |

---

## 5. Lib

### 5.1 Contracts

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/contracts/challenge.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/events.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/features.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/ids.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/index.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/registry.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/researchView.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/trajectory.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/contracts/verdict.ts` | shared-infra | shared-type | keep | keep | -- | |

### 5.2 Utils / Data / Navigation / Layout / Home / Audio / Cogochi / Assets / Styles

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/index.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/utils/deepLinks.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/utils/errorUtils.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/utils/price.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/utils/storage.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/utils/time.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/utils/timeframe.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/data/agents.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/data/cycles.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/data/holdings.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/data/mainCastAssets.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/data/tokens.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/data/warroom.ts` | shared-infra | shared-type | keep | keep | -- | |
| `lib/navigation/appSurfaces.ts` | global-shell | ui-component | keep-refactor | keep-refactor | 2 | Surface registry |
| `lib/layout/globalPriceFeed.ts` | global-shell | client-glue | keep-refactor | keep-refactor | 2 | HD-1 |
| `lib/home/homeLanding.ts` | home | client-glue | keep | keep | -- | |
| `lib/cogochi/marketPulse.ts` | global-shell | client-glue | keep | keep | -- | |
| `lib/audio/sfx.ts` | shared-infra | asset | keep | keep | -- | |
| `lib/assets/favicon.svg` | shared-infra | asset | keep | keep | -- | |
| `lib/styles/arena-tone.css` | shared-infra | asset | keep | keep | -- | |
| `lib/styles/tokens.css` | shared-infra | asset | keep | keep | -- | |
| `lib/styles/tokens/primitive.css` | shared-infra | asset | keep | keep | -- | |

### 5.3 Stores

#### Active Stores (keep)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/stores/priceStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/strategyStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/walletStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/walletModalStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/authSessionStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/userProfileStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/dbStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/notificationStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/positionStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/pnlStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/quickTradeStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/predictStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/trackedSignalStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/doctrineStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/warRoomStore.ts` | terminal | client-state | keep | keep | -- | |
| `lib/stores/communityStore.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/hydration.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/storageKeys.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/remoteSessionGuard.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/alphaBuckets.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/progressionRules.ts` | shared-infra | client-state | keep | keep | -- | |
| `lib/stores/agentData.ts` | shared-infra | client-state | keep | keep | -- | |

#### Split Store

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/stores/gameState.ts` | global-shell | client-state | keep-refactor | split | 2 | HD-1: extract activePairStore |

#### Legacy Stores (archive)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/stores/battleStore.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `lib/stores/battleFeedStore.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `lib/stores/arenaV2State.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `lib/stores/arenaWarStore.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `lib/stores/activeGamesStore.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `lib/stores/matchHistoryStore.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |
| `lib/stores/copyTradeStore.ts` | legacy-surface | client-state | legacy-delete | archive | 4 | |

### 5.4 API Client Wrappers

#### Active API Wrappers (keep)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/api/auth.ts` | shared-infra | client-glue | keep | keep | -- | |
| `lib/api/binance.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/coinalyze.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/coincap.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/coingecko.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/cryptoquant.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/defillama.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/etherscan.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/feargreed.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/fred.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/gmxApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/lunarcrush.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/macroIndicators.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/notificationsApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/polymarket.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/portfolioApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/positionsApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/predictionsApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/preferencesApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/profileApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/terminalApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/tradingApi.ts` | server-only | client-glue | keep | keep | -- | |
| `lib/api/trending.ts` | server-only | client-glue | keep | keep | -- | |

#### Legacy API Wrappers (archive / unlink)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/api/arenaApi.ts` | legacy-surface | client-glue | legacy-delete | archive | 4 | |
| `lib/api/matchesApi.ts` | legacy-surface | client-glue | legacy-delete | archive | 4 | |
| `lib/api/agentStatsApi.ts` | legacy-surface | client-glue | legacy-delete | archive | 4 | |
| `lib/api/communityApi.ts` | legacy-surface | client-glue | legacy-park | unlink | 5 | |
| `lib/api/passportLearningApi.ts` | legacy-surface | client-glue | legacy-park | unlink | 5 | |

### 5.5 Engine

#### Active Engine (keep)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/engine/backtestEngine.ts` | lab | domain-engine | keep | keep | -- | |
| `lib/engine/factorEngine.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/indicators.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/trend.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/chartPatterns.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/patternDetector.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/opportunityScanner.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/exitOptimizer.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/constants.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/types.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/specs.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/fewShotBuilder.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/ragEmbedding.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/layerEngine.ts` | terminal | domain-engine | keep | keep | -- | HD-3 |
| `lib/engine/cogochi/layers/l1Wyckoff.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/layers/l3VSurge.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/layers/l13Breakout.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/layers/l14BbSqueeze.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/layers/l18Momentum.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/layers/l19OIAccel.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/types.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/verdictBuilder.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/thresholds.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/supportResistance.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/alphaScore.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/cogochi/hmac.ts` | terminal | domain-engine | keep | keep | -- | |
| `lib/engine/events/base.ts` | shared-infra | domain-engine | keep | keep | -- | FactorEventEmitter |

#### Split Engine

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/engine/cogochiTypes.ts` | shared-infra | shared-type | keep-refactor | split | 2 | HD-2: extract to contracts |

#### Legacy Engine (archive)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/engine/battleEngine.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/battleResolver.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/gameLoop.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/phases.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/scoring.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/teamSynergy.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/replay.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/mockArenaData.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/arenaWarTypes.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/agentCharacter.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/agentPipeline.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/agents.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/c02Pipeline.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/warroomScan.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v2BattleEngine.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v2BattleTypes.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v2RagBridge.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v3BattleEngine.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v3BattleTypes.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/battleStateMachine.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/types.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/debate.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/decide.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/observe.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/reason.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/reflect.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/resolve.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/v4/states/retrieve.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochiBattleFSM.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochiContextBuilder.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochiDoctrine.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochiGameEngine.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/gameRecordStore.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochi/douni/douniPersonality.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochi/douni/douniSprite.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |
| `lib/engine/cogochi/douni/douniState.ts` | legacy-surface | domain-engine | legacy-delete | archive | 7 | |

### 5.6 Server

#### Active Server (keep)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/server/db.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/llmService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/llmConfig.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/scanEngine.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/scanner.ts` | server-only | server-orch | server-keep | keep | -- | HD-3 |
| `lib/server/marketDataService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/marketFeedService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/marketSnapshotService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/ragService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/qdrantClient.ts` | server-only | server-orch | server-keep | keep | -- | HD-2 |
| `lib/server/intelPolicyRuntime.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/intelShadowAgent.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/walletIntelServer.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/warRoomService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/agentPersonaService.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/alertRules.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/apiValidation.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/authGuard.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/authRepository.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/authSecurity.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/distributedRateLimit.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/rateLimit.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/ipReputation.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/requestGuards.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/originGuard.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/session.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/turnstile.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/secretCrypto.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/walletAuthRepository.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/passportMlPipeline.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/passportOutbox.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/progressionUpdater.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/skillsRegistry.ts` | server-only | server-orch | server-keep | keep | -- | HD-2 |
| `lib/server/scenarioBuilder.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/multiTimeframeContext.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/ollamaClient.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/gmxV2.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/polymarketClob.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/exchange/binanceConnector.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/exchange/patternAnalyzer.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/journal/trajectoryWriter.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/memory/l0Context.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/memory/l1Recent.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/memory/l2Search.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/memory/memoryCardBuilder.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/onchain/trackRecordHash.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/orpo/contextContract.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/orpo/exportJsonl.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/orpo/pairBuilder.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/orpo/utilityScore.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/orpo/v2PairCollector.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/orpo/v2TriggerEvaluator.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/researchView/buildResearchBlocks.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/autoResearch/experimentRunner.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/autoResearch/forwardWalk.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/autoResearch/programParser.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/autoResearch/programTypes.ts` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/migrations/001_arena_war_records.sql` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/migrations/002_arena_war_rag.sql` | server-only | server-orch | server-keep | keep | -- | |
| `lib/server/migrations/003_decision_memory.sql` | server-only | server-orch | server-keep | keep | -- | |

#### Active Data Providers (keep -- legacy but still used)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/server/providers/binance.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/binanceQuota.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/cache.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/coinalyze.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/coingecko.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/dexscreener.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/index.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/rawSources.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/registry.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/sectorTable.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/providers/types.ts` | server-only | provider | server-keep | keep | -- | |
| `lib/server/coinmarketcap.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/coinmetrics.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/cryptoquant.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/defillama.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/dune.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/etherscan.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/feargreed.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/fred.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/geckoWhale.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/lunarcrush.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/santiment.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |
| `lib/server/yahooFinance.ts` | server-only | provider | server-keep | keep | -- | Legacy but active |

#### Legacy Server (archive)

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/server/battleStore.ts` | legacy-surface | server-orch | legacy-delete | archive | 8 | |
| `lib/server/arenaService.ts` | legacy-surface | server-orch | legacy-delete | archive | 8 | |
| `lib/server/tournamentService.ts` | legacy-surface | server-orch | legacy-delete | archive | 8 | |
| `lib/server/cogochiBattleService.ts` | legacy-surface | server-orch | legacy-delete | archive | 8 | |
| `lib/server/douni/toolExecutor.ts` | legacy-surface | domain-engine | legacy-delete | archive | 8 | |
| `lib/server/douni/tools.ts` | legacy-surface | domain-engine | legacy-delete | archive | 8 | |
| `lib/server/douni/types.ts` | legacy-surface | domain-engine | legacy-delete | archive | 8 | |

### 5.7 Other Lib Directories

| File | Surface | Layer | Ownership | Action | Batch | Notes |
|---|---|---|---|---|---|---|
| `lib/chart/chartCoordinates.ts` | lab | chart-render | keep | keep | -- | |
| `lib/chart/chartHelpers.ts` | lab | chart-render | keep | keep | -- | |
| `lib/chart/chartIndicators.ts` | lab | chart-render | keep | keep | -- | |
| `lib/chart/chartTradePlanner.ts` | lab | chart-render | keep | keep | -- | |
| `lib/chart/chartTypes.ts` | lab | chart-render | keep | keep | -- | |
| `lib/terminal/blockSearchParser.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/terminal/scanCardMapper.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/wallet-intel/walletIntelController.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/wallet-intel/walletIntelTypes.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/wallet/chainSwitch.ts` | shared-infra | client-glue | keep | keep | -- | |
| `lib/wallet/eip712Signing.ts` | shared-infra | client-glue | keep | keep | -- | |
| `lib/wallet/gmxTxSender.ts` | shared-infra | client-glue | keep | keep | -- | |
| `lib/wallet/providers.ts` | shared-infra | client-glue | keep | keep | -- | |
| `lib/wallet/simulatedWallet.ts` | shared-infra | client-glue | keep | keep | -- | |
| `lib/intel/decisionEngine.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/intel/decisionPolicy.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/intel/gateLogs.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/intel/helpfulnessEvaluator.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/intel/qualityGate.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/intel/thresholds.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/intel/types.ts` | server-only | domain-engine | keep | keep | -- | |
| `lib/research/index.ts` | server-only | research | keep | keep | -- | |
| `lib/research/schedule.ts` | server-only | research | keep | keep | -- | |
| `lib/research/stats.ts` | server-only | research | keep | keep | -- | |
| `lib/research/weightSweep.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/engineOnlyAgent.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/humanDecisionAgent.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/randomAgent.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/registry.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/ruleBasedAgent.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/ruleSetV1.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/types.ts` | server-only | research | keep | keep | -- | |
| `lib/research/baselines/zeroShotLLMAgent.ts` | server-only | research | keep | keep | -- | |
| `lib/research/evaluation/assertIntegrity.ts` | server-only | research | keep | keep | -- | |
| `lib/research/evaluation/regimeStrata.ts` | server-only | research | keep | keep | -- | |
| `lib/research/evaluation/temporalSplit.ts` | server-only | research | keep | keep | -- | |
| `lib/research/evaluation/types.ts` | server-only | research | keep | keep | -- | |
| `lib/research/evaluation/walkForward.ts` | server-only | research | keep | keep | -- | |
| `lib/research/pipeline/report.ts` | server-only | research | keep | keep | -- | |
| `lib/research/pipeline/runner.ts` | server-only | research | keep | keep | -- | |
| `lib/research/pipeline/types.ts` | server-only | research | keep | keep | -- | |
| `lib/research/pipeline/validate.ts` | server-only | research | keep | keep | -- | |
| `lib/research/source/db.ts` | server-only | research | keep | keep | -- | |
| `lib/research/source/synthetic.ts` | server-only | research | keep | keep | -- | |
| `lib/services/alertEngine.ts` | server-only | server-orch | keep | keep | -- | |
| `lib/services/livePriceSyncService.ts` | server-only | server-orch | keep | keep | -- | |
| `lib/services/scanService.ts` | server-only | server-orch | keep | keep | -- | |
| `lib/signals/communitySignals.ts` | server-only | shared-type | keep | keep | -- | |
| `lib/features/terminal/controllers/index.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/features/terminal/index.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/features/terminal/types.ts` | terminal | client-glue | keep | keep | -- | |
| `lib/webgl/ascii-trail-shaders.ts` | home | asset | keep | keep | -- | |
| `lib/webgl/webgl-utils.ts` | home | asset | keep | keep | -- | |

---

## 6. Hidden Dependencies Register

| # | Source File | Depends On | Risk | Resolution | Batch |
|---|---|---|---|---|---|
| HD-1 | `+layout.svelte` -> `globalPriceFeed.ts` -> `gameState.ts` | gameState price-pair state | CRITICAL | Extract to `activePairStore.ts` | 2 |
| HD-2 | `qdrantClient.ts`, `scanner.ts`, `skillsRegistry.ts` -> `cogochiTypes.ts` | SignalSnapshot, MemoryCard types | HIGH | Extract to `contracts/signals.ts` | 2 |
| HD-3 | `server/scanner.ts` -> `engine/cogochi/layerEngine.ts` | Layer analysis functions | HIGH | layerEngine classified as keep (active) | N/A |
| HD-4 | `settings/+page.svelte` -> `gameState.ts` | Store reset functionality | MEDIUM | Use `activePairStore` after Batch 2 | 2 |
| HD-5 | `components/shared/*` HPBar, MoodBadge, etc. | May be arena-only | MEDIUM | Grep after Batch 4, archive if unused | 9 |
| HD-6 | `chartDrawingEngine.ts` (arena) | Generic drawing primitives | MEDIUM | Evaluate reusability before archiving | 4 |

---

## 7. Batch Execution Plan

### Batch 0 -- Preparation (no file changes)
- Finalize this classification document
- Set up archive branch structure
- Verify CI/gate passes on current main

### Batch 1 -- Redirects for dead page routes
- Delete `routes/terminal-legacy/+page.svelte`, `routes/creator/[userId]/+page.svelte`
- Add redirect stubs for `scanner/+page.ts` (-> /terminal), `agent/*` and `agents/*` (-> /lab)
- **Files touched**: 5 route files
- **Risk**: Low

### Batch 2 -- Hidden dependency resolution
- Split `gameState.ts`: extract `activePairStore.ts`
- Split `cogochiTypes.ts`: extract `SignalSnapshot`/`MemoryCard` to `contracts/signals.ts`
- Update `globalPriceFeed.ts`, `+layout.svelte`, `settings/+page.svelte`, `appSurfaces.ts` imports
- **Files touched**: ~10 files
- **Risk**: HIGH (HD-1, HD-2, HD-4 -- cross-surface imports)

### Batch 3 -- Archive legacy page routes ✅ DONE
- Archived 12 legacy-delete page routes to `_archive/routes/`: arena, arena-v2, arena-war, battle, world, oracle, live, signals, signals/[postId], create, onboard
- **Files archived**: 12 route files (-8,827 lines from active src/)
- **Risk**: Low (no active imports; nav references → dead links = SvelteKit 404, cleanup in Batch 9/10)

### Batch 4 -- Archive legacy components + API routes + client wrappers ✅ DONE
- Archived 22 API routes, 5 component dirs + 4 individual components, 5 stores, 1 client API
- Extracted `Finding` type from `arenaV2State` → `contracts/signals.ts`
- Redirected `/agent`, `/agent/[id]`, `/agents` → `/lab` (Batch 6 partial)
- **3 files kept (active, not archivable)**: `matchHistoryStore` (5 consumers), `copyTradeStore` (WarRoom dep), `agentStatsApi` (agentData dep), `matchesApi` (matchHistoryStore dep)
- HD-6 (chartDrawingEngine): archived with arena components — if reuse needed, recover from `_archive/`
- **Files archived**: ~90 files
- **Risk**: Resolved — 0 type errors after archive

### Batch 5 -- Unlink parked surfaces
- Unlink cogochi route pages, cogochi components, passport components
- Unlink parked API routes (cogochi/chat, cogochi/scan, copy-trades/*, community/*, marketplace/*)
- Unlink parked client wrappers (communityApi, passportLearningApi)
- **Files touched**: ~30 files
- **Risk**: MEDIUM (some may have active server-side consumers)

### Batch 6 -- Redirect remaining legacy pages
- Replace `scanner/+page.ts` body with redirect to /terminal
- Replace `agent/+page.svelte`, `agent/[id]/+page.svelte`, `agents/+page.svelte` with redirect to /lab
- **Files touched**: 4 route files
- **Risk**: Low

### Batch 7 -- Archive legacy engine files
- Archive all legacy-delete engine files (battleEngine, v2/v3/v4 battle engines, game loop, FSM, douni character, etc.)
- **Files touched**: ~36 files
- **Risk**: MEDIUM (verify no active engine imports remain)

### Batch 8 -- Archive legacy server files
- Archive legacy server services (battleStore, arenaService, tournamentService, cogochiBattleService, douni/*)
- **Files touched**: 7 files
- **Risk**: LOW (isolated server modules)

### Batch 9 -- Shared component audit
- Grep each `components/shared/*` file for imports from active surfaces
- Archive any that are only imported by already-archived files (HD-5)
- **Files touched**: 0-17 files (depends on grep results)
- **Risk**: LOW (verification pass)

---

## 8. Summary Statistics

| Category | File Count |
|---|---|
| **keep** (no action needed) | ~310 |
| **keep-refactor** (HD resolution) | ~10 |
| **split** (type extraction) | 2 |
| **archive** (legacy-delete) | ~170 |
| **unlink** (legacy-park) | ~30 |
| **redirect** | 4 |
| **delete** | 2 |
| **Total src/ files** | ~528 |
