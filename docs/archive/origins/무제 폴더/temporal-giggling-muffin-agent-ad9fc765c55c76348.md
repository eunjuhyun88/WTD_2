# COGOCHI IA Restructuring Plan

## Executive Summary

This plan restructures COGOCHI from 16+ routes (6 duplicates/redirects, 3 overlapping tab systems) into 8 canonical routes with a single unified game loop: **CREATE -> TRAIN -> PROVE -> GROW**. Every page gets one job. Navigation reflects the loop. Progressive disclosure gates complexity behind journey milestones.

---

## Part 1: New Route Map

### Canonical Routes (8 total, down from 16)

| Route | Job | Current Source |
|-------|-----|----------------|
| `/` | Journey dashboard: show current state, direct to next action | `src/routes/+page.svelte` (keep, simplify) |
| `/create` | 2-step agent creation wizard (Lead + Path) | `src/routes/create/+page.svelte` (keep) |
| `/terminal` | Training ground: chart, intel, chat, scanning | `src/routes/terminal/+page.svelte` (keep) |
| `/arena` | Battle system: Draft->Analysis->Hypothesis->Battle->Result | `src/routes/arena/+page.svelte` (keep) |
| `/agent` | Agent HQ: overview + train + record (3 tabs stay) | `src/routes/agent/+page.svelte` (keep) |
| `/community` | Rename from /signals: feed + leaderboard (2 tabs max) | `src/routes/signals/+page.svelte` (move) |
| `/community/[postId]` | Single signal drilldown | `src/routes/signals/[postId]/+page.svelte` (move) |
| `/creator/[userId]` | Public creator profile | `src/routes/creator/[userId]/+page.svelte` (keep) |

### Routes to DELETE (replace with SvelteKit redirects in hooks)

| Old Route | Disposition | Why |
|-----------|-------------|-----|
| `/world` | 301 -> `/terminal` | Confirmed duplicate (current file is just `goto('/terminal')`) |
| `/agents` | 301 -> `/agent` | Confirmed duplicate (current file is just `goto('/agent')`) |
| `/lab` | 301 -> `/agent?tab=train` | Confirmed redirect |
| `/passport` | 301 -> `/agent?tab=record` | Confirmed redirect |
| `/holdings` | 301 -> `/agent?tab=record` | Chain redirect (holdings -> passport -> agent) |
| `/arena-v2` | 301 -> `/arena` | Legacy redirect |
| `/arena-war` | 301 -> `/arena` | Legacy redirect |
| `/oracle` | 301 -> `/community?view=oracle` | Currently redirects to `/signals?view=oracle` |
| `/live` | 301 -> `/community` | Currently server-redirects to `/signals` |
| `/signals` | 301 -> `/community` | Old name, redirect to new canonical |
| `/signals/[postId]` | 301 -> `/community/[postId]` | Old name, redirect to new canonical |
| `/settings` | REMOVE as route, move to modal | Settings page has minimal content, better as `SettingsModal` |

### Implementation: Server-Side Redirects

Replace all client-side `goto()` redirects with proper server-side redirects. Create a single redirect handler in `src/hooks.server.ts` (or extend existing):

```
File: src/hooks.server.ts
Add redirect map:
  /world -> /terminal (301)
  /agents -> /agent (301)
  /lab -> /agent?tab=train (301)
  /passport -> /agent?tab=record (301)
  /holdings -> /agent?tab=record (301)
  /arena-v2 -> /arena (301)
  /arena-war -> /arena (301)
  /oracle -> /community?view=oracle (301)
  /live -> /community (301)
  /signals -> /community (301)
  /signals/:postId -> /community/:postId (301)
```

