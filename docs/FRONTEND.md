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
6. Shared chart model/runtime contracts must live under `src/lib/chart-engine/*`; surfaces should adapt app payloads into chart-engine specs instead of duplicating chart primitives or runtime helpers ad hoc.

## Current Hot Files

- `src/routes/terminal/+page.svelte`
- `src/components/cogochi/QuickPanel.svelte`
- `src/components/terminal/IntelPanel.svelte`
- `src/routes/arena/+page.svelte`
- `src/components/arena/ChartPanel.svelte`
- `src/lib/chart-engine/*`
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
  Desktop: Logo | Terminal | Lab | Dashboard | Open Terminal
  Tablet: Logo | Terminal | Lab | Open Terminal
  Mobile: Logo | Open Terminal

[Hero]
  eyebrow
  headline
  compressed value proposition
  guided start module:
    - one visible input for the setup to track
    - example starting prompts
    - clear primary start action into `/terminal`
  helper example queries
  CTA 1: Open Terminal
  CTA 2: See How Lab Scores It
  CTA 3: Return to Dashboard (text-level)
  proof panel
  right-biased watermark / color field

[Proof rail]
  per-user adapter / proof before trust / rollback if worse

[Learning loop]
  compact 4-card sequence:
    Capture -> Watch -> Judge -> Deploy

[3 cards]
  Terminal / Lab / Dashboard

[Final CTA]
  minimal action strip:
    Open Terminal / Lab / Dashboard
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

## Cross-Surface UI System (2026-04-12)

This is the current design direction after scanning `/`, `/terminal`, `/lab`, and `/dashboard` together.

### Current problem

- The four surfaces do not share one density model.
- Typography roles are mixed:
  - `Bebas Neue` appears in major headings
  - `Space Grotesk` appears in body and some titles
  - `JetBrains Mono` is overused for labels, values, and actions
- Responsive collapse rules differ by surface, so the product feels like separate apps instead of one system.
- Home is getting calmer, but Terminal/Lab/Dashboard still carry smaller type, denser chrome, and a more HUD-like rhythm.

### Unified product principle

Cogochi should feel like **one product with four tempo levels**, not four different UI styles.

- `/` = brand + entry
- `/terminal` = active working surface
- `/lab` = evaluation workspace
- `/dashboard` = summary inbox

Users should feel one family resemblance across all four:

- same typography roles
- same spacing rhythm
- same border radius + panel treatment
- same responsive collapse logic
- same CTA hierarchy

### Surface roles

#### Home

- job: brand statement + first move
- tone: most spacious, most editorial
- rule: one strong statement, one start module, one proof object

#### Terminal

- job: observe + compose
- tone: highest information density
- rule: dense by necessity, but never visually noisy
- key improvement: raise readability before adding more chrome

#### Lab

- job: evaluate + inspect + iterate
- tone: medium density, analytical
- rule: chart and result dominate; controls stay secondary

#### Dashboard

- job: inbox + changed state
- tone: summary-first
- rule: cards should scan quickly; no decorative density

### Typography system

Use fewer fonts with clearer roles.

- `Space Grotesk`
  - primary display for Home, Dashboard, and major section titles
  - primary body for all surfaces
- `JetBrains Mono`
  - only for:
    - tiny meta labels
    - short status chips
    - query/code-like strings
- `Bebas Neue`
  - remove from primary product UI
  - if kept at all, only for non-core decorative legacy surfaces

### Type scale

All surfaces should map to the same scale instead of ad hoc `9px / 10px / 11px / 28px` jumps.

- Display XL
  - Home hero statement
  - `clamp(44px, 6vw, 72px)`
- Display L
  - section titles on Home
  - `clamp(28px, 3.6vw, 44px)`
- Title
  - surface card titles / major panel titles
  - `20px - 28px`
- Body L
  - Home lead, Dashboard summary, important explanations
  - `17px - 19px`
