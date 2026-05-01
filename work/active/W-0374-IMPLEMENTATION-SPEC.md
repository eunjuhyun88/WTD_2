# W-0374 Implementation Spec — Design to Code Bridge
> **Status**: 🟡 Gap Analysis Complete — Ready for Phase D-0 ~ D-10 execution
>
> **Canonical Design**: W-0374-cogochi-bloomberg-ux-restructure.md (86KB reference)  
> **Current Implementation**: PR #854 merged — Tab wiring (10% of phase work)  
> **Gap**: 50-60% complete → Missing visual hierarchy, data wiring, drawer patterns, mobile polish  
> **Audience**: Frontend engineers, designers, GTM stakeholders  
> **Purpose**: TradingView/Bloomberg-grade design specification that any engineer can implement identically  

---

## 1. Executive Summary

### Current State (As of 2026-05-01)

| Aspect | Status | Evidence |
|--------|--------|----------|
| Design document | ✅ Complete (86KB, 30 sections) | W-0374 canonical |
| Layout grid (Phase D-0) | ⚠️ 60% | TopBar + grid skeleton in AppShell |
| AI Agent Panel 5-tabs (Phase D-1~D-7) | ⚠️ 50% | Tabs wired, no drawer/inline separation, stubs |
| Indicator Library (Phase D-3) | ❌ 0% | Not created yet |
| Chart drawing toolbar (Phase D-4) | ⚠️ 40% | DrawingManager exists, UI integration partial |
| Multi-pane crosshair sync (Phase D-5) | ❌ 0% | Not implemented |
| Drag-to-save pattern recall (Phase D-6) | ⚠️ 30% | API exists, UI flow missing |
| Decision data wiring | ❌ 0% | DecisionHUD receives `null`, engine capture not integrated |
| Mobile bottom-sheet (Phase D-8) | ❌ 0% | No mobile-specific panel implementation |
| NewsFlashBar integration | ⚠️ 60% | Added to AppShell, needs symbol-aware feed |

### Implementation Gap Analysis

**What's Done:**
- 5-zone CSS grid structure defined (top-bar, news, left-rail, chart-stage, ai-agent, status-bar)
- AIAgentPanel component with 5-tab structure (AI, ANL, SCN, JDG, PAT)
- Basic data loading for each tab (fetch `/api/captures`, `/api/patterns/recall`)
- Tab switching state management

**What's Missing:**
- **Inline vs Drawer Separation** (L1 vs L3): No visual distinction between summary cards and detail views
- **Data Wiring to Decision Tab**: DecisionHUD receives null; engine `/api/captures?pattern_slug=` response not integrated
- **Indicator Library**: 70+ indicator search UI, favorites, category tree, add/remove pane flow
- **Crosshair Multi-Pane Sync**: No rAF throttle implementation for X-axis sync across panes
- **Drag-to-Save Flow**: UI toast, pattern recall results visualization, AI overlay markers
- **Drawing Toolbar Integration**: Left-side toolbar UI, mode flag (`activeMode`), tool selection state
- **Chart Toolbar Enhancements**: Chart type dropdown, TF picker integration, Save Setup/Range buttons
- **Mobile Responsiveness**: Bottom-sheet layout, tab strip reorganization, touch-optimized drawing
- **Keyboard Shortcuts**: Tab nav (j/k), drawer open/close (E), TF quick-access (1-8)
- **Performance Metrics**: LCP/INP/CLS targets not verified

### User Impact (Why This Matters)