After the redirect handler is stable, delete all client-side redirect route files:
- `src/routes/world/+page.svelte`
- `src/routes/agents/+page.svelte`
- `src/routes/lab/+page.svelte`
- `src/routes/passport/+page.svelte`
- `src/routes/holdings/+page.svelte`
- `src/routes/arena-v2/+page.svelte`
- `src/routes/arena-war/+page.svelte`
- `src/routes/oracle/+page.svelte`
- `src/routes/live/+page.ts`

---

## Part 2: New Navigation Structure

### Desktop Header (3 tabs -> 4 tabs)

```
[Cogochi logo] | CREATE | TRAIN | PROVE | GROW | [wallet]
```

Mapping:
- **CREATE** -> `/create` (active when on `/create`; hidden after agent minted, replaced by agent name chip)
- **TRAIN** -> `/terminal` (active on `/terminal`)
- **PROVE** -> `/arena` (active on `/arena`)
- **GROW** -> `/agent` (active on `/agent`, `/community`, `/creator`)

This maps 1:1 to the game loop verbs. The GROW tab is the "review and expand" surface that includes Agent HQ and Community.

### Mobile Bottom Nav (4 tabs)

```
[HOME] [TRAIN] [PROVE] [GROW]
```

- **HOME** (`/`) - Journey compass: always shows "what's next"
- **TRAIN** (`/terminal`) - Chart terminal
- **PROVE** (`/arena`) - Arena battles
- **GROW** (`/agent`) - Agent HQ + community access

### Why This Works

The current nav (`MISSION | AGENT | MARKET`) conflates three different products. MISSION contains create+terminal+arena (too much). AGENT is isolated from the loop. MARKET feels like a different app. The new nav makes each tab = one loop step, and the user always knows where they are in the cycle.

### Implementation

**File: `src/lib/navigation/appSurfaces.ts`**

Replace the current `SURFACE_MAP`, `DESKTOP_NAV_SURFACES`, and `MOBILE_NAV_SURFACES` with:

```
AppSurfaceId: 'home' | 'create' | 'train' | 'prove' | 'grow'

SURFACE_MAP:
  home:   { href: '/', activePatterns: ['/'], mobileIcon: '⌂' }
  create: { href: '/create', activePatterns: ['/create'], mobileIcon: '+' }
  train:  { href: '/terminal', activePatterns: ['/terminal'], mobileIcon: '~' }
  prove:  { href: '/arena', activePatterns: ['/arena'], mobileIcon: '⚔' }
  grow:   { href: '/agent', activePatterns: ['/agent', '/community', '/creator'], mobileIcon: '@' }

DESKTOP_NAV_SURFACES: [create, train, prove, grow]
  - create surface hides after minting (conditional rendering in Header)

MOBILE_NAV_SURFACES: [home, train, prove, grow]
```

**File: `src/components/layout/Header.svelte`**
- Remove MISSION/AGENT/MARKET tabs
- Render new 4-tab structure from updated `DESKTOP_NAV_SURFACES`
- Add conditional: if `$hasMintedAgent`, hide CREATE tab and show agent name chip instead
- Keep ticker display for non-light-header routes

**File: `src/components/layout/MobileBottomNav.svelte`**
- Update to use new `MOBILE_NAV_SURFACES`
- Badge logic: PROVE tab shows active match count; GROW tab shows open trade count

**File: `src/lib/utils/deepLinks.ts`**
- Remove `buildWorldLink()` (dead)
- Rename `buildMarketLink()` -> `buildCommunityLink()`
- Rename `buildSignalsLink()` -> `buildCommunityLink()`
- Add `buildCommunityPostLink(postId: string)`
- Keep all others

---

## Part 3: Page-by-Page Responsibility

### `/` — Journey Dashboard
**One Job**: Show the user exactly where they are and what to do next.

Current state: Already does this with `journeyState` derived value. Keep the 4-state branching logic (`no-agent | training | arena-ready | active`). Remove the starter roster picker from home (it belongs in `/create`).