- Body
  - standard readable copy
  - `15px - 16px`
- Meta
  - chips, labels, timestamps
  - `11px - 12px`
- Micro
  - only where unavoidable
  - `10px`

Hard rules:

- avoid `9px` for meaningful UI copy
- avoid using mono for long phrases
- avoid giant title jumps without matching whitespace

### Density system

#### Density 1 — Editorial

- used by Home
- large whitespace
- 1-2 core objects above the fold
- low chrome

#### Density 2 — Operational summary

- used by Dashboard and top-level Lab sections
- card-based scanning
- moderate chrome

#### Density 3 — Active workspace

- used by Terminal and parts of Lab
- multi-pane layouts allowed
- compact, but type must still clear readability thresholds

Rule:

- users can move from lower density to higher density
- users should never enter a denser surface and suddenly lose the product's typographic identity

### Panel system

All primary surfaces should reuse one panel family.

- radius:
  - `18px - 22px`
- border:
  - soft ivory/pink line at low opacity
- background:
  - dark layered fill, not flat black
- shadow:
  - one soft drop shadow, no stacked gimmick glow

Panel variants:

- `entry panel`
  - start card on Home
- `proof panel`
  - ledger / result / validation evidence
- `workspace panel`
  - Terminal/Lab operational panels
- `summary card`
  - Dashboard cards

These should differ in size and density, not in visual language.

### CTA hierarchy

Same hierarchy across all surfaces:

- Primary:
  - one filled button only
- Secondary:
  - outline or low-contrast solid
- Tertiary:
  - text link

Home should have:

- exactly one primary CTA
- all other routes demoted

Dashboard should have:

- one primary next action per empty/inbox state

Terminal/Lab should prefer:

- inline action groups near the active object
- not giant floating action buttons

### Responsive rules

The product needs one shared collapse model.

#### Desktop

- Home:
  - 2-column
  - brand statement left, start/proof stack right
- Terminal:
  - 3-panel allowed
- Lab:
  - 2-column analysis layout
- Dashboard:
  - summary grid

#### Tablet

- Home:
  - statement first, then start card, then proof
- Terminal:
  - left quick list may collapse
  - chart and feed become the priority pair
- Lab:
  - chart first, config/result below or beside depending on width
- Dashboard:
  - 2-column card grid

#### Mobile

- Home:
  - no giant hero block
  - one clear statement
  - start card immediately visible
  - proof ledger below
- Terminal:
  - no 3-panel mental model
  - feed first, chart second, quick context on demand
- Lab:
  - result summary first
  - chart next
  - controls inside collapsible sections
- Dashboard:
  - single-column cards
  - every card readable without tiny labels

Mobile rules:

- never rely on tiny monospace labels to convey primary meaning
- every primary action must remain visible without horizontal scanning

### Home reference surface

Home is the **reference surface**, not a marketing collage.

- Header on `/` should behave like a brand rail:
  - logo
  - primary surface nav
  - connect action
  - no ticker, XP, settings, or extra chrome
- Above the fold should contain only 3 objects:
  - brand statement
  - start composer
  - proof ledger
- The start composer should visually read as an input surface first and a button second.
- Accent color should only appear in:
  - small meta labels
  - active nav state
  - one primary CTA
- Lower sections should reduce repetition:
  - `How it works` = sequential rail, not 4 equally loud promo cards
  - `Surfaces` = route orientation, not a second hero
  - footer CTA = minimal restatement, not another sales block

### Home visual reset (2026-04-12 evening)

This is the concrete visual direction for the next home pass.

- Palette is constrained to:
  - `#ff7f85`
  - `#ec9393`
  - `#db9a9f`
  - `#f9d8c2`
  - `#f9f6f1`
  - `#faf7eb`
  - plus `#070707` / black only
