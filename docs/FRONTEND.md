# FRONTEND

Purpose:
- Canonical frontend architecture map for routes, state authority, and layering.
- Read before touching route shells, stores, or shared UI contracts.

## Route Surfaces

| Surface | Role | Primary concerns | Deep docs |
| --- | --- | --- | --- |
| Home | entry and positioning | narrative clarity, navigation, onboarding | `docs/product-specs/index.md` |
| Terminal | intel and action | scan orchestration, feed clarity, responsive layouts | `docs/product-specs/terminal.md` |
| Terminal Wallet Intel | address-led investigation inside Terminal | explorer truth, graph legibility, market overlay, alert authoring | `docs/COGOCHI.md § 8.1A` |
| Arena | structured decision loop | phase clarity, chart legibility, outcome recording | `docs/product-specs/arena.md` |
| Signals | discover and track | signal authority, action conversion | `docs/product-specs/signals.md` |
| Passport | profile and progression | server-derived identity, learning history | `docs/product-specs/passport.md` |
| Passport Wallet Dossier | durable wallet record | dossier permanence, evidence snapshots, shareable identity | `docs/COGOCHI.md § 8.8` |

## State Authority

| Domain | Canonical owner | Notes |
| --- | --- | --- |
| Live prices | `priceStore` | Do not mirror market truth into unrelated stores. |
| Arena route/session flow | `gameState` and route-local state | Transient only. |
| Profile and badges | server + `userProfileStore` projection | Client may cache; it does not define truth. |
| Quick trades | server + `quickTradeStore` | Optimistic entries must reconcile to server-issued truth. |
| Tracked signals | server + `trackedSignalStore` | Local persistence is fallback only. |
| Scan/intel results | server APIs + local view state | Separate fetch/orchestration from presentation. |
| Wallet intel aggregate | server APIs + route-local wallet-intel state | Raw explorer truth stays server-owned; derived labels/graphs must be boundary-validated. |

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

## Wallet Intel Route / Component Blueprint

Use this shape if wallet-address investigation lands.

### Route model

- `src/routes/terminal/+page.svelte`
  - owns `mode=wallet` query parsing and mode switch
  - keeps the Terminal shell as the investigation entrypoint
- `src/routes/passport/wallet/[chain]/[address]/+page.svelte`
  - owns the durable dossier page
  - should render without chat dependency

### API boundaries

- `src/routes/api/wallet/intel/+server.ts`
  - aggregate endpoint for summary, behavior scores, and labels
- `src/routes/api/wallet/graph/+server.ts`
  - nodes/edges for Flow Map, Token Bubble, Cluster View
- `src/routes/api/wallet/market-overlay/+server.ts`
  - chosen token price data + wallet event markers + CVD/OI/funding overlays
- `src/routes/api/wallet/dossier/[chain]/[address]/+server.ts`
  - saved theses, evidence snapshots, alert history

### Route-local orchestration modules

- `src/lib/wallet-intel/walletIntelController.ts`
  - query lifecycle, tab selection, selected node state, filter state
- `src/lib/wallet-intel/walletIntelMappers.ts`
  - transform server payloads into graph/chart view models
- `src/lib/wallet-intel/walletIntelTypes.ts`
  - canonical client-side types for nodes, edges, evidence rows, market overlays

### Terminal mode components

- `src/components/wallet-intel/WalletIntelShell.svelte`
  - overall 3-column investigation shell
- `src/components/wallet-intel/WalletIdentityCard.svelte`
  - address header, labels, confidence, activity recency
- `src/components/wallet-intel/WalletSummaryPanel.svelte`
  - executive summary, top claims, follow-up prompts
- `src/components/wallet-intel/WalletBehaviorCards.svelte`
  - accumulation/distribution/CEX deposit/holding horizon cards
- `src/components/wallet-intel/WalletFlowMap.svelte`
  - layer graph like source → split → hub
- `src/components/wallet-intel/WalletTokenBubbleGraph.svelte`
  - token/contract/counterparty bubble view
- `src/components/wallet-intel/WalletClusterView.svelte`
  - cluster-centric graph/list view
- `src/components/wallet-intel/WalletMarketOverlay.svelte`
  - selected token chart + wallet event markers + CVD/OI/funding panes
- `src/components/wallet-intel/WalletEvidenceRail.svelte`
  - tx evidence list, labels, counterparties
- `src/components/wallet-intel/WalletActionPlanCard.svelte`
  - `watch/follow/fade/ignore` output + alert save CTA

### Passport dossier components

- `src/components/passport/wallet/WalletDossierHeader.svelte`
- `src/components/passport/wallet/WalletThesisHistory.svelte`
- `src/components/passport/wallet/WalletClusterTimeline.svelte`
- `src/components/passport/wallet/WalletEvidenceSnapshots.svelte`
- `src/components/passport/wallet/WalletAlertHistory.svelte`
- `src/components/passport/wallet/WalletRelatedEntities.svelte`

### Layering rules for this surface

1. Route file decides whether the user is in standard Terminal mode or wallet-intel mode.
2. Wallet intelligence aggregation happens server-side; UI components never derive entity labels directly from raw tx rows.
3. Graph components render only typed nodes/edges and emit selection events; they do not fetch.
4. Market overlay components consume the selected token/address context from the controller, not from ad hoc local stores.
5. Passport dossier reuses the same typed entities but owns persistence/history concerns, not live chat concerns.

## Source Docs

- `docs/FE_STATE_MAP.md`
- `docs/FRONTEND_REFACTOR_EXECUTION_DESIGN_2026-03-06.md`
- `docs/terminal-refactor-master-plan-2026-03-06.md`
- `docs/terminal-uiux-refactor-design-v3-2026-03-06.md`
- `docs/generated/route-map.md`
- `docs/generated/store-authority-map.md`
- `docs/generated/api-group-map.md`