Changes:
- Remove companion-bay roster grid (move to `/create`)
- Add "quick stats" row: LP, tier, win rate, active signals
- Add a "GROW" section link for community signals (currently invisible from home)
- Each journeyState renders ONE primary CTA, not multiple buttons

### `/create` — Agent Creation Wizard
**One Job**: Create the agent (shell + growth path) in 2 steps.

Current state: Already well-scoped. Uses `MissionFlowShell` for the progress stepper.

Changes:
- Move the starter roster picker FROM home page TO step 1 of create
- After activation, redirect to `/terminal` (training is next)
- Add soft gate: if already minted, show "Agent already created" card with link to `/agent`

### `/terminal` — Training Ground
**One Job**: Analyze markets, build conviction, train the agent brain.

Current state: Overloaded. Has WarRoom, ChartPanel, IntelPanel, StrategyVariantWorkbench, VerdictBanner, TokenDropdown, CopyTradeModal all on one page.

Changes:
- Remove StrategyVariantWorkbench from terminal (it belongs in `/agent?tab=train`)
- Keep: ChartPanel + IntelPanel + WarRoom as the core training surface
- Add context banner at top: "Training [AgentName] // Readiness [X/3]"
- After first validation run completes, show "Arena Unlocked" toast with CTA to `/arena`
- Remove CopyTradeModal trigger from terminal (move to agent HQ or community)

### `/arena` — Battle Proof System
**One Job**: Run a match from draft to result, proving the agent.

Current state: Well-structured 5-phase system (Draft -> Analysis -> Hypothesis -> Battle -> Result). Has 4 view modes (chart/arena/mission/card) which is excessive.

Changes:
- Reduce view modes from 4 to 2: **Chart View** (data-focused) and **Battle View** (visual-focused)
- Remove `MissionControlView` (redundant with MissionFlowShell stepper)
- Remove `CardDuelView` (novelty, low utility)
- Soft gate: if agent not minted, show "Create Agent First" card with link to `/create`
- Soft gate: if not terminal-ready, show "Complete Training First" card with link to `/terminal` (but still allow entry)
- After RESULT phase, show "Review in Agent HQ" CTA -> `/agent?tab=record`

### `/agent` — Agent HQ (GROW hub)
**One Job**: Review proof, train memory, manage the agent.

Current state: 3 tabs (Overview, Train, Record). This is fine.

Changes:
- **Overview tab**: Agent stats, recent match results summary, LP/tier display, growth focus drills, link to `/community`
- **Train tab** (keep as LabView): Move StrategyVariantWorkbench here FROM terminal. This is where you configure the brain, not where you watch charts.
- **Record tab** (keep as RecordView): Match history, PnL, proof artifacts, tracked signals
- Add a "Community Signals" quick-link card in Overview tab -> `/community`
- Add a "Next Mission" CTA at bottom of overview -> cycles back to `/terminal` or `/arena`

### `/community` — Social Signal Layer (renamed from /signals)
**One Job**: Browse community signals, leaderboards, and public proof.

Current state: 3 sub-views (community/signals/oracle) with 2 filter layers = too much navigation.

Changes:
- Reduce to 2 tabs: **Feed** (combined community + signals) and **Oracle** (leaderboard)
- Remove the separate filter bars; use a single inline filter chip row
- Each signal card has "Inspect" -> `/community/[postId]` and "Copy to Terminal" -> deep link to `/terminal`
- Oracle leaderboard (currently OracleLeaderboard.svelte component) stays as tab 2

### `/community/[postId]` — Signal Detail
**One Job**: Deep dive into one signal/post.

Current state: Bridge/placeholder page. Keep the route, flesh out later.

### `/creator/[userId]` — Creator Profile
**One Job**: View a creator's public profile and track record.

Current state: Bridge/placeholder page. Keep the route, flesh out later.

---

## Part 4: Flow Diagram with Soft Gates