- `#db9a9f` is the stable accent token across nav, labels, ledger marks, and soft glows.
- `#ff7f85` is not a page-wide accent. Use it only when a stronger call-to-action or hover emphasis is required.
- `#f9d8c2`, `#f9f6f1`, and `#faf7eb` are the paper/ivory family for entry cards and high-attention surfaces.

Home layout rule:

- top center = one editorial story object
- directly below center = one immediate start card
- below both = one compact proof rail
- below the fold = one explanation rail + one route-orientation row + minimal footer

Density rule:

- the hero statement must read first from across the room
- the start card must read second without requiring explanation and should sit near the visual center of the fold
- no other object should compete with those two above the fold

Header rule on home:

- hide ticker / XP / settings
- keep only logo, 3 route pills, and connect
- nav should feel like a thin brand rail, not app chrome

Typography rule on home:

- large copy uses `Space Grotesk` only
- mono is reserved for meta labels, prompt prefix, and ledger indexes
- body copy on home should sit in the `17px - 21px` readable band, not the `11px - 14px` operational band

Mobile rule on home:

- keep the statement, start card, and proof ledger stacked in that order
- do not preserve desktop equal-height card behavior on mobile
- primary CTA stays visible without scrolling through route cards first

### Terminal shell progression

Terminal should use **progressive disclosure**, not permanent 3-panel density.

- Default desktop state:
  - 2-panel working layout
  - feed/workstream + chart/context
- Third panel:
  - opens only when the user selects a result, block, or deep detail object from the active feed
  - closes back into the 2-panel layout when focus is cleared
- Quick list / scanner rail:
  - may stay as a collapsible rail or drawer
  - should not read as a full equal-weight panel when inactive
- Resizing:
  - split widths should be user-adjustable
  - the stored ratio from the 2-panel state should carry into the 3-panel state
  - when detail opens, the center/right widths should rebalance from the previous remembered split, not jump to arbitrary fixed widths
- Mobile:
  - feed first
  - chart/context second
  - detail panel becomes an overlay or stacked drill-in, never a squeezed 3-column layout

### Surface-specific implementation direction

#### Home next

- reduce remaining label noise
- enlarge important body text
- keep one brand statement + one start card + one compact proof ledger

#### Terminal next

- remove excessive display-font interruptions
- raise the floor of readable type from `9-11px` to `11-13px` minimum
- move to a 2-panel default shell with on-demand third-panel expansion
- simplify pane chrome before adding more features
- define a true mobile Terminal layout instead of shrinking desktop chrome

#### Lab next

- make chart + result the main story
- move strategy/config density behind clearer grouping
- match Home/Dashboard title scale and body legibility

#### Dashboard next

- remove mixed display/font treatments
- make summary cards faster to scan
- align card spacing, labels, and CTA style with Home

### Implementation order

1. Lock typography tokens and panel variants
2. Finish Home as the reference surface
3. Apply the same type/density system to Dashboard
4. Refactor Lab around chart/result dominance
5. Refactor Terminal last, because it has the highest coupling and density

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

## Feature File Inventory (clean main baseline)

This is the cleanup inventory that should drive actual folder reorganization. It is grouped by feature ownership, not by top-level directory names.

### 1. Active UI now: keep on the frontend

#### Home entry

- Route:
  - `src/routes/+page.svelte`
- Direct UI files:
  - `src/components/home/HomeBackground.svelte`
  - `src/components/home/HomeHero.svelte`
  - `src/components/home/HomeLearningLoop.svelte`
  - `src/components/home/HomeSurfaceCards.svelte`
  - `src/components/home/HomeFinalCta.svelte`
  - `src/components/home/WebGLAsciiBackground.svelte`
  - `src/components/home/homeData.ts`
  - `src/lib/home/homeLanding.ts`

#### Global shell / navigation

- Route shell:
  - `src/routes/+layout.svelte`