Current state creates **information asymmetry**:
- Design documents promise Bloomberg-tier density + clarity
- Frontend renders 5 tabs but without L1/L3 hierarchy → feels incomplete and cluttered
- Decision verdict (core signal) buried in ANL tab instead of prominent Decision tab
- No visual affordance that more detail is available (drawer isn't obvious)
- Mobile users see desktop layout → can't use effectively

**End Result**: Users don't trust the interface because it doesn't feel finished or coherent.

---

## 2. W-0374 Design Reference (Quick Index)

All citations refer to W-0374-cogochi-bloomberg-ux-restructure.md sections:

| Design Section | Key Spec | File Size | Status |
|---|---|---|---|
| §1 Inventory (145+ items) | Component + API + Indicator audit | Lines 21-284 | Reference |
| §2.1 Information Hierarchy (L1/L2/L3) | Miller's law, density rules | Lines 291-303 | **CRITICAL** |
| §2.2 Persona flow (Jin's journey) | Hub → zone → component mapping | Lines 304-315 | Reference |
| §2.3 Hub-1 Home | Dashboard redesign spec | Lines 318-330 | Defer to Phase E |
| §2.3 Hub-2 Terminal ⭐ | **5-zone + AI panel detail** | Lines 331-397 | **PRIMARY FOCUS** |
| §2.4 Chart UX (TradingView-grade) | Toolbar, TF picker, Drawing | Lines 401-500 | Phase D-2~D-5 |
| §2.5 AI Agent Panel | 5-tab structure + drawer | Lines 533-583 | Phase D-7 |
| §2.6 Info classification table | Where each data lives | Lines 585-614 | Reference |
| §3.1 Wireframe (ASCII diagram) | Visual hierarchy + spacing | Lines 656-693 | Reference |
| §3.4 Component → Zone mapping (100 items) | Canonical placement of every component | Lines 820-924 | **Checklist** |
| §6.4 Files touched (11 new, 17 modified, 12 deprecated) | Change scope | Lines 1107-1160 | Roadmap |
| §10 Implementation Plan (Phase D-0 ~ D-10) | 18-day roadmap, phases 2d each | Lines 1327-1404 | **Execution** |
| §11 Exit Criteria (AC1~AC30) | 30 acceptance criteria | Lines 1408-1440 | Validation |

---

## 3. Core Design Principles (Bloomberg + TradingView)

### 3.1 Information Hierarchy (L1/L2/L3) — Miller's Law

```
L1 (Always Visible — 7±2 items max)
├─ Identity: Symbol, Timeframe, Price, Wallet status
├─ Core action: Verdict (1 word), Direction badge (LONG/SHORT/AVOID)
└─ First impression: WatchlistRail, Chart canvas, TopBar

L2 (Peripheral Awareness — edges, strips, badges)
├─ Sparklines (rail, chart header)
├─ KPI strip (24h vol/OI/funding/dominance)
├─ FreshnessBadge (data age)
├─ NewsFlashBar (attribute priority)
└─ Status badges (F60 gate, system health)

L3 (On-Request — drawers, modals, sheets)
├─ Full evidence grid (Decision drawer)
├─ Pattern library detail (Pattern drawer)
├─ Indicator settings (PaneInfoBar ⚙ click)
├─ Research panel (Range select trigger)
└─ Full trade history (Judge drawer)
```

**Why This Matters**: Users experience **cognitive overload** if L1 + L2 + L3 are all visible. W-0374 spec mandates strict separation. Current implementation mixes them (e.g., inline cards without "→ Show more" affordance).

### 3.2 Visual Affordance (Action-to-UI Mapping)

| User Intent | Visual Cue | Interaction | Result |
|---|---|---|---|
| "I want to see my current verdict" | 1-word badge in Decision tab inline | Click = no-op; Drawer "→" = detail | Decision verdict + evidence |
| "Show me similar patterns" | Captured range color (blue rect) | Range drag-complete = toast | Toast: [Save] [Find Pattern] [Draft] |
| "I need fine-grained settings" | PaneInfoBar ⚙ icon | Click = sheet slide-up | IndicatorSettingsSheet |
| "Remind me when the opportunity comes back" | Row in VerdictInboxPanel | Click = expand → detail | Full VerdictCard + history |
| "Add RSI to my chart" | AI Search or ⌘L trigger | Type "RSI" = fuzzy match | IndicatorLibrary shows [RSI(14)] + [Add to Price] [+ New Pane] |

**W-0374 Requirement**: Every L1 inline card **must** have a "→ Show more" affordance or expand button. Currently missing.

### 3.3 Component Identity (Bloomberg Terminal Style)

Every component claims one responsibility in one zone:

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar (48px) — IDENTITY STRIP                              │
│ [⌘K Search] [Symbol] [TF picker] [Wallet dot] [Mode ▾]     │
├─────────────────────────────────────────────────────────────┤
│ NewsFlashBar (28px, dismissable) — NEWS ALERTS              │
│ "BTC ETF flow +$420M"  [×]                                  │
├────┬────┬──────────────────────────────────┬────────────────┤
│ 🔖  │ ✏  │ CHART (MultiPaneChart)           │ AI PANEL      │
│    │    │                                   │ (5-tab)       │
│ 📊  │ ─  ├──────────────────────────────────┤ ┌─────────────┤
│ 🐋  │ ◻  │ Pane 1: Price                    │ │ Decision    │
│    │    │ Pane 2: RSI(14)                   │ │ • verdict   │
│    │    │ Pane 3: OI 4h                     │ │ • evidence3 │
│    │    │                                   │ │ → Show more │
│    │    │ crosshair sync ↔ PaneInfoBar      │ └─────────────┘
│ +  │ 🗑  │                                   │               │
├────┴────┴──────────────────────────────────┴────────────────┤
│ StatusBar (32px)                                             │
│ F60 mini | Freshness | mini Verdict | System health        │
└─────────────────────────────────────────────────────────────┘

Zones:
- Left Rail (56px fold ↔ 200px expand): WatchlistRail + Whales
- Drawing Toolbar (40px): 7 tools (Trend, HLine, Rect, Fib, Pitchfork, Text, Note)
- Chart Stage (flex): MultiPaneChart + ChartToolbar + IndicatorPaneStack
- Right Panel (320px default ↔ 480px expanded): AIAgentPanel 5-tab
- Drawer (320px side-slide from right panel)
```

---

## 4. Page-by-Page Design (P-01 ~ P-09) — Phase D-0 ~ D-10

### P-01 Hub-2 Terminal / Cogochi — Main Canvas

**Route**: `/cogochi?symbol=BTCUSDT&tf=1h&panel=decision`

#### 4.1.1 Top Bar (48px, global, persistent)

**Components**:
- Left: `⌘K` symbol search (CommandBar, trigger → SymbolPicker)
- Center-left: Active symbol + 24h change badge
- Center: Timeframe picker (8 buttons: 1m/3m/5m/15m/30m/1h/4h/1D)
- Right: Wallet status dot (with tooltip), Tier badge, Mode selector (Trade/Train/Radial)

**Data Requirements**:
- `symbol`: string (BTCUSDT default)
- `timeframe`: Timeframe union (default 1h)
- `wallet.balance`: number (for tooltip)
- `wallet.tier`: 'free' | 'pro' | 'enterprise'

**Visual**:
```
┌──────────────────────────────────────────────────────────────┐
│ [⌘K Search] BTC/USDT +1.2%/24h | [1m][3m][5m]… [4h][1D]    │
│                                 | Keyboard: 1-8              │
│                                         🔵Pro [Trade▾]       │
└──────────────────────────────────────────────────────────────┘
```

**Keyboard Shortcuts**:
- ⌘K: Open symbol search
- 1-8: Switch timeframe (1m, 3m, 5m, 15m, 30m, 1h, 4h, 1D)
- M: Open mode picker

**Acceptance Criteria**:
- AC1: Symbol search instant (debounce 100ms)
- AC2: TF change ≤ 500ms kline load (LCP p75)
- AC3: 24h % updates on symbol change (from `/api/chart/klines`)

---

#### 4.1.2 News Flash Bar (28px, dismissable)

**Component**: `NewsFlashBar.svelte` (new or extended)

**Data Source**: `/api/cogochi/news` (symbol-aware, top 1 active)

**Content**:
- Title: "BTC ETF flow +$420M in 3h"
- Dismiss button: ✕ (hides for 30min or until new event)
- Auto-dismiss: 5s if no new events

**Visual**:
```
┌──────────────────────────────────────────────────────────────┐
│ 📰 BTC ETF flow +$420M in 3h (source: Coinglass)            [×]
└──────────────────────────────────────────────────────────────┘
```

**Acceptance Criteria**:
- AC4: News fetch ≤ 2s on page load
- AC5: Dismissable (localStorage + 30min throttle)
- AC6: New event pushes new bar (no duplicate)

---

#### 4.1.3 Left Rail (56px fold ↔ 200px expand)

**Component**: `WatchlistRail.svelte` (extended)

**Sections**:
1. **Toggle button**: ⤢/⤡ (fold/expand, stored in localStorage)
2. **Watchlist items** (folded: symbol only; expanded: symbol + sparkline + 24h %)
3. **Add button**: + (open SymbolPickerSheet)
4. **Whales section** (collapsed by default, expandable)

**Data**:
- Watchlist: from `/api/preferences?key=watchlist`
- Sparklines: 30d mini chart (from `/api/chart/klines?symbol&tf=1D`)
- Whale data: from `/api/cogochi/whales`

**Folded View** (56px):
```
├─ ⤢ (expand button)
├─ [BTC] ← clickable, instant load
├─ [ETH]
├─ [SOL]
├─ [+] ← add symbol
└─ 🐋 (whale alerts, collapsed)
```

**Expanded View** (200px):
```
├─ ⤡ (collapse button)
├─ ★ BTC
│  $95k  ▁▂▄▆█ +1.2%
├─ ★ ETH
│  $3.2k ▁▃▅▆█ +0.8%
├─ ★ SOL
│  $145  ▁▂▃▅▄ -0.3%
├─ [+ Add symbol]
├─────────────
├─ 🐋 Whales (3 alerts)
│  ├─ Bybit: +40K BTC
│  ├─ Binance: -15K ETH
│  └─ Kraken: +2M USDC
└─────────────
```

**Acceptance Criteria**:
- AC7: Fold/expand toggle persists (localStorage `cogochi.watchlist.folded`)
- AC8: Symbol click instant-switch (≤ 100ms chart load)
- AC9: Whale alerts fetch on expand (≤ 1s)
- AC10: Sparkline render ≤ 200ms per symbol (lightweight-charts mini)

---

#### 4.1.4 Drawing Toolbar (40px, left vertical)

**Component**: `DrawingToolbar.svelte` (wired to DrawingManager)

**Tools** (left to right, vertically stacked):
1. ☐ Select (pointer mode)
2. ╱ Trend line
3. ─ Horizontal line
4. ▭ Rectangle
5. Φ Fibonacci retracement
6. ╱╱ Pitchfork
7. T Text annotation
8. 📝 Note (multi-line)

**Bottom Section**:
- ⤴ Undo
- ⤵ Redo
- 🗑 Clear all

**Mode Flag**:
- `chart.activeMode = 'idle' | 'drawing' | 'save-range'`
- Only one mode active at a time (prevents drag-to-save race)

**Visual**:
```
┌──┐
│ ☐│ select (default)
│ ╱│ trend line (T shortcut)
│ ─│ h-line (H)
│ ▭│ rectangle (R)
│ Φ│ fibonacci (F)
│╱╱│ pitchfork (P)
│ T│ text (Shift+T)
│📝│ note (Shift+N)
├──┤
│ ⤴│ undo (Z)
│ ⤵│ redo (Shift+Z)
│ 🗑│ clear (Shift+C)
└──┘
```

**Acceptance Criteria**:
- AC11: Tool activation instant (no lag on click)
- AC12: Keyboard shortcuts responsive (≤ 50ms)
- AC13: Drawing persistence (localStorage MVP; DB future)
- AC14: Undo/redo stack depth ≥ 50 actions

---

#### 4.1.5 Chart Stage (flex, center)

**Components**:
- `ChartToolbar.svelte` (36px top)
- `MultiPaneChart.svelte` (main)
- `IndicatorPaneStack.svelte` (sub-panes)
- `DrawingCanvas.svelte` (overlay)
- `ChartSaveMode` toast (on drag-complete)

##### 4.1.5.1 Chart Toolbar (36px)

**Layout**:
```
[Candle▾] [+ Indicator] [Drawing▾] [Replay] [Snapshot] [⚙ Settings] ⟶ [Save Setup] [Save Range]
```

**Controls**:
1. **Chart Type** dropdown: Candle (default) / Line / Heikin-Ashi / Bar / Area
   - Binds to `shell.chartType`
   - Affects `MultiPaneChart.svelte` candle renderer
2. **+ Indicator** button: Opens left-slide IndicatorLibrary panel (⌘L)
3. **Drawing** dropdown: Selects tool from DrawingToolbar (visual sync)
4. **Replay** button: (Future) Playback mode
5. **Snapshot** button: (Future) dom-to-image screenshot
6. **⚙ Settings** button: Opens IndicatorSettingsSheet for active pane
7. **Save Setup** button: SaveSetupModal (captures drawing + indicators)
8. **Save Range** button: Saves current visible range

**Data Binding**:
- `chartType`: from shell.store
- `toolActive`: from DrawingManager.activeTool
- `settingsPane`: from paneIndicators.activePaneId

**Acceptance Criteria**:
- AC15: Chart type change ≤ 100ms re-render
- AC16: Indicator library opens ≤ 200ms (sidebar slide)
- AC17: Settings sheet loads pane config instantly

---

##### 4.1.5.2 Multi-Pane Chart (flex, flex)

**Component**: `MultiPaneChart.svelte` (existing, needs extensions)

**Panes**:
1. Price pane (50% height, candle/line/HA/bar/area)
   - OHLCV values, volume (always visible)
   - 2-4 overlay indicators (SMA, EMA, etc.)
2. Indicator panes (25% each, max 5, sub-panes)
   - RSI, MACD, Bollinger Bands, OI, Funding, etc.
   - Per-pane PaneInfoBar header

**Features**:
- **Crosshair sync** (X-axis only, rAF throttle @ 60fps)
  - All panes follow same time coordinate
  - Each pane updates PaneInfoBar values independently
- **AI overlay** layer (above drawing, below crosshair)
  - Claude-style lines, ranges, arrows, annotations
- **Drawing canvas** (above AI overlay)
- **PaneInfoBar** (24px, left of each pane)
  - Indicator name + params + current value
  - ⚙ click → IndicatorSettingsSheet
  - ✕ click → remove pane (disabled for price pane)

**Data Requirements**:
- `klines`: OHLCV[] from `/api/chart/klines?symbol&tf`
- `indicators`: map of indicatorId → values[] (from `/api/chart/feed?indicator`)
- `aiOverlay`: AIPriceLine[] | AIRangeBox[] | AIArrow[] | AIAnnotation[]
- `drawings`: DrawingItem[] (from DrawingManager)
- `crosshairTime`: number (sync across all panes)

**Performance Targets**:
- LCP: ≤ 2.5s (cold load, p75)
- INP: ≤ 200ms (tab switch, drawer expand, TF change)
- CLS: 0 (no layout shifts)
- Memory: mode toggle 5x → RSS Δ ≤ 5MB (no lightweight-charts leaks)

**Acceptance Criteria**:
- AC18: Multi-pane crosshair X-sync ≥ 60fps (rAF throttle)
- AC19: Indicator sub-pane add/remove instant (≤ 100ms)
- AC20: OHLCV crosshair info updates in real-time (≤ 50ms latency)
- AC21: 5 sub-panes + drawing tools + AI overlay simultaneously (no visual lag)

---

#### 4.1.6 AI Agent Panel (320px default ↔ 480px expanded)

**Component**: `AIAgentPanel.svelte` (5-tab structure)

**Tabs** (left to right):
1. **Decision (AI)** — Verdict + evidence preview + "→ Show more"
2. **Analyze (ANL)** — Verdict inbox (watch hits, review, recent closed)
3. **Scan (SCN)** — Scanner alerts + similar pattern grid
4. **Judge (JDG)** — Trade judgment cards + re-label UI
5. **Pattern (PAT)** — Capture history, filter by symbol/verdict, keyboard nav

**Tab Switching**:
- Click tab → instant switch (no loading state for cached tabs)
- Keyboard: `j` = next tab, `k` = prev tab (vim-style)

**Panel Layout**:
```
┌────────────────────────────────────────┐
│ [AI] [ANL] [SCN] [JDG] [PAT]    [⤢]    │ ← 28px tab bar
├────────────────────────────────────────┤
│ AI Search Input ⌘L                     │ ← 40px sticky
│ [────────────────────────────────]     │
├────────────────────────────────────────┤
│ Active Tab Content (scrollable)        │ ← flex, L1 inline
│                                        │
│ • Inline summary card 1                │
│ • Inline summary card 2                │
│ • "→ Show more" affordance             │
│                                        │
│ ...                                    │
└────────────────────────────────────────┘

Expand (⤢ → ⤡):
  320px → 480px (drawer slides in from right)
  
  ┌────────────────┬──────────────────┐
  │ Inline content │ Drawer detail    │
  │ (320px)        │ (160px new)      │
  └────────────────┴──────────────────┘
```

##### 4.1.6.1 Decision Tab (AI) — L1/L3 Split

**L1 (Inline, 320px)**:
```
┌─ Decision ─────────────────┐
│ Verdict: BULLISH           │
│                            │
│ Evidence (top 3):          │
│ • RSI(14) = 65.4 (overbuy) │
│ • OI +5.2% (increasing)    │
│ • Funding +0.08% (positive)│
│                            │
│ [→ Show full evidence]     │ ← Opens drawer
└────────────────────────────┘
```

**Data Source**:
- `/api/captures?pattern_slug={slug}` (if active pattern)
  - Returns: `{ verdict, evidence[], sources[], p_win, blocks_triggered }`
  - Calls engine analyze endpoint under hood

**L3 (Drawer, expand)**:
```
┌─ Full Evidence ─────────────────────┐
│ Verdict: BULLISH (p_win: 0.73)      │
├─────────────────────────────────────┤
│ Evidence Grid (all):                │
│ ┌────────┬─────┬──────────────────┐ │
│ │ Source │Type │ Signal           │ │
│ ├────────┼─────┼──────────────────┤ │
│ │ RSI(14)│Tech │ 65.4 (overbuy)   │ │
│ │ OI 4h  │Deriv│ +5.2% (↑)        │ │
│ │ Funding│Deriv│ +0.08% (bullish) │ │
│ │ MACD   │Tech │ bullish cross    │ │
│ │ Whale  │Onch │ +15K bought 5m   │ │
│ └────────┴─────┴──────────────────┘ │
│                                     │
│ Why Bullish (breakdown):            │
│ └─ 4 bullish signals                │
│ └─ 1 neutral signal                 │
│ └─ RSI overbuy mitigated by OI rise │
│                                     │
│ Structure (if pattern matched):     │
│ └─ Breakout test of $95,500         │
│ └─ On elevated volume               │
│ └─ Similar to 2026-04-20 (+3.2% 4h)│
│                                     │
│ F-60 Gate: ░░░░░░ 0.73 (PASS)      │
└─────────────────────────────────────┘

Controls:
- Esc to close
- [Run Decision Now] button (top-right)
  → Re-fetches `/api/captures` + updates verdict
- [+ Add to Watchlist] button
```

**Components Needed**:
- `LiveDecisionHUD.svelte` (inline verdict + 3 evidence)
- `EvidenceGrid.svelte` (drawer, full list)
- `WhyPanel.svelte` (reason breakdown)
- `StructureExplainViz.svelte` (pattern explanation if matched)
- `F60GateBar.svelte` (mini version, shows in drawer)

**Keyboard Shortcuts**:
- `e` = expand drawer (when tab active, drawer closed)
- `Esc` = collapse drawer (priority over chart Esc)
- `↓` / `↑` = scroll evidence

**Acceptance Criteria**:
- AC22: Decision verdict displays within 200ms of tab switch
- AC23: Drawer expand animation smooth (200ms ease-out)
- AC24: Evidence grid virtual-scroll 100+ items @ 60fps
- AC25: "Run Decision Now" re-fetch ≤ 1s (with spinner)

---

##### 4.1.6.2 Analyze Tab (ANL) — Verdict Inbox

**L1 (Inline, 320px)**:
```
┌─ Analyze ──────────────────┐
│ Watch Hits (10 active):    │
│                            │
│ • BTC Long breach 14:32    │
│   RSI > 70 triggered       │
│   Price: $96,000           │
│   [→ Review]               │
│                            │
│ • ETH Short setup 13:01    │
│   MACD cross detected      │
│   Price: $3,200            │
│   [→ Review]               │
│                            │
│ [Load more verdicts...]    │
└────────────────────────────┘
```

**Data Source**:
- `/api/cogochi/alerts` or `/api/captures?verdict_type=watch_hit` (real-time SSE)

**L3 (Drawer, expand)**:
```
Full VerdictCard:
- Title: "BTC Long breach"
- Verdict icon: ➜ (direction)
- Price at alert: $96,000
- Current price: $95,800 (-0.2%)
- Return on entry: +0.2% if taken
- Time alive: 2h 14m
- Status: OPEN, PASSED, CLOSED, MISSED

[Review] [Close] [Replay] buttons
```

**Components**:
- `VerdictInboxPanel.svelte` (inline list)
- `VerdictCard.svelte` (drawer detail)
- `VerdictBanner.svelte` (if newly triggered during session)

**Acceptance Criteria**:
- AC26: Verdict fetch ≤ 500ms on tab switch
- AC27: Verdict list virtual-scroll 100+ items
- AC28: Drawer opens verdict detail within 100ms of click

---

##### 4.1.6.3 Scan Tab (SCN) — Scanner Alerts

**L1 (Inline, 320px)**:
```
┌─ Scan ─────────────────────┐
│ Scanner Alerts (8):        │
│                            │
│ Grid:                      │
│ [BTC] [ETH] [SOL] [OP]    │
│ [ARB] [LDO] [APE] [PEPE]  │
│                            │
│ Similar Patterns (for      │
│ active symbol BTC):        │
│ • 2026-04-20 1h +3.2% 4h  │
│ • 2026-03-15 4h +5.1% 24h │
│ • 2026-02-01 1h +2.8% 4h  │
│                            │
│ [→ See all matches]        │
└────────────────────────────┘
```

**Data Sources**:
- Scanner: `/api/captures?trigger_origin=scanner&limit=50`
- Similar: `/api/patterns/recall?symbol={active}&limit=5`

**L3 (Drawer, expand)**:
```
ScanGrid full:
- Alerts grid (larger)
- Similar matches (full list)
- Pattern cards with outcome %
```

**Components**:
- `ScanGrid.svelte` (existing, inline + drawer modes)

**Acceptance Criteria**:
- AC29: Scanner alerts fetch ≤ 1s on tab switch
- AC30: Similar patterns grid render ≤ 200ms

---

##### 4.1.6.4 Judge Tab (JDG) — Trade Judgment

**L1 (Inline, 320px)**:
```
┌─ Judge ────────────────────┐
│ Recent Trade Judgments:    │
│                            │
│ • LONG BTC @ $96k 2h ago  │
│   Status: OPEN            │
│   Entry: $96,000          │
│   Current: $95,800 (-0.2%)│
│   P&L: -$200              │
│   [→ Details]             │
│                            │
│ • SHORT ETH @ $3.2k 1d ago│
│   Status: CLOSED (+3.2%)  │
│   [→ Re-label]            │
│                            │
│ [+ New Judgment] button    │
└────────────────────────────┘
```

**Data Source**:
- `/api/captures?judgment=true&limit=20`
- `/api/cogochi/outcome` (entry/exit tracking)

**L3 (Drawer, expand)**:
```
JudgePanel full:
- Trade entry details
- Current P&L
- [Close Trade] button
- [Re-label verdict] input + [Save]
- Historical outcomes
```

**Components**:
- `JudgePanel.svelte` (existing, inline + drawer modes)

**Acceptance Criteria**:
- AC31: Judgment cards load ≤ 500ms
- AC32: [Close Trade] action ≤ 1s (POST to engine)
- AC33: Re-label verdict updates immediately

---

##### 4.1.6.5 Pattern Tab (PAT) — Capture History

**L1 (Inline, 320px)**:
```
┌─ Pattern ──────────────────┐
│ [🔍 filter symbol/slug...] │
│                            │
│ [ALL] [BULL] [BEAR]        │ ← chips
│                            │
│ Captures (↑↓ nav, Enter):  │
│ • BTC 1h bull_breakout     │ ← selected (amber left border)
│   BULL  @ 2h ago           │
│ • ETH 4h reversal_zone     │
│   BEAR  @ 4h ago           │
│ • SOL 5m range_bound       │
│   ——    @ 1d ago           │
│                            │
│ [→ Open chart for this]    │
└────────────────────────────┘
```

**Keyboard Navigation**:
- ↓ = next capture
- ↑ = prev capture
- Enter = open capture (chart + Decision tab)
- Chip click = filter by verdict

**Data Source**:
- `/api/captures?limit=100` (loaded on tab first-click)
- Filtered client-side (symbol + verdict)

**L3 (Drawer, expand)**:
- PatternLibrary full view
- Pattern detail card
- Outcomes history

**Components**:
- PAT tab inline (custom, in AIAgentPanel)
- `PatternLibraryPanel.svelte` (drawer)

**Acceptance Criteria**:
- AC34: Capture list loads ≤ 500ms on first tab switch
- AC35: Keyboard nav responsive (↑↓ no lag)
- AC36: Enter opens chart ≤ 200ms

---

##### 4.1.6.6 AI Search Input (40px, sticky top)

**Component**: `CommandBar.svelte` variant (in AIAgentPanel)

**Input**:
```
┌────────────────────────────────────────┐
│ [🔍 Show me OI 4h...] [Enter]          │
└────────────────────────────────────────┘
```

**Query Router** (`aiQueryRouter.ts`):

| Query Pattern | Intent | Action |
|---|---|---|
| "Show me OI 4h" | add indicator | `POST /api/chart/feed` → IndicatorPaneStack |
| "Find similar pattern" | pattern recall | `POST /api/patterns/recall` + AIRangeBox marker |
| "5m candle" | TF change | Update `shell.timeframe` → kline reload |
| "BTC 96000 support" | AI overlay | `setAIOverlay(AIPriceLine)` |
| "Last whale alerts" | data fetch | `GET /api/cogochi/whales` → drawer table |
| "Should I go long now?" | analyze | `POST /api/cogochi/analyze` → Decision tab refresh |

**Acceptance Criteria**:
- AC37: Query debounce 100ms (no API spam)
- AC38: Intent detection 6+ patterns (table above)
- AC39: Result rendered in active tab inline card ≤ 500ms

---

#### 4.1.7 Status Bar (32px, bottom)

**Layout**:
```
F60 mini ▓▓▓▓░ | Freshness 14s | mini Verdict WAIT | System health ●●●● OK
```

**Sections**:
1. **F60 Gate** (mini): Bar chart visualization + number (0.73)
   - Hover → full F60GateBar explanation in tooltip
2. **Data Freshness**: "14s" = most stale datapoint age
3. **Mini Verdict**: 1-word status (BULLISH/BEARISH/WAIT/ERROR)
4. **System Health**: Dots (●●●● green = all systems nominal)
   - Hover → health details

**Acceptance Criteria**:
- AC40: F60 gate updates ≤ 1s
- AC41: Freshness badge reflects worst datapoint (≤ 5s lag)
- AC42: Mini verdict syncs with Decision tab inline (no desync)

---

### P-02 Hub-1 Home Dashboard

**Route**: `/dashboard`

**Defer**: Phase D-0 skeleton + Phase E full implementation

**Sketch**:
```
Hero: Wallet $5,420 | Passport: Pro | WATCHING: 3 active
KpiStrip: 24h PnL +2.3% | Patterns 5 | Watch Hits 12 | KP Score 0.73
─────────────────────────────────────
WATCHING (50%)              KimchiPremium (50%)
VerdictInboxPanel (compact) Large badge + 30d chart
─────────────────────────────────────
Opportunity Score (top 10, ScanGrid)
─────────────────────────────────────
[Open Terminal →] sticky button (top-right)
```

---

### P-03 Hub-3 Patterns Library

**Route**: `/patterns/[tab]?filter=`

**5 Tabs**:
1. Library: Category tree | Grid (3 columns) | Detail (320px right)
2. Strategies: List | Cards | Detail
3. Benchmark: Multi-select | Comparison chart | Metric table
4. Lifecycle: Stage filter | Funnel chart | Stage detail
5. Search: Query input + facets | Results list | Detail

**Defer**: Phase E (after Hub-2 baseline)

---

### P-04 Hub-4 Lab

**Route**: `/lab/[tab]`

**3 Tabs**:
1. Backtest: Param form (320px) | Results chart | Metric panel + trades
2. AI Analysis: Query input + history | Results (markdown) | Sources
3. PineScript: Template picker | Code editor | Preview/export

**Defer**: Phase E

---

### P-05 Hub-5 Settings

**Route**: `/settings/[tab]`

**3 Tabs**:
1. Settings: Category tree (200px) | Form | (unused)
2. Passport: Level + track record | Stats grid | Progression
3. Status: System map | Health grid | Logs (280px right)

**Defer**: Phase E

---

## 5. kieran.ai Integration — Decision Tracking

### 5.1 Counterfactual Review (Lab > Counterfactual Tab)

**Pattern**: Record what *didn't* happen, check outcome later.

**UI Flow**:
1. User captures range (drag-to-save on chart)
2. Toast: [Save] [Find Pattern] [Draft Setup]
3. If [Find Pattern] → Pattern recall API returns matches
4. Each match card shows: "Similar pattern 2026-04-20 1h: +3.2% in 4h"
5. User tags: "This would have been LONG entry"
6. Decision deferred (not executed yet)
7. 4 hours later: Compare actual return (+3.2%?) vs blocked candidate (-0.5%)
8. Outcome logged to `blocked_reason_ledger` table

**Components**:
- `DraftFromRangePanel.svelte` (range selector)
- `CounterfactualReviewCard.svelte` (outcome comparison, new)
- `BlockedCandidateLedger.svelte` (ledger table, new)

**Acceptance Criteria**:
- AC43: Counterfactual capture ≤ 500ms
- AC44: Outcome logged ≤ 1s (async to engine)
- AC45: Review ledger shows ≥ 10 blocked candidates per symbol

---

### 5.2 Filter Drag Attribution (Patterns > Filter Drag Tab)

**Pattern**: Which filters are costing alpha?

**UI**: Heatmap-style chart
```
┌─────────────────────────────┐
│ Filter Alpha Loss (30d)     │
│                             │
│ Filter              | Loss  │
│ ─────────────────────────── │
│ RSI > 70 (overbuy reject)  │ -2.3%
│ MACD bearish cross reject   │ -0.8%
│ Funding > +0.1% skip        │ +0.2%
│ Whale size < 1M reject      │ -1.5%
│                             │
│ [Adjust filters] [Backtest] │
└─────────────────────────────┘
```

**Data Source**: `filter_attribution` table (computed nightly)

**Acceptance Criteria**:
- AC46: Filter drag computed daily
- AC47: Attribution chart ≤ 500ms load

---

### 5.3 Formula Ledger (Patterns > Formula Ledger)

**Pattern**: Drill into thresholds, exit rules, position sizing.

**UI**: Hierarchy breakdown
```
Strategy: Bull Breakout
├─ Entry Rule: Close > 20-day high + Volume > 1.5x avg
│  ├─ Threshold: 20-day = $95,200 (accuracy: 73%)
│  └─ Volume multiple: 1.5 (tuning: +1% alpha @ 1.4, -0.5% @ 1.6)
├─ Exit Rule: Stop @ Entry - 2% OR Take profit @ Entry + 5%
│  ├─ Stop placement: -2% (optimal range: -1.5% to -3%)
│  └─ TP placement: +5% (hit rate: 42%)
└─ Position Size: 1% risk
   └─ Kelly: 0.8 (confidence: 73% × 2.2 ratio = optimal 0.8)
```

**Acceptance Criteria**:
- AC48: Formula ledger drill ≤ 200ms per level
- AC49: Threshold optimization suggestions (A/B tested)

---

## 6. Detailed Component Specifications

### 6.1 IndicatorLibrary.svelte (Phase D-3)

**Trigger**: `⌘L` or `+ Indicator` button in ChartToolbar

**Panel Size**: 320px (left slide-in)

**Structure**:
```
Header (sticky):
├─ 🔍 Search input (debounce 100ms)
├─ Results: {n} of {total}
├─ [Clear] button

Favorites (if ≥1):
├─ ☆ Favorites ({count})
├─ ✓ SMA(20)
├─ ✓ RSI(14)
├─ ...
├─ [Unfavorite all]

Categories (collapsed by default, 1 open):
├─ ▼ OI ({3})
│  ├─ ☐ OI Change 1h
│  ├─ ☐ OI Change 4h
│  └─ ☐ OI per Venue
├─ ▶ Funding ({4})
│  ├─ ☐ Funding Rate
│  ├─ ☐ Predicted Funding
│  └─ ...
├─ ▶ On-chain ({21})
├─ ▶ Derivatives ({7})
├─ ▶ DeFi ({10})
├─ ▶ Technical ({25})
└─ ▶ Custom ({n})

Selection Counter (sticky bottom):
├─ Selected: {count}
├─ [Add to Price Pane] button (adds to price pane overlay)
└─ [+ New Pane] button (creates sub-pane)
```

**Data Binding**:
- Search: fuzzy match on `aiSynonyms` (English + Korean)
- Favorites: localStorage `cogochi.indicator.favorites` (JSONified array)
- Selection: client-side multiselect set

**Keyboard Shortcuts**:
- ↓/↑: navigate options
- Enter: toggle selected
- Space: toggle favorite (if selected)
- Esc: close panel

**Acceptance Criteria**:
- AC50: Indicator search instant (debounce 100ms, ≤ 50ms match)
- AC51: Category expand/collapse ≤ 100ms
- AC52: Favorites persist (localStorage)
- AC53: Add to pane ≤ 200ms (fetch indicator values + render)

---

### 6.2 MultiPaneChart.svelte Extensions (Phase D-5)

**Crosshair Sync (rAF throttle)**:

```typescript
// pseudocode
let lastSyncTime = 0;
const THROTTLE_MS = 16; // 60fps

function onChartCrosshairMove(time: number, price: number) {
  const now = Date.now();
  if (now - lastSyncTime < THROTTLE_MS) return;
  lastSyncTime = now;

  // Update all panes' crosshair.time
  panes.forEach(pane => {
    pane.setCrosshairPosition(time);
    pane.updatePaneInfoBar(time); // current OHLC + indicator value
  });
}

// Use RAF for smoothness
requestAnimationFrame(() => onChartCrosshairMove(...));
```

**Acceptance Criteria**:
- AC54: Crosshair sync ≥ 60fps (measured via PerformanceObserver)
- AC55: PaneInfoBar updates ≤ 50ms latency

---

### 6.3 Drag-to-Save Flow (Phase D-6)

**Trigger**: User mousedown → mousemove → mouseup on chart

**State Machine**:
```
idle
  ↓ mousedown (on chart canvas)
drawing-or-saving (depends on chart.activeMode flag)
  ├─ activeMode = 'drawing' → DrawingManager captures
  └─ activeMode = 'save-range' → range capture
    ↓ mousemove (show blue rect overlay)
  save-range-active
    ↓ mouseup (show toast)
  toast-visible (5 sec auto-hide)
    ├─ [Save] → POST /api/captures
    ├─ [Find Pattern] → POST /api/patterns/recall
    ├─ [Draft Setup] → open DraftFromRangePanel
    └─ [Cancel] → clear range
```

**Toast UI**:
```
┌─ Range captured: 2026-04-30 14:00 → 16:00 (BTC 5m) ─┐
│ [Save] [Find Pattern] [Draft Setup] [Cancel]        │
└────────────────────────────────────────────────────┘
```

**POST /api/captures**:
```json
{
  "symbol": "BTCUSDT",
  "timeframe": "5m",
  "start_time_ms": 1715000000,
  "end_time_ms": 1715003600,
  "label": "user-input optional"
}
```

**Acceptance Criteria**:
- AC56: Toast appears ≤ 100ms after mouseup
- AC57: [Find Pattern] recall ≤ 500ms (p75)
- AC58: [Draft Setup] opens drawer ≤ 200ms

---

## 7. Data Flow Diagram (Inline vs Drawer)

```
User Action
  ↓
Inline Card (L1)
  ├─ Summary verdict/insight
  ├─ Key metric (1-3 values)
  ├─ Status badge
  └─ [→ Show more] affordance
    ↓ click
Drawer Slide (L3, 320px from right)
  ├─ Full evidence grid / chart / table
  ├─ [Back] / [Esc] to close
  └─ Secondary actions
```

**Example: Decision Tab**

| Level | Component | Content | Action |
|---|---|---|---|
| L1 | LiveDecisionHUD inline | Verdict badge + top 3 evidence | Click "→" |
| L3 | EvidenceGrid drawer | All 10+ evidence items | Click item for details |
| L3 | WhyPanel drawer | Reasoning breakdown | N/A |
| L3 | StructureExplainViz drawer | Pattern explanation if matched | N/A |

---

## 8. Keyboard Shortcut Master List

| Shortcut | Action | Context |
|---|---|---|
| ⌘K | Open symbol search | Global |
| ⌘L | Open indicator library | Hub-2 |
| 1-8 | Switch timeframe (1m-1D) | Hub-2 chart |
| j/k | Tab navigation (↓/↑) | Hub-2 AI panel |
| e | Expand drawer | Hub-2 AI panel, drawer closed |
| Esc | Close drawer (priority) | Hub-2 AI panel, drawer open |
| E | Toggle left-rail fold | Hub-2 |
| M | Open mode picker | Global |
| T | Activate trend line | Hub-2 drawing |
| H | Activate h-line | Hub-2 drawing |
| R | Activate rectangle | Hub-2 drawing |
| F | Activate fibonacci | Hub-2 drawing |
| P | Activate pitchfork | Hub-2 drawing |
| Shift+T | Activate text tool | Hub-2 drawing |
| Shift+N | Activate note tool | Hub-2 drawing |
| Z | Undo drawing | Hub-2 drawing |
| Shift+Z | Redo drawing | Hub-2 drawing |
| Shift+C | Clear all drawings | Hub-2 drawing |
| ↓/↑ | Navigate list items | Hub-2 tabs (PAT, ANL, etc.) |
| Enter | Select/open item | Hub-2 tabs (PAT, ANL, etc.) |

---

## 9. Acceptance Criteria Master (AC1~AC60)

**Performance**:
- AC1: Symbol search instant (≤ 100ms)
- AC2: TF change kline load ≤ 500ms (p75)
- AC3: 24h % updates on symbol change
- AC10: LCP ≤ 2.5s (Hub-2 cold load, p75)
- AC11: INP ≤ 200ms (tab switch, drawer, TF change)
- AC12: CLS = 0 (no layout shifts)

**UI/UX**:
- AC18: Multi-pane crosshair X-sync ≥ 60fps
- AC19: Indicator pane add/remove ≤ 100ms
- AC20: OHLCV crosshair info real-time (≤ 50ms)
- AC23: Drawer expand animation smooth (200ms ease-out)
- AC34: Capture list load ≤ 500ms (first tab switch)
- AC40: F60 gate update ≤ 1s
- AC42: Mini verdict syncs Decision tab (no desync)

**Data**:
- AC22: Decision verdict display ≤ 200ms of tab switch
- AC26: Verdict fetch ≤ 500ms on tab switch
- AC37: AI query debounce 100ms
- AC39: Result render in tab ≤ 500ms
- AC45: Outcome logged ≤ 1s (async)

**Mobile**:
- AC17: Mobile bottom-sheet 5-tab working (≤ 768px)

**Memory/Stability**:
- AC16: Memory toggle 5x → RSS Δ ≤ 5MB (no leaks)

---

## 10. Execution Roadmap (Phase D-0 ~ D-10)

### Phase D-0 (2 days) — Layout Grid Skeleton

**Files**:
- NEW: `TopBar.svelte`
- MODIFY: `AppShell.svelte` (CSS grid zone + 5-zone names)
- MODIFY: `shell.store` (extend fields)

**Deliverables**:
- 5-zone grid visible (top-bar 48px, news 28px, body 1fr, status 32px)
- TopBar renders (symbol search placeholder, TF picker, wallet dot, mode toggle)
- Design tokens file created (colors, spacing, radius)

---

### Phase D-1 (1 day) — WatchlistRail Polish

**Files**:
- MODIFY: `WatchlistRail.svelte`

**Deliverables**:
- Fold toggle (56px ↔ 200px)
- Sparklines per symbol
- Whale section expandable
- Supabase sync (5s max delay)

---

### Phase D-2 (1.5 days) — Chart Toolbar + TF Picker

**Files**:
- MODIFY: `ChartToolbar.svelte`
- MODIFY: `TopBar.svelte` (TF picker moved here)

**Deliverables**:
- Chart type dropdown (Candle/Line/HA/Bar/Area)
- TF picker 8 buttons with keyboard shortcuts (1-8)
- Save Setup / Save Range buttons

---

### Phase D-3 (2 days) — Indicator Library + Pane Stack

**Files**:
- NEW: `IndicatorLibrary.svelte`
- MODIFY: `ChartToolbar.svelte` (+ Indicator trigger)
- MODIFY: `PaneInfoBar.svelte` (⚙ settings button)

**Deliverables**:
- Library panel (search, favorites, categories)
- Add to price pane or new sub-pane flows
- Pane add/remove with max 5 sub-panes

---

### Phase D-4 (1 day) — Drawing Toolbar Integration

**Files**:
- MODIFY: `DrawingToolbar.svelte` (UI refresh + mode flag)
- MODIFY: `MultiPaneChart.svelte` (mode flag check)

**Deliverables**:
- Left vertical toolbar visible
- Tool selection state management
- Undo/redo functional

---

### Phase D-5 (1.5 days) — Crosshair Sync + AI Overlay

**Files**:
- MODIFY: `MultiPaneChart.svelte` (rAF throttle, crosshair sync)
- MODIFY: `chartAIOverlay.ts` (extend types: AIRangeBox, AIArrow, AIAnnotation)

**Deliverables**:
- Multi-pane X-axis sync @ 60fps
- PaneInfoBar values update with crosshair
- AI overlay layer (line, range, arrow, annotation)

---

### Phase D-6 (2 days) — Drag-to-Save + Pattern Recall

**Files**:
- NEW: `dragToSave.ts` (state machine + toast UI)
- MODIFY: `MultiPaneChart.svelte` (range capture on mouseup)
- NEW: `PatternRecallCard.svelte` (inline card in Pattern tab)

**Deliverables**:
- Range drag UI (blue rect overlay)
- Toast 4-action menu (5s)
- POST /api/captures workflow
- Pattern recall results visualization (AIRangeBox markers)

---

### Phase D-7 (2 days) — AI Agent Panel 5-Tab Full Wiring

**Files**:
- MODIFY: `AIAgentPanel.svelte` (drawer separation, L1 vs L3)
- NEW: `DrawerSlide.svelte` (generalized drawer pattern)
- NEW: `aiQueryRouter.ts` (query → action mapping)
- MODIFY: `LiveDecisionHUD.svelte` (wire DecisionHUD data, add "→ Show more")

**Deliverables**:
- Decision tab: inline verdict + 3 evidence + drawer full EvidenceGrid
- ANL tab: VerdictInboxPanel wired
- SCN tab: ScanGrid wired
- JDG tab: JudgePanel wired
- PAT tab: keyboard nav (↑↓ Enter)
- AI Search query router (6+ patterns)

---

### Phase D-8 (1.5 days) — Mobile Bottom-Sheet + Perf

**Files**:
- NEW: `MobileBottomNav.svelte` (5-hub navigation)
- MODIFY: `AIAgentPanel.svelte` (mobile bottom-sheet mode)
- MODIFY: `MultiPaneChart.svelte` (single pane on mobile, swipe sub-panes)

**Deliverables**:
- Mobile right-panel as bottom-sheet (≤ 768px)
- Drawing toolbar horizontal on mobile
- LCP/INP/CLS measurement + tuning

---

### Phase D-9 (2 days) — AI Agent Refinement

**Files**:
- MODIFY: `AIAgentPanel.svelte` (Decision auto-refresh, pattern recall empty state)
- MODIFY: `chartAIOverlay.ts` (Claude-style annotation refinement)

**Deliverables**:
- Decision tab auto-refresh on symbol change
- Pattern recall loading skeleton + empty state (0 matches)
- AI overlay styled (Claude-like annotation)

---

### Phase D-10 (1.5 days) — Bloomberg Polish + Finalization

**Files**:
- MODIFY: `StatusBar.svelte` (F60 mini, freshness, mini verdict)
- MODIFY: Various (design token alignment, redirect validation)

**Deliverables**:
- KpiStrip chart header (24h vol/OI/funding/dominance)
- FreshnessBadge per data
- NewsFlashBar throttle + auto-hide
- StatusBar mini Verdict sync
- Design tokens final review
- Redirect validation (100%)
- TypeCheck + test pass

---

## 11. Risk Mitigation Table

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Information density → cognitive overload | M | H | **L1/L2/L3 strict enforcement** (no inline detail mixing) |
| Mobile rendering broken | H | M | Bottom-sheet + tab strip + full-screen drawer |
| Chart perf regression (multi-pane crosshair) | M | H | rAF throttle, 60fps measurement, memory probe post-phase-D-5 |
| shell.store bloat (25+ fields) | H | M | Typed namespace split: chart/ai/watch stores separate |
| lightweight-charts memory leak on mode toggle | M | H | dispose() enforcement, RSS measure post-D-8 |
| Drawer Esc priority conflict (with chart shortcuts) | M | M | **Drawer Esc closes first**, then modal, then chart Esc |
| Simultaneous drawing + drag-to-save race | M | M | **Mode flag** (`activeMode = 'drawing' \| 'save-range' \| 'idle'`) |
| Pattern recall ≥ 500ms → UX perceives lag | M | M | Skeleton loader mandatory; backend optimize |
| AI overlay accumulates infinitely → clutter | M | M | Session-only storage + max 20 limit + 5min auto-expire |
| WatchlistRail fold sync skew (multi-device) | L | L | localStorage primary + eventual Supabase sync |
| Design token drift → visual inconsistency | H | M | Phase D-0 token audit + grep-all + linter rules |

---

## 12. Testing Strategy

### 12.1 Unit Tests (Vitest)

- **IndicatorLibrary**: Search fuzzy match, category expand, add/remove
- **AIAgentPanel**: Tab switch, drawer open/close, keyboard nav (j/k, e, Esc)
- **MultiPaneChart**: Crosshair sync throttle, PaneInfoBar update
- **dragToSave**: State machine (idle → drawing/saving → toast)
- **aiQueryRouter**: 6+ query patterns → correct intent

**Target**: ≥ 60 new tests (baseline + 1955 existing)

### 12.2 Visual Regression (Playwright)

- **Hub-2 Terminal**: Layout grid zones correct (top 48px, left rail visible, right panel 320px)
- **Decision Tab**: Inline card + drawer affordance visible
- **Mobile ≤ 768px**: Bottom-sheet layout, drawing toolbar horizontal

### 12.3 Performance Profiling

- **LCP**: Cold load Hub-2, p75 ≤ 2.5s
- **INP**: Tab switch (j/k), drawer expand (e), TF change (1-8), p75 ≤ 200ms
- **CLS**: All hubs, target = 0
- **Memory**: Mode toggle 5x, RSS Δ ≤ 5MB

### 12.4 Acceptance Criteria Checklist (AC1~AC60)

- Each phase end: run AC checklist for that phase's deliverables
- Before merge: all 60 criteria pass

---

## 13. Migration / Deprecation Path

### Removed (after D-10)

- `Sidebar.svelte` (decomposed → WatchlistRail + DrawingToolbar + AIAgentPanel)
- `MobileFooter.svelte` (replaced by MobileBottomNav)
- `TerminalLeftRail.svelte` (WatchlistRail)
- `TerminalRightRail.svelte` (AIAgentPanel)
- `TerminalCommandBar.svelte` (CommandBar top-bar)
- `TerminalContextPanel.svelte` (Decision tab inline/drawer)
- `ChartBoardHeader.svelte` (TopBar)
- `BoardToolbar.svelte` (ChartToolbar)

### Deprecated (keep for 1 release, then remove)

- `DecisionHUD.svelte` (superseded by LiveDecisionHUD)

### Preserved (no change)

- All `chart/` infrastructure (DataFeed, DrawingManager, etc.)
- All indicator registry + apiSynonyms
- All API endpoints
- `LiveDecisionHUD.svelte` (canonical, W-0331 compliant)

---

## 14. Post-Phase Deliverables

### PR Structure (11 PRs)

1. **D-0-grid-skeleton** (2 commits): TopBar, grid zones, design tokens
2. **D-1-watchlist-polish** (1 commit): Fold, sparklines, whale alerts
3. **D-2-chart-toolbar** (2 commits): Chart type, TF picker, buttons
4. **D-3-indicator-library** (2 commits): Library panel, add/remove panes
5. **D-4-drawing-toolbar** (1 commit): Toolbar UI, mode flag
6. **D-5-crosshair-sync** (2 commits): rAF throttle, AI overlay types
7. **D-6-drag-to-save** (2 commits): Range capture, toast, pattern recall
8. **D-7-ai-agent-5tab** (2 commits): Drawer wiring, query router
9. **D-8-mobile-polish** (1.5 commits): Bottom-sheet, perf tuning
10. **D-9-ai-refinement** (1 commit): Auto-refresh, polish
11. **D-10-bloomberg-final** (1.5 commits): Status bar, tokens, redirects

---

## 15. Success Metrics (Post-Deploy)

| Metric | Target | Measurement |
|---|---|---|
| Time to first decision | ↓ 30% from baseline | session event log, p75 |
| Tab click rate | ≥ 30% inline → drawer | event analytics |
| Drag-save frequency | ≥ 5/user/day (active users) | API POST /captures count |
| Mobile session bounce | ≤ 10% increase | analytics, ≤ 768px |
| Decision verdict accuracy | Maintain ≥ 70% | outcome ledger |

---

## Appendix A: Component Checklist (100 items from W-0374 §3.4)

See W-0374 §3.4 lines 820-924 for complete mapping table. Key priorities:

**Must-Have (Phase D-0 ~ D-10)**:
- TopBar (new)
- AIAgentPanel 5-tab (wired)
- ChartToolbar enhanced
- IndicatorLibrary (new)
- DrawerSlide (new, PeekDrawer abstraction)
- MultiPaneChart extended
- MobileBottomNav (new)

**Nice-to-Have (Phase E+)**:
- PatternLibraryPanel (Hub-3)
- StrategyCard (Hub-3)
- CompareWithBaselineToggle (Hub-3 + Hub-4)
- BacktestResultChart (Hub-4)

---

## Appendix B: Data Schema Additions

### Captures Table (extended)

```sql
CREATE TABLE captures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_time_ms BIGINT NOT NULL,
  end_time_ms BIGINT NOT NULL,
  pattern_slug TEXT NULLABLE,
  user_label TEXT NULLABLE,
  trigger_origin TEXT DEFAULT 'manual', -- 'manual' | 'scanner' | 'ai'
  verdict TEXT NULLABLE, -- 'bullish' | 'bearish' | 'neutral' | null
  outcome TEXT NULLABLE, -- 'win' | 'loss' | 'pending' | null
  p_win FLOAT NULLABLE,
  blocks_triggered TEXT[] DEFAULT ARRAY[]::TEXT[],
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```

### Filter Attribution Table (new)

```sql
CREATE TABLE filter_attribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  filter_name TEXT NOT NULL, -- e.g., 'RSI > 70'
  symbol TEXT,
  period_start_date DATE,
  period_end_date DATE,
  alpha_loss FLOAT, -- negative = loss, positive = gain
  sample_count INT,
  created_at TIMESTAMP DEFAULT now()
);
```

---

## Appendix C: KPI Definitions

| KPI | Formula | Source | Refresh |
|---|---|---|---|
| 24h Volume | sum(VWAP * qty) last 24h | `/api/market` | 5min |
| OI (Open Interest) | derivative open positions | `/api/onchain` + `/api/coinalyze` | 30min |
| Funding Rate | perpetual funding % | `/api/coinalyze` | 1min |
| Dominance | (BTC mcap) / (total crypto mcap) | `/api/coingecko` | 5min |
| F-60 Score | (win % × 2.2) - 1 (capped 0-1) | engine `/api/doctrine` | session |
| Freshness Age | max(now - {all data timestamps}) | per-source | real-time |

---

## Appendix D: Mobile Breakpoint Definitions

| Breakpoint | Width | Layout |
|---|---|---|
| Mobile | ≤ 768px | Single-pane chart + bottom-sheet 5-tab + 5-hub nav |
| Tablet | 768px ~ 1024px | 2-pane (chart + bottom-half panel) |
| Desktop | > 1024px | 4-zone (left-rail, chart, right-panel, status-bar) |

---

**Document Status**: 🟢 Ready for Phase D-0 execution (2026-05-01)

**Next Steps**:
1. Engineer review (this spec)
2. Phase D-0 kickoff (TopBar + grid + tokens)
3. Daily standups (sync with W-0364 perf work)
4. Weekly demo (user feedback from each phase)

---

*Design Reference*: W-0374-cogochi-bloomberg-ux-restructure.md (86KB, canonical)  
*Implementation*: Atomic PR split (D-0 ~ D-10, 11 total)  
*Acceptance*: 60 criteria (AC1~AC60, verified at phase end)