```
[HOME /] ─── "What's next?" ───┐
                                │
    ┌───────────────────────────┼───────────────────────────┐
    │                           │                           │
    v                           v                           v
[CREATE /create]          [TRAIN /terminal]          [PROVE /arena]
  Shell + Path              Chart + Intel              Draft -> Result
  2-step wizard             Brain training             5-phase battle
    │                           │                           │
    │ activateAgent()           │ markReadinessStep()       │ addMatchRecord()
    │                           │                           │
    └──────── AUTO ────────────>│                           │
              redirect          │                           │
                                │<── SOFT GATE ────────────>│
                                │  "Complete training       │
                                │   first" banner           │
                                │  (not blocked, just       │
                                │   guided)                 │
                                │                           │
                                └───────── RESULTS ────────>│
                                                            │
                                                            v
                                                    [GROW /agent]
                                                    Review + Learn
                                                    Record + Stats
                                                            │
                                              ┌─────────────┼──────────────┐
                                              │             │              │
                                              v             v              v
                                         [/community] [/terminal]    [/arena]
                                         Social layer  Next cycle    Next match
                                         (secondary)
```

### Soft Gate Implementation

Soft gates are NOT route guards. They are context banners rendered conditionally at the top of each page.

**File: `src/components/shared/ContextBanner.svelte`** (already exists, extend)

Gate conditions (all in `agentJourneyStore`):
1. **No agent minted** (`!journey.minted`):
   - `/terminal` shows: "Create an agent first to begin training" + CTA to `/create`
   - `/arena` shows: "Create an agent first to enter the arena" + CTA to `/create`
   - User can still scroll and explore, but primary actions are disabled
2. **Agent minted but not terminal-ready** (`journey.minted && !journey.terminalReady`):
   - `/arena` shows: "Complete terminal training to unlock full arena" + CTA to `/terminal`
   - Arena still lets the user enter, but shows readiness progress
3. **Terminal ready, no matches** (`journey.terminalReady && records.length === 0`):
   - `/agent` overview shows: "Run your first arena match to build proof" + CTA to `/arena`
4. **Active state** (has match records):
   - No gates. All surfaces fully unlocked. "What's next" suggestions appear on home.

---

## Part 5: Progressive Disclosure Strategy

### Tier 0: Pre-Agent (journeyState === 'no-agent')
**Visible**: Home, Create
**Dimmed/Locked**: Terminal (explore only, no agent actions), Arena (preview only), Agent HQ (empty state), Community (read-only)
**Nav change**: CREATE tab is highlighted/pulsing in nav

### Tier 1: Training Phase (journeyState === 'training')
**Newly revealed**: Terminal (full access), Agent HQ Train tab
**Dimmed**: Arena (soft-gated with training banner)
**Nav change**: TRAIN tab is highlighted. Readiness progress shows on nav dot (amber)

### Tier 2: Arena Ready (journeyState === 'arena-ready')
**Newly revealed**: Arena (full access)
**Nav change**: PROVE tab is highlighted. Nav dot goes green on TRAIN.

### Tier 3: Active (journeyState === 'active')
**All unlocked**: Everything fully accessible
**Revealed**: Community signals become more prominent, Oracle becomes meaningful
**Nav change**: GROW tab highlighted. Loop suggestions rotate on home.

### Implementation Pattern

Each page reads `agentJourneyStore` and `matchHistoryStore` to determine what to show:

```typescript
// In each page's <script>
const journey = $derived($agentJourneyStore);
const records = $derived($matchHistoryStore.records);
const gateLevel = $derived(
  !journey.minted ? 0
  : !journey.terminalReady ? 1
  : records.length === 0 ? 2
  : 3
);
```

Components render different content per gateLevel. This pattern already exists in `src/routes/+page.svelte` (the `journeyState` derived). Standardize it across all pages.

---

## Part 6: Migration Path (Phased Rollout)