- Direct UI files:
  - `src/components/layout/Header.svelte`
  - `src/components/layout/BottomBar.svelte`
  - `src/components/layout/MobileBottomNav.svelte`
  - `src/components/modals/WalletModal.svelte`
  - `src/components/shared/NotificationTray.svelte`
  - `src/components/shared/ToastStack.svelte`
  - `src/components/shared/P0Banner.svelte`
- Frontend glue:
  - `src/lib/navigation/appSurfaces.ts`
  - `src/lib/layout/globalPriceFeed.ts`
  - `src/lib/cogochi/marketPulse.ts`
  - `src/lib/utils/deepLinks.ts`

#### Terminal

- Route:
  - `src/routes/terminal/+page.svelte`
- Direct UI files:
  - `src/components/terminal/BottomPanel.svelte`
  - `src/components/terminal/DirectionBadge.svelte`
  - `src/components/terminal/GmxTradePanel.svelte`
  - `src/components/terminal/IntelPanel.svelte`
  - `src/components/terminal/PolymarketBetPanel.svelte`
  - `src/components/terminal/StrategyCard.svelte`
  - `src/components/terminal/VerdictBanner.svelte`
  - `src/components/terminal/VerdictCard.svelte`
  - `src/components/terminal/WarRoom.svelte`
  - `src/components/terminal/intelHelpers.ts`
  - `src/components/terminal/terminalHelpers.ts`
  - `src/components/terminal/terminalLayoutController.ts`
  - `src/components/cogochi/QuickPanel.svelte`
- Frontend glue:
  - `src/lib/terminal/blockSearchParser.ts`
  - `src/lib/terminal/scanCardMapper.ts`
  - `src/lib/features/terminal/controllers/index.ts`
  - `src/lib/features/terminal/index.ts`
  - `src/lib/features/terminal/types.ts`
  - `src/lib/api/terminalApi.ts`

#### Lab

- Route:
  - `src/routes/lab/+page.svelte`
- Direct UI files:
  - `src/components/lab/CycleSelector.svelte`
  - `src/components/lab/LabChart.svelte`
  - `src/components/lab/LabToolbar.svelte`
  - `src/components/lab/PositionBar.svelte`
  - `src/components/lab/ResultPanel.svelte`
  - `src/components/lab/StrategyBuilder.svelte`

#### Dashboard

- Route:
  - `src/routes/dashboard/+page.svelte`
- Shared UI dependencies it visibly uses:
  - `src/components/shared/EmptyState.svelte`
  - global shell/navigation files above

### 2. Secondary but still user-facing UI

#### Passport / wallet dossier

- Route:
  - `src/routes/passport/+page.svelte`
- Direct UI files:
  - `src/components/passport/passportHelpers.ts`
  - `src/components/wallet-intel/WalletActionPlanCard.svelte`
  - `src/components/wallet-intel/WalletBehaviorCards.svelte`
  - `src/components/wallet-intel/WalletClusterView.svelte`
  - `src/components/wallet-intel/WalletEvidenceRail.svelte`
  - `src/components/wallet-intel/WalletFlowMap.svelte`
  - `src/components/wallet-intel/WalletIdentityCard.svelte`
  - `src/components/wallet-intel/WalletIntelShell.svelte`
  - `src/components/wallet-intel/WalletMarketOverlay.svelte`
  - `src/components/wallet-intel/WalletSummaryPanel.svelte`
  - `src/components/wallet-intel/WalletTokenBubbleGraph.svelte`
- Frontend glue:
  - `src/lib/wallet-intel/walletIntelController.ts`
  - `src/lib/wallet-intel/walletIntelTypes.ts`
  - `src/lib/api/profileApi.ts`
  - `src/lib/api/passportLearningApi.ts`

#### Settings

- Route:
  - `src/routes/settings/+page.svelte`
- Current entry point:
  - `src/components/layout/Header.svelte`

### 3. Legacy / deferred UI: not part of the current primary story

These files are still route-backed, so they are not dead. But they are not part of the current Day-1 product path and should be treated as separable legacy surface ownership.

#### Agent / creator / identity legacy

