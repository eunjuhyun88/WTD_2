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
- `src/components/cogochi/QuickPanel.svelte`
- `src/components/terminal/IntelPanel.svelte`
- `src/routes/arena/+page.svelte`
- `src/components/arena/ChartPanel.svelte`
- `src/routes/passport/+page.svelte`

When editing these, update the relevant canonical doc if authority or behavior changed.

## Terminal Shell Contract

- `src/routes/terminal/+page.svelte` owns the Terminal workspace shell and breakpoint switching.
- Desktop layout is a 3-pane grid: scanner rail, DOUNI feed, chart stage.
- Desktop supports direct drag-resize between scanner/feed and feed/chart; those split widths remain route-local UI state.
- Tablet keeps the scanner rail on the left and stacks feed over chart on the right; scanner width and chart height are independently resizable.
- Mobile does not keep all three panes visible at once; it switches between scanner, feed, and chart to preserve readability.
- `src/components/cogochi/QuickPanel.svelte` must follow parent width/height and must not hard-code the Terminal shell width.

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

## Day-1 IA Sitemap (2026-04-11)

This is an execution-facing materialization of the current canonical product direction in `docs/COGOCHI.md`.

### Primary routes

| Route | Role | Primary user question |
| --- | --- | --- |
| `/` | landing | "What is this product and where do I start?" |
| `/terminal` | observe + compose | "What setup am I seeing right now, and do I want to save it?" |
| `/lab` | evaluate + inspect + iterate | "Did this saved challenge actually earn another run?" |
| `/dashboard` | my stuff inbox | "What changed since I was last here?" |

### Secondary / deferred routes

| Route | Status | Rule |
| --- | --- | --- |
| `/passport` | secondary | durable profile / dossier, not a primary Day-1 tab |
| `/passport/wallet/[chain]/[address]` | secondary | dossier endpoint from Terminal wallet investigation |
| `/create`, `/onboard`, `/agent`, `/agent/[id]`, `/scanner`, `/cogochi/scanner`, `/market`, `/battle` | deferred / legacy / later-phase | do not expose as first-order Day-1 navigation |

## Day-1 Wireframes

### Home

```
[Header]
  Logo | Terminal | Lab | Dashboard

[Hero]
  eyebrow
  headline
  compressed value proposition
  start bar: "What setup do you want to track?"
  helper prompt chips
  CTA 1: Open Terminal
  CTA 2: See How Lab Scores It
  CTA 3: Return to Dashboard (text-level)
  proof panel

[Proof rail]
  per-user adapter / proof before trust / rollback if worse

[Learning loop]
  Capture -> Watch -> Judge -> Deploy

[3 cards]
  Terminal / Lab / Dashboard

[Final CTA]
  Open Terminal / Open Lab / Return to Dashboard
```

### Terminal

```
[Header bar]
  current symbol / mode / quick status

[Main shell]
  Left: quick list / watch context
  Center: feed / results / research blocks
  Right: chart / focused inspection

[Bottom input]
  query entry
  parsed hint
  save challenge

[Wallet mode]
  stays inside Terminal shell
  strong mode label + exit affordance
```

### Lab

```
[Intro summary]
  selected challenge / tested / waiting

[Toolbar]
  challenge picker
  cycle picker
  mode
  interval
  run action

[Main]
  Left: chart / replay canvas
  Right: challenge config or run result

[Bottom]
  position / run navigation bar
```

### Dashboard

```
[Hero summary]
  challenge count / tested count / last activity

[Section 1]
  My Challenges

[Section 2]
  Watching

[Section 3]
  My Adapters

[Quick actions]
  Open Lab / Open Terminal
```

## Implementation-Priority PRD

### Objective

Reduce product-surface ambiguity by making the visible Day-1 experience consistently read as `Terminal / Lab / Dashboard`.

### Problem

- The canonical product doc already collapsed Day-1 to 3 surfaces, but the UI still exposes older route language and journey models.
- Users currently encounter mixed concepts such as agent, onboarding, market, scanner, and battle even when they are not the primary path.
- This weakens comprehension and makes the product feel larger and less intentional than it is.

### Non-goals

- Do not remove legacy routes in this pass.
- Do not resolve wallet-intel or Terminal merge conflicts inside this IA pass.
- Do not redesign Phase 2 / Phase 3 surfaces yet.

### Scope

1. Home copy and CTA realignment
2. Home start-bar interaction and Terminal handoff
3. Home component split (`hero`, `proof-panel`, `surface-cards`, `final-cta`)
4. Navigation metadata realignment
5. Lab surface reframing around saved challenges and runs
6. Dashboard reframing as inbox
7. Profile/menu cleanup to remove Agent-first language

### Success criteria

- The top nav exposes only `Terminal`, `Lab`, and `Dashboard` as the primary Day-1 routes.
- Home explains the product using those same 3 surfaces.
- Lab reads as an evaluation workspace, not a disconnected strategy toy.
- Dashboard reads as a return/inbox surface, not a legacy performance board.
- Legacy routes remain reachable but are no longer the main story.

### Execution order

1. Home direction and wireframe lock
2. Home CTA and start-bar implementation
3. Home component split and file-size reduction
4. Navigation labels and route hierarchy
5. Dashboard inbox framing
6. Lab evaluation framing
7. Terminal mode clarity after conflict resolution

### Open risk

- `src/routes/terminal/+page.svelte` still has unresolved merge markers and should be stabilized before the final Terminal shell cleanup pass.