### Phase 1: Route Cleanup (LOW RISK, do first)
1. Create `src/hooks.server.ts` redirect map for all deprecated routes
2. Verify redirects work with tests
3. Delete all client-side redirect route files (world, agents, lab, passport, holdings, arena-v2, arena-war, oracle, live)
4. Update `deepLinks.ts`: remove `buildWorldLink`, rename signal/market links
5. This phase changes zero user-facing behavior

**Files to modify**:
- `src/hooks.server.ts` (create/extend)
- `src/lib/utils/deepLinks.ts`
- Delete 9 route files listed above

### Phase 2: Navigation Restructure (MEDIUM RISK)
1. Update `src/lib/navigation/appSurfaces.ts` with new surface definitions
2. Update `src/components/layout/Header.svelte` with new tab structure
3. Update `src/components/layout/MobileBottomNav.svelte` with new mobile tabs
4. Update `src/routes/+layout.svelte` active-pattern checks

**Files to modify**:
- `src/lib/navigation/appSurfaces.ts`
- `src/components/layout/Header.svelte`
- `src/components/layout/MobileBottomNav.svelte`
- `src/routes/+layout.svelte`

### Phase 3: Signals -> Community Rename (MEDIUM RISK)
1. Create `src/routes/community/+page.svelte` (copy from signals, simplify tabs)
2. Create `src/routes/community/[postId]/+page.svelte` (copy from signals/[postId])
3. Add `/signals` -> `/community` redirect to hooks
4. Update all internal links referencing `/signals`
5. Delete old signals route files

**Files to modify**:
- Create `src/routes/community/+page.svelte`
- Create `src/routes/community/[postId]/+page.svelte`
- `src/hooks.server.ts` (add signals redirects)
- All files referencing `/signals` (grep for buildSignalsLink, buildMarketLink, '/signals')

### Phase 4: Page Simplification (LOW-MEDIUM RISK, incremental)
1. **Home**: Remove roster picker, add stats row, simplify CTAs to single primary
2. **Terminal**: Remove StrategyVariantWorkbench import, add training context banner
3. **Arena**: Remove CardDuelView and MissionControlView, reduce to 2 view modes
4. **Agent HQ**: Move StrategyVariantWorkbench to Train tab (it's already imported there)
5. **Community**: Reduce from 3 sub-views to 2 tabs

**Files to modify**:
- `src/routes/+page.svelte`
- `src/routes/terminal/+page.svelte`
- `src/routes/arena/+page.svelte`
- `src/routes/agent/+page.svelte`
- `src/routes/community/+page.svelte` (new)

### Phase 5: Soft Gates & Progressive Disclosure (LOW RISK)
1. Extend `ContextBanner.svelte` with gate-level rendering
2. Add gateLevel derived to all page scripts
3. Add "What's Next" CTA blocks to each page's completion state
4. Update `MissionFlowShell.svelte` to reflect new 4-step loop (Create/Train/Prove/Grow instead of Create/Train/Arena)

**Files to modify**:
- `src/components/shared/ContextBanner.svelte`
- `src/components/mission/MissionFlowShell.svelte`
- All 5 canonical page files (add gateLevel)

### Phase 6: Settings Modal Migration (LOW RISK)
1. Move settings content into `src/components/modals/SettingsModal.svelte` (already exists)
2. Add settings trigger to Header profile dropdown (already has one)
3. Delete `src/routes/settings/+page.svelte`
4. Add `/settings` -> `/` redirect to hooks

---

## Risk Assessment

| Phase | Risk | Rollback |
|-------|------|----------|
| 1 - Route cleanup | Very low | Revert hooks.server.ts |
| 2 - Nav restructure | Medium | Revert 4 files |
| 3 - Signals rename | Medium | Redirect community back to signals |
| 4 - Page simplification | Low per-page | Each page is independent |
| 5 - Soft gates | Very low | Remove context banners |
| 6 - Settings modal | Very low | Restore settings route |

Total estimated scope: ~15 files modified, ~10 files deleted, ~3 files created.