- Routes:
  - `src/routes/agent/+page.svelte`
  - `src/routes/agent/[id]/+page.svelte`
  - `src/routes/agents/+page.svelte`
  - `src/routes/create/+page.svelte`
  - `src/routes/creator/[userId]/+page.svelte`
  - `src/routes/onboard/+page.svelte`
  - `src/routes/world/+page.svelte`
- UI files:
  - `src/components/agent/AgentCard.svelte`
  - `src/components/agent/DoctrineEditor.svelte`
  - `src/components/agent/MemoryCard.svelte`

#### Arena / battle legacy

- Routes:
  - `src/routes/arena/+page.svelte`
  - `src/routes/arena-war/+page.svelte`
  - `src/routes/arena-v2/+page.svelte`
  - `src/routes/battle/+page.svelte`
- UI files:
  - `src/components/arena/*`
  - `src/components/arena-war/*`
  - `src/components/arena-v2/*`
  - `src/components/battle/*`

#### Signals / community / live legacy

- Routes:
  - `src/routes/signals/+page.svelte`
  - `src/routes/signals/[postId]/+page.svelte`
  - `src/routes/oracle/+page.svelte`
- UI files:
  - `src/components/community/OracleLeaderboard.svelte`
  - `src/components/live/LivePanel.svelte`
  - `src/components/shared/ContextBanner.svelte`

#### Cogochi legacy shell

- Routes:
  - `src/routes/cogochi/+layout.svelte`
  - `src/routes/cogochi/+layout.ts`
  - `src/routes/cogochi/+page.svelte`
  - `src/routes/cogochi/scanner/+page.svelte`
- UI files:
  - `src/components/cogochi/AlphaMarketBar.svelte`
  - `src/components/cogochi/ArtifactPanel.svelte`
  - `src/components/cogochi/CgChart.svelte`
  - `src/components/cogochi/CgLayerPanel.svelte`
  - `src/components/cogochi/DataCard.svelte`
  - `src/components/cogochi/DeepDivePanel.svelte`
  - `src/components/cogochi/DouniChat.svelte`
  - `src/components/cogochi/MarketThermometer.svelte`
  - `src/components/cogochi/ScannerPanel.svelte`

#### Terminal legacy route

- Route:
  - `src/routes/terminal-legacy/+page.svelte`
- Direct dependency that is effectively legacy with it:
  - `src/components/modals/CopyTradeModal.svelte`

### 4. Redirect / alias-only files

These are already compatibility shims and can be treated separately from feature ownership.

- `src/routes/scanner/+page.ts`
- `src/routes/cogochi/scanner/+page.ts`
- `src/routes/holdings/+page.svelte`
- `src/routes/live/+page.ts`
- `src/routes/arena-v2/+page.server.ts`

### 5. Unreferenced or near-unreferenced UI candidates

These need manual confirmation before deletion, but they are strong cleanup candidates because the clean main worktree showed no references from `src/`.

- No in-repo references found:
  - `src/components/modals/OracleModal.svelte`
  - `src/components/modals/PassportModal.svelte`
  - `src/components/modals/SettingsModal.svelte`
- Only tied to legacy route flow:
  - `src/components/modals/CopyTradeModal.svelte` -> referenced by `src/routes/terminal-legacy/+page.svelte`

### 6. Backend-separable files by feature

These files are the best candidates if you want to split backend/server work out of the current frontend app shell.

#### Terminal / market intelligence backend

- HTTP endpoints:
  - `src/routes/api/terminal/**`
  - `src/routes/api/market/**`
  - `src/routes/api/exchange/**`
  - `src/routes/api/cycles/**`
  - `src/routes/api/coinalyze/**`
  - `src/routes/api/coingecko/**`
  - `src/routes/api/macro/**`
  - `src/routes/api/senti/**`
  - `src/routes/api/yahoo/**`
  - `src/routes/api/wallet/intel/**`
- Server modules:
  - `src/lib/server/providers/**`
  - `src/lib/server/scanEngine.ts`
  - `src/lib/server/scanner.ts`
  - `src/lib/server/warRoomService.ts`
  - `src/lib/server/marketDataService.ts`
  - `src/lib/server/marketFeedService.ts`
  - `src/lib/server/marketSnapshotService.ts`
  - `src/lib/server/intelPolicyRuntime.ts`
  - `src/lib/server/intelShadowAgent.ts`
  - `src/lib/server/walletIntelServer.ts`

#### Arena / battle backend

- HTTP endpoints:
  - `src/routes/api/arena/**`
  - `src/routes/api/arena-war/**`
  - `src/routes/api/battle/**`
  - `src/routes/api/matches/**`
  - `src/routes/api/tournaments/**`
- Server modules:
  - `src/lib/server/arenaService.ts`
  - `src/lib/server/battleStore.ts`
  - `src/lib/server/cogochiBattleService.ts`
  - `src/lib/server/tournamentService.ts`
  - `src/lib/server/progressionUpdater.ts`

#### Auth / wallet / profile backend

- HTTP endpoints:
  - `src/routes/api/auth/**`
  - `src/routes/api/profile/**`
  - `src/routes/api/preferences/**`
  - `src/routes/api/notifications/**`
  - `src/routes/api/ui-state/**`
- Server modules:
  - `src/lib/server/authGuard.ts`
  - `src/lib/server/authRepository.ts`
  - `src/lib/server/authSecurity.ts`
  - `src/lib/server/session.ts`
  - `src/lib/server/secretCrypto.ts`
  - `src/lib/server/walletAuthRepository.ts`
  - `src/lib/server/requestGuards.ts`
  - `src/lib/server/originGuard.ts`
  - `src/lib/server/turnstile.ts`

#### AutoResearch / ML / ORPO backend

- HTTP endpoints:
  - `src/routes/api/lab/**`
  - `src/routes/api/cogochi/**`
  - `src/routes/api/profile/passport/learning/**`
- Server modules:
  - `src/lib/server/autoResearch/**`
  - `src/lib/server/orpo/**`
  - `src/lib/server/passportMlPipeline.ts`
  - `src/lib/server/passportOutbox.ts`
  - `src/lib/server/journal/trajectoryWriter.ts`
  - `src/lib/server/researchView/buildResearchBlocks.ts`
  - `src/lib/server/ragService.ts`
  - `src/lib/server/qdrantClient.ts`

#### Pure backend/data-contract support

- server-only:
  - `src/lib/server/db.ts`
  - `src/lib/server/distributedRateLimit.ts`
  - `src/lib/server/ipReputation.ts`
  - `src/lib/server/rateLimit.ts`
  - `src/lib/server/migrations/**`
- backend-adjacent shared domains that could move with the server split:
  - `src/lib/research/**`
  - `src/lib/contracts/**`

### 7. Frontend files that should stay even after backend split

If backend is extracted, these still belong to the frontend app shell.

- `src/lib/api/**`
  - browser-side fetch wrappers for the Svelte routes/pages
- `src/lib/stores/**`
  - route-local and app-wide client state
- `src/lib/chart/**`
  - client chart rendering helpers
- `src/lib/utils/**`
  - shared browser-safe utilities except when a file is clearly server-specific
- `src/lib/wallet/**`
  - wallet-provider and client signing flows

### Recommended cleanup order from this inventory

1. Trim unreferenced modal files.
2. Remove legacy references from shared glue (`appSurfaces`, `deepLinks`, `BottomBar`, `homeData`, `WarRoom`).
3. Freeze redirect aliases as thin shims only.
4. Separate legacy UI feature folders from active Day-1 UI feature folders.
5. If desired, split `src/routes/api/**` + `src/lib/server/**` + `src/lib/research/**` + `src/lib/contracts/**` into a backend package or repository boundary.
