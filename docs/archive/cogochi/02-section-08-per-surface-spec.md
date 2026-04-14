## § 8. Per-Surface Feature Spec

### § 8.1 `/terminal` — Bloomberg-Style Decision Cockpit

> **2026-04-13 rewrite.** PR #13 shipped the Bloomberg 3-column shell. This section now documents the implemented architecture and the full interaction model.

---

#### Mental model — Find → Validate → Act

Every user action in terminal maps to one of three phases:

| Phase | Panel | Role |
|---|---|---|
| **Find** | Main Board (center) | Fast scan — which asset, which setup |
| **Validate** | Detail Intelligence Panel (right) | Why now, entry, risk, catalysts, metrics |
| **Act** | Bottom Dock | Command input, AI stream, execution strip |

The right panel is never empty. When nothing is selected it shows **Market Summary** (global regime, strongest assets, crowded side, top risks). Clicking any card, tag, or chart element updates the right panel in place — the tabs swap, the content loads, the panel width stays fixed.

---

#### Desktop shell

```
┌── TerminalCommandBar (40px) ─────────────────────────────────────────────┐
│  Symbol · TF · Flow Bias badge · Layout switch · CLR                     │
├── Left Rail (280px) ──┬─── Main Board (flex) ──────┬── Right Panel (380px)─┤
│                       │                             │                      │
│  TerminalLeftRail     │  WorkspaceGrid              │  TerminalContextPanel │
│  • Trending movers    │  (Focus / Hero+3 / 2×2)     │  5 tabs              │
│  • Quick chips        │                             │  Summary             │
│  • Market pulse       │  AssetInsightCard ×N        │  Entry               │
│                       │                             │  Risk                │
│                       │                             │  Catalysts           │
│                       │                             │  Metrics             │
├───────────────────────┴─────────────────────────────┴──────────────────── ┤
│  TerminalBottomDock                                                        │
│  Event tape · Command input · AI stream · Execution strip                  │
└────────────────────────────────────────────────────────────────────────────┘
```

Layout tokens: `--terminal-left-w: 280px`, `--terminal-right-w: 380px`, `--terminal-cmd-bar-h: 40px`.

---

#### AssetInsightCard — structure and depths

Every card in the main board follows this fixed section order:

```
CardHeader    symbol · asset type · exchange · TF ladder (15m↑ 1H↓ 4H→) · signal badge
PriceStrip    last price · abs change · pct change · range position · spread
MiniChart     candle/line + VWAP + key level + AI marker overlay
FlowMetricsRow  Vol ×N · OI ±% · Funding % · CVD state
SetupSummary  one-line verdict with bias dot
ActionBar     [View] [Entry] [Risk] [⊕ Pin]
```

Three display depths, selected by context:

| Depth | Used in | Shows |
|---|---|---|
| `mini` | 2×2 compare grid | Header + PriceStrip + MiniChart + 1-line summary |
| `standard` | Companion column in Hero+3 | Full card minus expanded action hints |
| `deep` | Focus / Hero slot | Standard + level strip + catalyst strip + expanded ActionBar |

---

#### Click → Tab mapping (fixed, non-negotiable)

| Click target | Right panel tab opens |
|---|---|
| Card body (anywhere except buttons) | **Summary** |
| `[View]` button | **Summary** |
| `[Entry]` button | **Entry** |
| `[Risk]` button / any risk tag | **Risk** |
| News headline | **Catalysts** |
| OI / Funding / CVD value | **Metrics** |
| Chart level or liquidation cluster | Related tab + section highlighted |

This mapping must never change without a documented decision. Predictability is the feature.

---

#### Right panel — Detail Intelligence Panel

Five tabs. Content is always derived from `analysisData` for the selected symbol. The panel never shows raw API response — it shows *conclusions*.

**Summary tab**
- `BiasCard` — LONG / NEUTRAL / SHORT with confidence dot
- `WhyNowBlock` — 2–3 sentence explanation of why this setup is active *now*
- `MultiTimeframeAlignment` — 15m / 1H / 4H / 1D direction arrows with confluence count
- `NextMoveCard` — one clear action sentence
- `InvalidationCard` — what breaks the thesis

**Entry tab**
- `EntryZoneCard` — best entry range, distance from current price, rationale
- `StopLossCard` — stop level, why it's placed there
- `TakeProfitCard` — TP1 / TP2 with basis
- `RRCard` — risk:reward ratio
- `VenueSuggestionCard` — spot vs perp, exchange, sizing notes
- `ExecutionChecklist` — Do now / Wait for / Do not chase above

**Risk tab**
- `RiskSummaryCard` — aggregate risk level
- `CrowdingCard` — long/short crowding signal
- `LiquidityRiskCard` — thin liquidity zones
- `StructureRiskCard` — near-resistance, weak spot support
- `TrapSignalsCard` — perp-led move without spot, fake breakout signals
- `AvoidActionsCard` — explicit "do not" list

**Catalysts tab**
- `NewsTimeline` — recent headlines sorted by recency
- `EventCalendar` — upcoming events (listings, unlocks, FOMC, CPI)
- `MacroSensitivityCard` — how sensitive this asset is to macro events

**Metrics tab**
- `OITrendPanel` — OI value + change + 7d percentile
- `FundingPanel` — funding rate + trend + extreme flag
- `CVDPanel` — cumulative volume delta trend
- `LiquidationMapPanel` — key liquidation clusters above/below price

**Every tab ends with this 3-line conclusion strip (non-negotiable):**
```
Bias:         Bullish continuation
Action:       Buy pullback into 83,700 support
Invalidation: Exit if 83,220 breaks on volume
```
If there is no data, show `—` for each line. Never omit the strip.

---

#### Default state (no asset selected)

Right panel shows **Market Summary**:
- Current regime (risk_on / risk_off / neutral)
- Strongest assets today
- Most crowded side (longs vs shorts)
- Top market risks

This ensures the panel is always useful, even before the user clicks anything.

---

#### Interaction flows

**Keyword chip flow** (e.g. "Buy Candidates"):
1. Main board: summary header (`12 matches, sorted by best alignment`) + cards
2. Right panel (before click): global top candidate, most crowded, best RR
3. User clicks BTC card → right panel updates to BTC Summary tab
4. User clicks `[Entry]` → right panel switches to Entry tab

**"Where to Buy" flow:**
1. Main board: list with entry zone, distance from price, RR, confidence
2. Right panel auto-opens **Entry tab** on any card click
3. Entry tab always shows: best entry range, why, invalidation, TP1/TP2, venue

**"What's Wrong" / Risk flow:**
1. Main board: warning cards only — tagged `Crowded longs`, `Weak spot`, `Near resistance`
2. Right panel auto-opens **Risk tab**
3. Risk tab: problem definition → evidence → what not to do → what to wait for

**Chart / tag drill-down:**
- Liquidation cluster click → **Metrics tab** at liquidation map section
- Funding hot tag click → **Metrics tab** at funding panel
- News badge click → **Catalysts tab**

---

#### Pin and Compare

- **Pin** (`[⊕]` button): locks the right panel to the current symbol. Other card clicks don't update it.
- **Compare**: click a second card while one is pinned → right panel shows side-by-side comparison of the two symbols on the Summary tab.
- Use case: pin BTC, click ETH → "why BTC over ETH" visible immediately.

---

#### BoardToolbar

Sits above the main board. Always visible. Fixed fields:

```
[Workspace name]  [Query chip]  [Symbol picker]  [Layout: Focus|Hero3|2×2]  [TF: 15m|1H|4H|1D]  [Sort ▾]  [Edit]  [Save View]
```

---

#### Mobile layout

Mode-based, not column-compressed:

| Mode | Trigger |
|---|---|
| **Workspace** | Default on mount — `MobileActiveBoard` full screen |
| **Command** | Tap input — `MobileCommandDock` expands |
| **Detail** | Tap "More" or any detail action — `MobileDetailSheet` slides up (5 tabs, same content as right panel) |

`MobileBottomNav` is hidden on terminal. `MobileCommandDock` uses normal flex flow (not `position: fixed`).

---

#### Implementation files

```
app/src/routes/terminal/+page.svelte           — shell, state, data fetching
app/src/components/terminal/workspace/
  TerminalCommandBar.svelte                    — top bar
  TerminalLeftRail.svelte                      — left 280px rail
  TerminalContextPanel.svelte                  — right 380px panel (5 tabs)
  TerminalBottomDock.svelte                    — bottom dock
  WorkspaceGrid.svelte                         — board layouts
  AssetInsightCard.svelte                      — card (mini/standard/deep)
  VerdictCard.svelte                           — hero/focus deep card
app/src/components/terminal/mobile/
  MobileActiveBoard, MobileCommandDock, MobileDetailSheet
```

Key prop contract: `onViewDetail?: (symbol: string, tab?: string) => void` — card action buttons pass the target tab name so the right panel opens to the correct tab directly.

---

#### Design invariants

1. Right panel width is fixed (380px). Only content changes, never layout.
2. Every click on the main board triggers a right-panel update. Nothing is a dead end.
3. Every right panel tab ends with Bias / Action / Invalidation.
4. Click → tab mapping is fixed and documented above. Do not invent new mappings.
5. Mobile never compresses desktop columns — it uses mode switching instead.

---

---

#### § 8.1-B Time-axis alignment — the board speaks one language

Every widget on the main board must operate on the **same timeframe reference**. Mixing 15m volume with 4H OI with 1D news creates noise, not signal.

**Default 3-frame ladder:**

| Role | Frame | Purpose |
|---|---|---|
| Execution TF | 15m | When to pull the trigger |
| Decision TF | 1H | Which direction is correct |
| Structure TF | 4H | Does the bigger picture support it |

The 1D serves as macro background context only — shown as a small badge, not a primary widget.

**Selected TF = board language.** When user switches to 4H:
- Chart shows 4H candles
- Volume bars are 4H
- OI/Funding change is 4H delta
- AI signals summarize 4H regime
- Level labels use 4H pivot points

Never mix frames in the same widget row without labeling which frame each number belongs to.

**What to emphasize by frame:**

| Frame | Primary focus |
|---|---|
| 1m / 5m | Spread, top-of-book, aggressive flow, microstructure, short-term liquidation |
| 15m / 1H | Intraday trend, volume anomaly, OI expansion, funding acceleration, session hi/lo |
| 4H / 1D | Structure, breakout/breakdown, swing levels, crowding, major liquidation bands |
| 1W | Regime, macro trend, positioning extreme, major S/R |

**TF alignment badge (required on every card and panel header):**
```
15m ↑  |  1H ↑  |  4H →
```
Arrows: ↑ bullish, ↓ bearish, → neutral/unclear. This is the fastest 3-second signal quality check.

**4-card compare mode alignment display:**
```
BTC    15m ↑ | 1H ↑ | 4H →    +2.8%  Vol 1.8x  OI +3.4%  Trend | Crowded
ETH    15m → | 1H ↑ | 4H ↑    +1.6%  Vol 1.2x  OI +1.1%  Breakout watch
SOL    15m ↓ | 1H ↓ | 4H →    -0.8%  Vol 2.1x  OI -0.9%  Weak / funding cool
TOTAL3 15m ↑ | 1H ↑ | 4H ↑   +2.1%  —         OI +2.0%  Best aligned
```
"Best aligned" = all 3 TFs agree direction.

---

#### § 8.1-C Comparison unit alignment

Same row = same unit. Never compare dollars to percentages in the same column.

**Standard display format:** `current value | relative context`

```
Vol   38.2M  | 2.4x avg
OI    +6.2%  | 1H rising
Funding 0.018 | 89 pctl
Spread  4bp   | thin
Range pos 82% | near highs
```

Unit system:

| Metric | Primary | Context |
|---|---|---|
| Price | Absolute | % change |
| Volume | Current (raw) | × avg multiple |
| OI | Absolute | % change |
| Funding | Rate (%) | Percentile (7d) |
| Volatility | ATR or realized vol | Regime label |
| Liquidity | Spread (bps) | Depth quality label |

**Fixed header strip on every asset panel:**
```
BTCUSDT  |  84,220  +2.8%
15m ↑  |  1H ↑  |  4H →
Vol 2.1x  |  OI +4.2%  |  Funding hot  |  Regime: Trend
```
This 3-line header must answer: Is it moving? Which frames? Is it crowded? What regime?

---

#### § 8.1-D Decision-axis layout (order matters)

Information is sequenced by judgment order, not by data category:

```
1. Market state      → regime, trend, compression
2. Movement strength → volume, vol anomaly, momentum
3. Positioning       → OI, funding, L/S ratio, basis
4. Risk level        → crowding, liquidation clusters, resistance overhead
5. Action            → entry zone, stop, TP, venue, invalidation
```

Single-asset panel order maps to this exactly:

```
[ Symbol ][ Timeframe ][ Regime label ]
Price / % change / Range position
Volume / OI / Funding / Spread
Main chart (candle + VWAP + key levels + AI markers)
Volume pane
OI / Funding pane  (toggle: CVD, Basis)
Liquidation map / Key levels
AI Verdict / Invalidation / Next action
```

**Bottom dock AI verdict format (3 required lines, always):**
```
Bias:         Bullish continuation
Why now:      OI rising with positive delta, price above VWAP
Risk:         Crowded longs, funding elevated
Invalidation: 83,480 reclaim failure
Next move:    Buy pullback or wait for breakout retest
```

---

#### § 8.1-E Widget priority table (P0 must ship before P1)

| Priority | Widget | Default frame | Quant role |
|---|---|---|---|
| **P0** | Price Header (symbol, price, %, regime) | 1H + 24H | Ground truth |
| **P0** | Main Chart (candle, VWAP, levels, AI markers) | Selected TF | Structure + timing |
| **P0** | Volume / Delta pane | Selected TF | Real vs noise |
| **P0** | OI / Funding pane | 15m, 1H | Positioning |
| **P0** | Key Levels (VWAP, S/R, daily range) | 4H, 1D | Where price reacts |
| **P0** | AI Verdict strip (Bias / Action / Invalidation) | 15m/1H/4H summary | Conclusion |
| **P1** | CVD / Aggression | 5m, 15m | Who is hitting |
| **P1** | Liquidation Map | 1H, 4H | Where price gets pulled |
| **P1** | Catalyst Feed | Live + 1D | Why it moves |
| **P1** | Relative Strength | 1H, 4H | Leader vs laggard |
| **P1** | TF Alignment Badge (15m/1H/4H arrows) | All 3 | Fast quality signal |
| **P2** | Basis / Spread | 15m, 1H | Market structure |
| **P2** | Market Breadth / Heatmap | 1H, 4H | Macro environment |
| **P2** | Realized Vol / ATR regime | Selected TF | Compression/expansion |

---

#### § 8.1-F 2-tier search system

The command dock serves two types of users simultaneously:

**Tier 1 — Quick keywords (preset queries)**
One tap → immediate result. No knowledge of indicators required. Maps user *intent* to a curated data view.

| Group | Keywords |
|---|---|
| Opportunity | Buy Candidates, Momentum, Breakout Watch, Mean Reversion |
| Risk | What's Wrong, Overcrowded, Funding Risk, Liquidation Risk |
| Execution | Where to Buy, Best Entry, Best RR, Thin Liquidity |
| Market Structure | High OI, Basis Divergence, Spot Leading, Perp Leading |
| Catalyst | News Driven, Unlock Risk, Macro Sensitive |

Each keyword triggers: matching symbol list sorted by relevance + why each triggered + 3–5 key metrics + action suggestion + risk flag.

**Tier 2 — Metric search (indicator-driven)**
User types a metric name, question, or combination. The board reconfigures automatically.

```
oi + funding          → OI pane + Funding panel, sorted by crowding score
liquidation cluster   → Liquidation map opens, sorted by nearest cluster to price
cvd vs price         → CVD pane visible, divergence flag highlighted
where to buy btc     → BTC Entry tab opens in right panel
why not buy sol      → SOL Risk tab opens in right panel
```

**Unified result format** — both tiers return the same output shape:

```
[ Summary ]   What is happening (1 line)
[ Matches ]   Sorted symbol list with mini-metrics
[ Why ]       Key indicator evidence (3–5 data points)
[ Action ]    Where to look, what to do
[ Risk ]      Invalidation / caution
```

**"Where to Buy" result format:**
```
Symbol:     BTC
Best entry: 83,650 – 83,820
Why:        VWAP retest + 1H support confluence
Distance:   -0.6% from current
Invalidation: 83,220 breaks on volume
TP1 / TP2:  84,800 / 86,200
R:R:        1:2.1
Venue:      Binance Perp (preferred) / Coinbase Spot (safer)
```

**"What's Wrong" result format:**
```
Symbol:   SOL
Problem:  Price up, CVD flat, funding elevated
Risk:     Perp-led move without spot confirmation
Tags:     Crowded longs / Weak CVD / Near resistance
Do not:   Chase market buys above current
Wait for: Pullback hold + spot volume confirmation
          or deeper reset toward 155 support
```

**UI layout for search results:**
- Command dock: keyword chips row + search/command input
- Main board: results sorted by relevance (respects current board layout)
- Auto-sort: when keyword activates, board sort updates to match intent (e.g. "High OI" → sort by OI expansion desc)
- Auto-pane: relevant metric pane opens in chart (e.g. "High OI" → OI pane enabled)
- Right panel: auto-opens to matching tab on any card click

---

#### § 8.1-G Market maker / quant / exchange operator perspective

The terminal's fundamental question: *"Where is liquidity, who is driving, what is my risk, and should I act now?"*

**Data priority order — always render in this sequence:**

1. **Price + return** — current, 1m/5m/1H/24H change, range position, session hi/lo
2. **Liquidity + orderbook** — best bid/ask, spread, depth, book imbalance, absorption signals
3. **Volume + trade flow** — realized volume, aggressive buy/sell, delta, CVD, large prints
4. **Positioning** — OI, funding, L/S ratio, basis, perp vs spot divergence
5. **Volatility + regime** — realized vol, ATR, compression/expansion state, trend/range label
6. **Liquidation + key levels** — liquidation clusters, HVN/LVN, daily/weekly open, VWAP, anchored VWAP
7. **Catalysts** — news, events, unlock schedule, economic calendar, exchange actions
8. **Signal / model** — AI verdict, factor score, setup confidence, invalidation level
9. **Risk / execution** — current position, entry/stop/target, sizing, liquidation risk, PnL
10. **Market breadth** — sector heatmap, BTC dominance, stablecoin flow, exchange netflow

These 10 must be visible or one-click accessible. Anything decorative that pushes these off screen is wrong.

**Workspace presets (role-based):**

| Preset | Primary widgets |
|---|---|
| Market Maker | Spread, top-of-book, depth imbalance, inventory, short-term vol, toxic flow, large prints |
| Quant Directional | MTF trend, momentum, vol regime, volume expansion, OI/funding/basis, relative strength, signal score |
| Exchange Operator | OI concentration, liquidation clusters, ADL risk, volume by venue, crowded side, funding stress, suspicious flow |

Presets are saved workspace configurations — same data layer, different widget emphasis and sort order.

**What NOT to show prominently:**
- Long explanation text blocks
- More than 4 decorative gradient cards
- Duplicate KPIs (two widgets showing the same metric in different formats)
- Miniature charts below 80px height that can't be read
- Chat UI taking more than 25% of center width in default mode

The terminal is a **decision tool**, not a reading app. Raw market data leads, explanation supports.

---

#### § 8.1-H Desktop wireframe — exact proportions and zone specs

**Layout: 3 columns + bottom dock. Fixed zones, only content changes.**

```
┌──────────────────────────── Global Header (64-72px) ──────────────────────────────────┐
│  Brand · Global Nav · Wallet · Settings                                                │
├─────────────────────────── Terminal Command Bar (52-60px) ─────────────────────────────┤
│  [Workspace] [Symbol] [15m 1H 4H 1D] [Focus|2x2|Hero+3] [Buy Candidates▾] [Edit][Save]│
├─ Left Rail (280-320px) ─┬────────── Main Board (flex ~56%) ──────┬─ Right Panel (380-420px) ─┤
│                         │                                        │                           │
│  Quick Query chips      │  WorkspaceGrid                         │  Detail Intelligence      │
│  Watchlist              │  (Focus / 2x2 / Hero+3)               │  Panel                    │
│  Top Movers (by TF)     │                                        │  [5 tabs]                 │
│  Anomalies              │  AssetInsightCard ×N                   │                           │
│  Alerts                 │                                        │                           │
│                         │                                        │                           │
├─────────────────────────┴────────────────────────────────────────┴───────────────────────────┤
│  Bottom Dock (76-110px):  [Event tape]  [Command input]  [Execution / log strip]             │
└───────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Column proportions (1600px reference):**

| Column | % | px |
|---|---|---|
| Left Rail | 19% | ~300px |
| Main Board | 56% | ~900px |
| Right Panel | 25% | ~400px |

Main board gets the most space because it holds the chart. Left is scan-only so 300px is enough. Right needs ~400px for the 5 tabs without horizontal scroll.

---

**Zone 1 — Global Header (64-72px)**
- Brand, nav, wallet, settings
- Thinnest, most static layer — no live market data here
- All terminal operations happen in the Command Bar below

**Zone 2 — Terminal Command Bar (52-60px)**
```
[ Focus Board ] [ BTC ] [ 15m 1H 4H 1D ] [ Focus 2x2 Hero+3 ] [ Buy Candidates ▾ ] [ Edit ] [ Save View ]
```
- Workspace name = current board context label (editable inline)
- Symbol input = fast swap to any asset
- TF ladder = selected frame updates all widgets
- Layout switch = instantly reconfigures main board
- Query chips = preset intents that trigger board reload + sort

**Zone 3 — Left Rail (280-320px, full height, internal scroll)**

Sections in order:

1. **Quick Query** — keyword chips: `Buy Candidates · What's Wrong · High OI · Breakout · Short Squeeze · Where to Buy`
2. **Watchlist** — pinned symbols. Each row: `symbol · % · signal dot · 1-line state`
3. **Top Movers** — TF-specific, not generic. Labeled groups: "1H movers" / "4H movers" separately
4. **Anomalies** — OI spike, funding extreme, liquidation watch, CVD divergence
5. **Alerts** — user-set price triggers, AI-generated alerts, fill notifications

Left rail purpose: *"what to look at"* — narrow, scannable, no deep content here.

**Zone 4 — Main Board (flex, internal scroll per card)**

Three switchable layouts:

*Layout A — Focus (single asset deep view):*
```
┌─────────────────────── Hero Asset Panel ───────────────────────────┐
│  BTCUSDT  84,220  +2.8%  │  15m ↑ │ 1H ↑ │ 4H →  │  Vol 2.1x    │
│                                                                     │
│  [ Main Chart — candle, VWAP, key levels, AI markers ]             │
│  [ Volume pane ]                                                    │
│  [ OI / Funding pane — toggle: CVD / Basis ]                       │
├──────────────────────────┬──────────────────────────────────────────┤
│  Secondary Insight A     │  Secondary Insight B                    │
│  (key levels / news)     │  (signal summary / relative strength)  │
└──────────────────────────┴──────────────────────────────────────────┘
```
Use when: one asset needs deep attention.

*Layout B — 2×2 Compare (4 assets side-by-side):*
```
┌──────────────────────┬──────────────────────┐
│  BTC  (mini depth)   │  ETH  (mini depth)   │
│  price / TF / chart  │  price / TF / chart  │
├──────────────────────┼──────────────────────┤
│  SOL  (mini depth)   │  TOTAL3 (mini depth) │
│  price / TF / chart  │  price / TF / chart  │
└──────────────────────┴──────────────────────┘
```
Each mini card: symbol · price/% · TF ladder · mini chart · volume/OI/funding · 1-line summary.
Speed over depth. Click any card to open right panel or switch to Focus.

*Layout C — Hero+3 (most practical default):*
```
┌──────────────────── Large Hero Panel (60% height) ────────────────────┐
│  Main asset · deep chart · full pane set                              │
└───────────────────────────────────────────────────────────────────────┘
┌─────────────────┬─────────────────┬─────────────────┐
│  Asset B        │  Asset C        │  Asset D        │
│  (standard)     │  (standard)     │  (standard)     │
└─────────────────┴─────────────────┴─────────────────┘
```
Use when: watching one primary + 3 candidates simultaneously. Most real-world use case.

**Zone 5 — Right Panel (380-420px, fixed width, internal scroll)**

```
┌──────────────── Detail Header ──────────────────────────┐
│  BTCUSDT  ·  from: Buy Candidates  ·  [Pin] [Compare] [×]│
├──────────────── Tab Bar ────────────────────────────────┤
│  Summary  |  Entry  |  Risk  |  Catalysts  |  Metrics   │
├──────────────── Scrollable Content ─────────────────────┤
│                                                         │
│  [Tab-specific components]                              │
│                                                         │
├──────────────── Conclusion Strip (pinned bottom) ───────┤
│  Bias:         Bullish continuation                     │
│  Action:       Buy pullback 83,700                      │
│  Invalidation: Break 83,220 on volume                   │
└─────────────────────────────────────────────────────────┘
```

Rules:
- Width never changes. Content changes only.
- Conclusion strip is always visible at the bottom of every tab.
- Pin locks the current symbol. Compare shows side-by-side diff with the previously pinned symbol.
- Right panel never pushes or reflows the main board.

**Zone 6 — Bottom Dock (76-110px)**

Three horizontal sections:
```
│  [Event tape — alerts / fills / AI notices scrolling left →]             │
│  [Command input: "Ask AI or run command..."]                     [Send]  │
│  [Execution strip: last fill · system status · position summary]         │
```
- **Event tape** = Bloomberg-style live ticker. Alerts, fills, triggered conditions, AI notices.
- **Command input** = natural language + metric search. Keyword chips also available here.
- **Execution strip** = last action, system health, open position summary.

---

**Information density tiers:**

| Tier | What | Where | Always visible |
|---|---|---|---|
| **T1** | Symbol, price, % change, TF alignment badge, signal state | Card header, left rail row | Yes |
| **T2** | Chart, volume, OI/funding, key levels | Card body, main chart panes | When in board |
| **T3** | Explanation, catalysts, risk notes, venue advice | Right panel only | On demand |

T3 content never appears on cards. Cards stay T1+T2 scannable; right panel handles T3 depth.

---

**Default initial state:**

| Zone | Default |
|---|---|
| Left Rail | Buy Candidates / High OI / What's Wrong chips visible; watchlist populated |
| Main Board | Hero+3 — active pair as hero, 3 top movers as companions |
| Right Panel | Market Summary (global regime, strongest assets, crowded side, top risks) |
| Bottom Dock | Event tape running, command input focused |

---

**Standard click flow:**

```
Left: "High OI" chip       → Main board reloads, sorted by OI expansion desc
Card: SOL clicked          → Right panel opens Summary tab for SOL
Tag:  "Funding hot"        → Right panel switches to Metrics tab (funding section highlighted)
Btn:  [Entry]              → Right panel switches to Entry tab
Btn:  [Pin]                → SOL locked; other card clicks show Compare overlay
Btn:  [Compare] on ETH     → Right panel shows BTC vs ETH side-by-side diff
```

This flow is deterministic. Users build muscle memory quickly.

---

### § 8.1-I Adaptive Analysis Workspace

**이름:** Adaptive Analysis Workspace
**철학:** Bloomberg panel system + TradingView chart depth + Claude-style command input
**목적:** 한 종목 깊게 보기 · 여러 종목 비교 · 실시간 감시 · AI 해석 · 패널 편집을 한 화면 체계 안에서 처리

메인보드는 고정 페이지가 아니라 **workspace canvas**다. 사용자는 여기서 종목을 바꾸고, 패널을 추가하고, 1종목 집중과 4종목 동시 비교를 전환한다. terminal의 중심은 채팅이 아니라 **editable board**다.

#### 1. 전체 레이아웃

```
┌──────────────── Command Bar ────────────────────────────────┐
│ [ Workspace ] [ Symbol ] [ TF ] [ Layout ] [ Edit ] [ Save ]│
├──── Left Rail ────┬────── Main Board ──────┬── Right Rail ──┤
│ Watchlist          │ Editable chart grid    │ AI Summary      │
│ Movers             │ 1-up / 2-up / 2×2      │ Signals         │
│ Breadth            │ Focus / Compare /       │ Catalysts       │
│ Alerts             │ Monitor / Custom        │ Risk Checklist  │
├────────────────────┴────────────────────────┴────────────────┤
│ Bottom Dock: logs · fills · commands · alerts               │
└──────────────────────────────────────────────────────────────┘
```

#### 2. Main Board 모드

| 모드 | 레이아웃 | 사용 상황 |
|------|---------|-----------|
| **Focus** | 큰 차트 1개 + 보조 패널 2–3개 | 한 종목 깊게 — thesis 빌드, 진입 타이밍 |
| **Compare** | 2개 또는 4개 패널 동등 폭 | BTC/ETH/SOL/TOTAL3 동시 시그널 확인 |
| **Monitor** | 6–12개 compact tiles | 가격·변화율·신호만 빠르게 ambient 감시 |
| **Custom** | 사용자 저장 배치 | 반복 루틴: "my alts board", "macro morning" |

모드는 `localStorage`에 유지되고 재방문 시 복원된다.

#### 3. 패널 종류

각 슬롯은 패널 타입 하나를 담는다. 사용자는 패널마다 **종목을 독립적으로 지정**할 수 있다.

| 타입 | 내용 | 데이터 |
|------|------|--------|
| **Chart** | 캔들 · 오버레이 · 지표 · 드로잉 | OHLCV + 온체인 |
| **Signal** | 빌딩블록 상태 행렬, 트리거/컨펌 | 엔진 출력 |
| **AI Thesis** | 확신 요약 · 진입/무효 레벨 · 신뢰도 | Claude 분석 |
| **News-Catalyst** | 시장 관련성 랭킹 헤드라인 · 감성 배지 | 뉴스 파이프라인 |
| **Risk-Position** | P&L · 스탑 거리 · 사이즈 · 진입 대비 낙폭 | 포지션 트래커 |
| **Orderflow** | CVD · 델타 · 테이프 · 청산 피드 | WS 스트림 |
| **Macro-Breadth** | BTC 도미넌스 · 공포탐욕 · DXY · 펀딩 히트맵 | 시장 파이프라인 |
| **Log-Tape** | 시그널 발화 · AI 업데이트 · 가격 알림 순서 | 시스템 이벤트 |
| **Watchlist** | mini-spark + 신호 닷 compact 리스트 | 전역 워치리스트 |

#### 4. 종목 패널 기본 구조

**1개든 4개든 동일한 위계 — 눈이 헤매지 않는다.**

```
[ Symbol ]  [ TF ]  [ Signal State badge ]
──────────────────────────────────────────
Price  ·  24h %  ·  Volume  ·  OI delta
──────────────────────────────────────────
[ Main Chart ]
──────────────────────────────────────────
[ Key Indicators: RSI | OI | CVD ]
──────────────────────────────────────────
AI note: "4H structure intact, 1H reset needed"
──────────────────────────────────────────
[ Entry ]  [ Set Alert ]  [ Add to Watch ]
```

#### 5. 차트 요구사항

차트는 "예쁘게"가 아니라 **판단 도구**여야 한다.

**최소 요구:**
- 타임프레임: 1m / 5m / 15m / 1H / 4H / 1D / 1W
- 캔들타입: candlestick · line · area · volume-heavy mode
- 오버레이: EMA(9/21/50/200) · VWAP · Volume Profile · Fibonacci · Trendline
- 보조지표: RSI · MACD · Funding · OI · Long-Short Ratio · CVD
- 드로잉: horizontal line · range box · trend channel · notes/markers
- 이벤트 레이어: entry · exit · AI signal · news timestamp · liquidation zone
- 비교 보기: 종목 A vs B 상대 성과 overlay (% normalized)
- 멀티파인: 독립 보조지표 서브파인

**그려진 것은 심볼×TF 단위로 저장된다.**

#### 6. 4종목 동시 분석

```
┌──────────────────┬──────────────────┐
│  BTC / Standard  │  ETH / Standard  │
│  Chart + Signal  │  Chart + Signal  │
├──────────────────┼──────────────────┤
│  SOL / Standard  │  TOTAL3 / Mini   │
│  Chart + Signal  │  Price + Spark   │
└──────────────────┴──────────────────┘
```

분석 깊이 3단계:

| 레벨 | 표시 항목 | 언제 |
|------|----------|------|
| **Mini** | 가격 · 변화율 · 작은 차트 · 핵심 신호 1줄 | Monitor 6-tile 이상 |
| **Standard** | 가격 · 차트 · 시그널 · 리스크 상태 | 2×2 Compare 기본 |
| **Deep** | 큰 차트 · thesis · catalysts · entries/exits · metrics | Focus 단독 |

2×2에서 패널 클릭 → 해당 종목이 **Focus Mode로 승격**.

#### 7. 편집 UX

**진입:** 메인보드 우상단 `[ Edit Workspace ]` → 편집 모드 (보더 강조, 드래그 핸들 표시)

편집 시 가능 기능:
- 패널 드래그 이동 (12-col grid 스냅)
- 패널 크기 조절 (우하단 핸들)
- 패널 타입 교체 (`[⋯]` → type picker)
- 종목 교체 (패널 헤더 심볼 클릭)
- 패널 추가 (`[+]` 빈 슬롯) / 제거 (`[×]`)

상단 도구모음: `[ Add Panel ]` `[ Layout ]` `[ Compare ]` `[ Save View ]` `[ Reset ]`

**종료:** `[ Done ]` 저장. `[ Cancel ]` 되돌리기.

**내장 프리셋 4종:**
1. `Single Asset Focus` — 차트 1 + AI Thesis + Risk (3-col)
2. `4-Asset Compare` — 2×2 차트 그리드, 공유 TF
3. `News + Chart` — 차트(70%) + News-Catalyst(30%) 나란히
4. `Signal Monitor` — Signal 패널 6개 compact

사용자 저장 커스텀 프리셋은 프로필에 저장.

**보드 상단 Control Bar:**
```
[ Focus Board ] [ BTC ] [ 4H ] [ Indicators ▾ ] [ Compare ] [ 2×2 ] [ Edit ] [ Save ]
```

#### 8. AI 통합 방식

AI는 오른쪽 채팅창에만 있으면 안 된다. **보드에 직접 주석처럼 들어간다.**

- 차트 위: entry zone box · breakdown line · invalidation level 마커 (별도 overlay 레이어, 토글 가능)
- 각 패널 헤더: **Conviction badge** `Bullish` / `Neutral` / `Risk` — AI 재분석 시 업데이트
- AI Thesis 패널: 신뢰도 % + 마지막 업데이트 타임스탬프 포함 전체 근거
- 패널마다: *Why this matters now* · *Next move* · *What invalidates this*
- Bottom Dock: `[ Ask AI ]` → 현재 보드 컨텍스트(심볼·TF·모드·보이는 패널) 자동 주입

AI 재분석 트리거: 종목 변경 · TF 변경 · `[ Refresh Analysis ]` 수동 버튼 · 주요 뉴스 이벤트 (자동, toast 표시)

**Bloomberg 슬롯 시스템 (Focus 모드 기본 배치):**

| 슬롯 | 기본 내용 | 교체 가능 대상 |
|------|---------|--------------|
| A | Primary Chart (선택 TF) | Any chart TF |
| B | Live Orderflow Tape | Log-Tape |
| C | News-Catalyst | Macro-Breadth |
| D | Risk-Position | Watchlist |
| E | Related Assets (Signal, 동일 섹터) | AI Thesis |
| F | AI Thesis | Signal |

종목이 바뀌어도 슬롯 구조는 유지된다.

#### 9. 모바일 설계

모바일은 데스크톱 축소판이 아니다. **single-active-panel** 구조:

```
┌─────────────────────────────────────┐
│ Symbol  Price  Quick Status          │  ← header
├─────────────────────────────────────┤
│                                     │
│         Active Panel                │  ← full height
│                                     │
├─────────────────────────────────────┤
│ Board │ Chart │ Signals │ News │ AI  │  ← segmented tabs
├─────────────────────────────────────┤
│         Command Dock                │  ← fixed bottom
└─────────────────────────────────────┘
```

- **Board** → 2×2 compact cards (Monitor mode)
- **Chart** → Chart 패널 전체 화면
- **Signals** → Signal 패널
- **News** → News-Catalyst 패널
- **AI** → AI Thesis 패널

4종목 비교: 2×2 compact grid 또는 가로 스와이프 (`BTC ← swipe → ETH`)

모바일 편집: 패널 추가/삭제 · 레이아웃 선택만 허용. 정교한 드래그-리사이즈는 desktop/tablet 전용.

#### 10. 스타일 방향

| 요소 | 값 |
|------|-----|
| 배경 | `#000000` |
| 패널 | `#0a0a0a` charcoal |
| 보더 | 얇고 선명 `rgba(255,255,255,0.07)` |
| 숫자·시간·티커 | monospace |
| 제목·설명 | sans-serif |

색 의미 고정 (절대 혼용 금지):
- `green` → positive / long
- `red` → negative / short / risk
- `amber` → warning / caution
- `blue` → info / market data
- `violet` → AI only

중요한 건 색이 많아 보이는 게 아니라 **색마다 기능이 고정**되는 것.

#### 11. 컴포넌트 구조

```
BoardShell
├── BoardToolbar          (Workspace name · Symbol · TF · Layout switch · Edit · Save)
├── WorkspaceGrid         (12-col responsive grid, drag-drop in edit mode)
│   └── PanelFrame        (slot A–F or custom, panel type router, depth: mini/std/deep)
│       ├── ChartPanel    (candles · overlays · indicators · drawing · AI annotation layer)
│       ├── SignalPanel   (빌딩블록 상태 행렬)
│       ├── ThesisPanel   (AI 확신 · entry/invalid markers)
│       ├── NewsPanel     (랭킹 헤드라인 + 감성)
│       ├── RiskPanel     (포지션 트래커)
│       ├── OrderflowPanel (CVD · tape · liquidations)
│       ├── BreadthPanel  (macro indicators)
│       ├── LogTapePanel  (이벤트 로그)
│       └── WatchlistPanel (compact 리스트)
└── PresetManager         (save/load/delete · built-in 4 + user custom)
```

이 구조는 나중에 dashboard · lab · passport까지 패널 시스템을 공유할 수 있도록 설계한다.

#### 12. 구현 우선순위

1. `WorkspaceGrid` — 12-col grid, 슬롯 시스템, 모드별 레이아웃 엔진
2. `ChartPanel` — 캔들 + TF selector + 기본 오버레이 (EMA, VWAP)
3. Focus mode — 단일 종목, 슬롯 A–F 기본 배치
4. 2×2 Compare mode — PanelFrame 배열, 공유 TF 컨트롤
5. Edit mode — 드래그/리사이즈/교체/추가/제거 UX
6. Chart overlays — 지표 서브파인 · 드로잉 도구 · AI annotation layer
7. Save preset / PresetManager
8. 나머지 패널 타입: Signal → Thesis → News → Risk → Orderflow → Breadth → LogTape
9. Mobile segmented tab layout

---

**Recommended terminal build order (full cockpit):**
1. `TerminalShell` — 4-zone grid with correct proportions
2. `TerminalCommandBar` — workspace, symbol, TF, layout, chips
3. `LeftRail` — query chips + watchlist sections
4. `MainBoard` + `AssetInsightCard` (all 3 depths)
5. `DetailPanel` — 5 tabs + conclusion strip
6. `BottomDock` — event tape + command input + execution strip
7. Layout switch (Focus ↔ 2×2 ↔ Hero+3)
8. Pin / Compare
9. Edit workspace / Save view (§ 8.1-I full spec)

---

### § 8.1-J Unified UI System Spec

**목표:** Home · Dashboard · Terminal · Lab · Passport · Wallet 전부를 하나의 제품처럼 보이게 만드는 통합 UX 시스템.
**기준:** Apple의 정돈 + Bloomberg/퀀트의 정보 위계 + Perplexity의 결론-근거-출처 구조.

#### Product Principles

1. **Black-first** — clean black/charcoal surfaces. decorative gradient 금지.
2. **Data-forward** — decoration 전에 판단. 빠르게 스캔 → 판단 → 실행.
3. **Consistent shell** — header · spacing · typography · surface 규칙이 전 페이지에서 동일.
4. **Evidence-native** — 모든 주장은 데이터와 출처에 가시적으로 연결된다.
5. **Responsive by role** — desktop = 병렬 분석, mobile = 집중 active board.

#### Design System

**색 의미 (전 페이지 고정, 혼용 금지):**

| 색 | 의미 |
|----|------|
| near-black `#000` | base background |
| dark charcoal `#0a0a0a` | raised surface |
| slightly lighter charcoal | utility surface |
| green | positive / long |
| red | negative / short / risk |
| amber | warning / caution |
| blue | info / market data |
| violet | AI/model only — 1가지 accent |

**타이포그래피:**

| 분류 | 폰트 | 사용처 |
|------|------|--------|
| UI text | sans-serif | 버튼 · 레이블 · 본문 |
| Data text | monospace | 수치 · 시간 · 티커 · 로그 |

**스케일:** Hero / Page Title / Section Title / Body / Meta / Mono

**레이아웃 토큰:**
- spacing: 8pt scale
- radius: 3종 (none / sm / md)
- border: thin, `rgba(255,255,255,0.07)`
- shadow: subtle only — 장식용 금지

#### Global Navigation

**원칙:** 상단 헤더 = 현재 화면 조작. 하단 메뉴 = 앱 전역 이동. **같은 메뉴 위아래 중복 금지.**

**Mobile Bottom Nav (5항목 고정):**
`Home` · `Terminal` · `Dashboard` · `Passport` · `More`

**More → Bottom Sheet (팝오버 금지):**
Lab · Settings · Language · Help · Notifications

**Header 규칙:**
- left: 뒤로가기 또는 메뉴
- center: 페이지 타이틀 또는 심볼
- right: 검색 · 알림 · 페이지별 액션
- collapsing tiny header 금지
- 컨텍스트 컨트롤용 secondary row 허용

#### Page Type Shell

**Standard Page** (Home · Dashboard · Passport · non-terminal Lab):
```
[ Global Header ]
[ Page Intro / Context Row ]
[ Primary Content ]
[ Bottom Nav ]
```

**Workspace Page** (Terminal):
```
[ Global Header ]
[ Terminal Command Bar ]
[ Workspace Content ]
[ Bottom Command Dock ]
```

일반 페이지: 선택적 FAB 1개 허용. Terminal: 일반 footer/floating menu 금지.

#### Terminal Desktop Layout & Ratios

```
[ Global Header ]
[ Terminal Command Bar ]
[ Left Rail ~19% ][ Main Board ~56% ][ Right Detail Panel ~25% ]
[ Bottom Dock ]
```

**Left Rail — 스캔:**
- Quick Queries: Buy Candidates · What's Wrong · High OI · Breakout · Short Squeeze · Liquidation · Where to Buy
- Watchlist · Top Movers · Anomalies · Alerts

**Terminal Command Bar 컨트롤:**
`[ Workspace ]` `[ Symbol ]` `[ TF Ladder ]` `[ Layout ]` `[ Compare ]` `[ Sort ]` `[ Edit ]` `[ Save View ]`

**Timeframe Ladder (기본):**

| TF | 역할 |
|----|------|
| 15m | Execution |
| 1H | Main Decision |
| 4H | Structure |
| 1D | Background |

TF 선택 시 동시 업데이트: chart · volume summary · OI/funding · signal · AI verdict

#### Asset Insight Card

Main Board 내 종목 패널 공통 구조:

```
CardHeader:  [ Symbol ] [ Venue/Type ] [ TF Alignment ] [ Signal State ]
PriceStrip:  Last Price · Abs Change · % Change · Range Position · Spread
MiniChart / MainChart:  candles/line · overlays · AI markers · levels
FlowMetricsRow:  Volume Anomaly · OI Change · Funding State · Delta/CVD
SetupSummary:  one-line conclusion
ActionBar:  [ View ] [ Entry ] [ Risk ] [ Pin ]
```

**Depth 3단계:**
- `Mini` — 가격 · 변화율 · spark · 신호 1줄
- `Standard` — 가격 · 차트 · 시그널 · 리스크 (2×2 기본)
- `Deep` — 큰 차트 · thesis · catalysts · entries/exits · metrics (Focus 전용)

**Main Board 정보 우선순위 (위에서 아래 순):**
1. Price / Return
2. Liquidity / Spread / Book Quality
3. Volume / Flow / Delta
4. OI / Funding / Positioning
5. Regime / Volatility
6. Key Levels / Liquidation
7. Catalysts
8. AI Verdict / Action / Invalidation

#### Right Detail Panel — 5 Tabs

**탭 → 카드 클릭 매핑 (고정):**

| 클릭 대상 | 열리는 탭 |
|----------|----------|
| 종목 카드 body | Summary |
| `[Entry]` 버튼 | Entry |
| Risk 태그 | Risk |
| 뉴스 | Catalysts |
| OI / Funding / CVD | Metrics |
| 차트 annotation | 관련 탭 + 해당 섹션 포커스 |

**Summary:** VerdictHeader · WhyPanel · MultiTimeframeAlignment · EvidenceGrid · CounterEvidenceBlock · SourceRow

**Entry:** entry zone · stop/invalidation · TP1/TP2 · RR · venue suggestion · execution checklist

**Risk:** crowding · thin liquidity · divergence · trap conditions · avoid actions

**Catalysts:** news timeline · event calendar · listing/delisting · unlocks · macro-sensitive events

**Metrics:** metric selector · OI · funding · CVD · basis · liquidation map · relative strength

모든 탭 하단: Bias / Action / Invalidation 결론 strip (고정)

#### Evidence & Source System

모든 분석 컴포넌트는 이 순서를 강제한다:

```
Verdict → Action → Evidence → Sources → Deep Dive
```

**핵심 컴포넌트:**

| 컴포넌트 | 역할 |
|---------|------|
| `VerdictHeader` | 최종 방향 · 확신도 |
| `ActionStrip` | 지금 할 것 |
| `EvidenceCard` | 단일 근거 아이템 |
| `EvidenceGrid` | 근거 모음 |
| `WhyPanel` | "왜 지금인가" 서술 |
| `CounterEvidenceBlock` | 반대 근거 |
| `SourcePill` | 인라인 출처 배지 |
| `SourceRow` | 패널 하단 출처 목록 |
| `CitationDrawer` | 클릭 시 출처 상세 |
| `FreshnessBadge` | 데이터 시간 |

**Source 카테고리 (색 고정):**
- `Market` — blue (Binance Spot · Hyperliquid OI)
- `Derived` — amber (Funding Agg · CVD · On-chain computed)
- `News` — neutral (CoinDesk · headline)
- `Model` — violet (Internal Model · AI output)

**SourcePill 표시 형식:** `[label]` · `[category]` · `[freshness]`
예: `Binance Spot · Live` / `Hyperliquid OI · 08:58` / `Internal Model · v2`

**CitationDrawer 표시 항목:** source name · type · updated time · raw values · timeframe · aggregation note · origin link (있을 경우)

#### Mobile Terminal Layout

```
[ Compact Header ]
[ Symbol Strip: symbol · price · % · 15m/1H/4H alignment · vol/OI ]
[ Quick Query Chips ]
[ Active Board: chart + 4 core metrics + 1-line action ]
[ Mini Compare Row: horizontal cards or 2×2 compact ]
[ Bottom Command Dock ]
```

**Mobile Active Board:** 큰 차트 · volume · OI · funding · key levels · action 1줄

**Mobile Compare:** compact 가로 카드 스크롤 또는 2×2 grid. 카드 탭 → Active Board로 승격.

**Mobile Detail Sheet:** 데스크톱 Right Panel → bottom sheet 전환. 탭 동일: Summary · Entry · Risk · Catalysts · Metrics.

**Mobile Bottom Dock (Terminal 전용):** Scan · Board · Alerts · AI 또는 command input 우선 — 일반 footer 아님.

#### Standard Mobile Pages

Home · Dashboard · Passport · Lab:
- top header: 컨텍스트
- bottom nav: 앱 이동
- FAB: 진짜 primary action인 경우에만 1개

#### Implementation Order

1. Global tokens — colors · spacing · typography · surfaces
2. Typography + surface components
3. Header + bottom nav + More sheet system
4. Terminal shell (4-zone layout)
5. Terminal command bar
6. Main board workspace (§ 8.1-I)
7. Asset Insight Card (3 depths)
8. Right detail panel (5 tabs + conclusion strip)
9. Evidence / Source / Citation system
10. Mobile active board + detail sheet
11. Dashboard · Passport · Lab alignment

#### Success Criteria

- 어느 페이지를 봐도 같은 제품처럼 보인다
- Terminal: 빠른 스캔 → 깊은 검증 → 명확한 실행
- Mobile: 데스크톱 축소판이 아니라 독립적으로 작동
- 모든 추천/시그널에 가시적 근거와 출처가 붙는다
- query → summary → detail → action 흐름이 끊기지 않는다

---

### § 8.1-K Source-Native Evidence System

**핵심 원칙:** 터미널은 "AI 결론"이 아니라 "결론-근거-출처-검증"이 한 세트로 보이는 **source-native terminal**이어야 한다.

Perplexity가 강한 이유는 정보량이 아니라 이 4층 구조다:

```
먼저 답 (Conclusion)
바로 아래 근거 (Why + Evidence)
그 옆/아래 출처 (Sources — 항상 visible)
필요하면 더 깊게 (Deep Dive on demand)
```

이를 **Answer-First Architecture**라고 부른다. 카드든, 우측패널이든, 모바일 sheet든 예외 없이 이 순서를 강제한다.

#### 불변 규칙

1. 결론만 보여주지 않는다
2. 근거만 길게 늘어놓지 않는다
3. 출처를 숨기지 않는다 — 항상 visible, 스크롤 뒤로 사라지면 안 됨
4. 출처는 항상 클릭 가능해야 한다
5. 모든 분석 결과는 같은 구조를 따른다
6. 모든 정보가 같은 무게면 안 된다 — **Verdict > Action > Evidence > Sources > Deep Metrics** 시각 위계 강제

#### 컴포넌트 상세 스펙

---

##### VerdictHeader

```
[ Bullish / Neutral / Bearish ]  [ 선택 TF 기준 결론 1줄 ]  [ Sources 4 ]
Confidence: 74%  ·  Updated 12s ago
```

| 필드 | 내용 |
|------|------|
| Direction | Bullish / Neutral / Bearish |
| Label | "1H continuation" / "4H breakdown risk" 등 TF 기준 맥락 |
| Confidence | 0–100% — 엔진 출력 or 모델 확신도 |
| Updated | FreshnessBadge — live · N초 전 · delayed · stale |
| **Sources N** | 결론 문장 끝 인라인 배지. 숫자 클릭 → CitationDrawer 오픈. Perplexity citation UX의 터미널 번역. |

---

##### ActionStrip

결론 다음에 바로 따라오는 행동 지침. **설명이 아니라 동사.**

```
[ Buy pullback ]  [ Avoid breakout chase ]  [ Wait for retest ]
Invalidation: 83,220
```

항목당 최대 3개. 무효화 레벨은 항상 표시.

---

##### EvidenceCard

지표 1개 = 카드 1개. 형식 통일.

```
[ Metric Name ]
Current Value   Δ delta
Interpretation (1줄)
Sources: N
```

예:
```
Funding
0.018%   +12bp vs prev window
Crowded longs — elevated risk
Sources: 2
```

클릭 → 우측패널 Metrics 탭, 해당 metric 섹션으로 점프.

---

##### EvidenceGrid

EvidenceCard를 2×2 또는 3×2 그리드로 배치.

기본 항목 (우선순위 순):
`OI` · `Funding` · `Volume` · `CVD` · `Spread` · `Key Levels`

Focus 모드: 3×2 전체. Standard/Mini 카드: 2×2 핵심만.

---

##### WhyPanel

"왜 이 결론인가" 서술 2–4줄. 숫자가 아니라 해석.

```
Price is holding above VWAP while OI expands and delta stays positive.
Funding is elevated but not yet at liquidation-risk levels.
Structure has not broken — this remains a buying opportunity on pullback.
```

---

##### CounterEvidenceBlock

**Perplexity식 신뢰 보강에 필수.** 찬성 근거만 보여주면 신뢰되지 않는다.

```
✓ Bullish evidence          ✗ Against the trade
  above VWAP                  funding elevated
  strong volume               near prior daily high
  positive delta              thin ask-side book above 84k
```

두 칼럼 나란히. CounterEvidence는 회색/amber로 표시 — 빨간색 금지 (결론을 override하는 것처럼 오해 유발).

---

##### Chart as Evidence Canvas

차트는 단순 시각화가 아니라 **증거 캔버스**다. TradingView처럼 예쁘기만 하면 안 되고, Perplexity처럼 "왜"가 붙어야 한다.

차트 위에 직접 렌더링하는 마커:

| 마커 타입 | 표시 방식 | 색 |
|---------|---------|-----|
| Entry zone | 반투명 박스 (low~high) | green 10% fill |
| Invalidation level | 점선 수평 레이 | red |
| Liquidation cluster | 볼륨 스파이크 + 번개 아이콘 | amber |
| News event | 타임스탬프 수직 라인 + 아이콘 | gray |
| AI signal marker | 삼각형 또는 플래그 | violet |
| AI note | 차트 위 말풍선 텍스트 | violet dimmed |

**마커 클릭 동작 (고정):**
- Entry zone 클릭 → 우측패널 **Entry** 탭, 해당 구간 섹션으로 점프
- Invalidation 클릭 → 우측패널 **Risk** 탭
- Liquidation cluster 클릭 → 우측패널 **Metrics** 탭, Liquidation Map 섹션
- News marker 클릭 → 우측패널 **Catalysts** 탭, 해당 기사 포커스
- AI signal 클릭 → 우측패널 **Summary** 탭 + WhyPanel 포커스

AI annotation은 별도 overlay 레이어 (토글 가능). 사용자 드로잉과 분리되어야 한다.

---

##### SourcePill

출처는 이름만 보이면 약하다. 최소 3개 필드.

형식: `[ label ] · [ category ] · [ freshness ]`

예:
```
Binance Spot · Market · Live
Hyperliquid OI · Market · 08:58
Funding Agg · Derived · 1H
CoinDesk · News · 08:41
Internal Model · Model · v2
```

**카테고리 4종 (고정 — 혼용 금지):**

| 카테고리 | 해당 소스 예시 | 색 |
|---------|-------------|-----|
| **Market Data** | Binance Spot, Coinbase, Bybit, Hyperliquid | blue |
| **Derived Metrics** | OI aggregation, Funding calc, CVD, internal factor score | amber |
| **News** | CoinDesk, X, official announcements, 공식 채널 | neutral/gray |
| **AI Inference** | 내부 모델 결론, reasoning summary, confidence output | violet |

모든 소스가 같은 무게가 아니다. Market Data = 1차 검증, AI Inference = 해석 레이어임을 색으로 즉시 전달한다.

---

##### SourceRow

카드 또는 패널 하단의 SourcePill 모음. 항상 visible — 스크롤 뒤로 숨기면 안 됨.

```
[ Binance Spot · Live ]  [ Hyperliquid OI · 08:58 ]  [ Internal Model · v2 ]
```

---

##### CitationDrawer

SourcePill 클릭 시 슬라이드업 또는 사이드 drawer로 열림.

표시 항목:
```
Source:      Hyperliquid OI
Type:        Market / Perp OI
Updated:     08:58:14
Symbol:      BTC
Timeframe:   1H
Raw OI:      12.84B USD
Change:      +4.2%
Method:      venue-normalized aggregation across Hyp + Bybit + Binance Perp
Link:        [Open on Hyperliquid ↗]  (있을 경우)
```

이게 있어야 "AI가 말한 근거"가 아니라 "검증 가능한 데이터"가 된다.

---

##### FreshnessBadge

| 상태 | 표시 | 색 |
|------|------|-----|
| Live | `● Live` | green |
| Recent | `Updated 12s ago` | green-dim |
| Delayed | `Delayed ~30s` | amber |
| Stale | `Stale — last 4m ago` | red |

데이터 소스마다 독립적으로 붙는다. 패널 전체 freshness가 아니라 각 source별.

---

##### MetricPanel

특정 지표를 깊게 보는 Metrics 탭 내 상세 뷰.

구성:
- metric selector (드롭다운 또는 탭)
- 상세 차트 (TF 선택 가능)
- 현재 raw 수치
- delta / z-score / percentile
- calculation note
- CitationDrawer 진입 버튼

---

#### 카드 단위 완성 구조

메인보드 종목 카드는 이 순서로 흐른다:

```
┌─────────────────────────────────────────────────┐
│ VerdictHeader                                   │
│ BTCUSDT · 1H · Bullish continuation  Conf 74%  │
├─────────────────────────────────────────────────┤
│ ActionStrip                                     │
│ [ Buy pullback ]  [ Avoid chase ]               │
│ Invalidation: 83,220                            │
├─────────────────────────────────────────────────┤
│ EvidenceGrid (2×2)                              │
│  OI +4.2%      Funding hot                     │
│  Vol 2.1x      Above VWAP                      │
├─────────────────────────────────────────────────┤
│ WhyPanel                                        │
│ Price holding above VWAP, OI expanding,         │
│ delta positive. Funding elevated but not        │
│ at liquidation risk.                            │
├─────────────────────────────────────────────────┤
│ SourceRow                                       │
│ Binance Spot·Live  Binance Perp·Live  OI·08:58 │
└─────────────────────────────────────────────────┘
```

4개 동시에 띄워도 읽힌다. 구조가 고정돼 있기 때문.

#### 우측 패널 탭별 증거 구조

**Summary 탭:**
```
VerdictHeader
WhyPanel
EvidenceGrid (full 3×2)
CounterEvidenceBlock
SourceRow
```

**Entry 탭:**
```
entry zone (price range box)
stop level + invalidation
TP1 / TP2
Risk:Reward
venue suggestion
execution checklist
entry-related SourceRow
```

**Risk 탭:**
```
crowded side (long/short ratio)
thin liquidity zones (book depth)
divergence signals
counter-signals
avoid actions
risk SourceRow
```

**Catalysts 탭:**
```
news timeline (chronological, ranked by market relevance)
official announcements
SourcePills per headline
event calendar (unlocks, listings, macro)
```

**Metrics 탭:**
```
metric selector
상세 차트 (TF 선택)
raw numbers + z-score + percentile
calculation note
CitationDrawer entry
```

모든 탭 하단: `Bias · Action · Invalidation` 결론 strip 고정.

#### 모바일 압축 구조

모바일도 동일 시스템, 압축만 한다.

**Active Board:**
```
VerdictHeader
ActionStrip
Evidence chips (inline 1줄)
SourceRow (항상 visible)
Chart
```

**Detail Bottom Sheet:**
```
탭: Why · Evidence · Counter · Sources · Metrics
```

SourceRow는 본문에 항상 보인다. raw detail만 sheet로.

#### 구현 순서

1. `SourcePill` — 카테고리 색, freshness, click handler
2. `FreshnessBadge` — Live / Recent / Delayed / Stale 상태
3. `SourceRow` — pill 모음, 항상 visible
4. `EvidenceCard` — metric · value · delta · interpretation · source count
5. `EvidenceGrid` — 2×2 / 3×2 responsive
6. `VerdictHeader` — direction · label · confidence · freshness
7. `ActionStrip` — 동사 지침 · invalidation level
8. `WhyPanel` — 서술 해석
9. `CounterEvidenceBlock` — 찬반 2-col
10. `CitationDrawer` — source detail sheet/drawer
11. Metrics 탭 연결 — EvidenceCard 클릭 → MetricPanel 점프

---

### § 8.1-L Terminal Agent UI — "팀원의 작업실"

현재 Terminal UI는 "검색 결과창"이다. Agent UI는 **팀원의 작업실**이어야 한다.

```
┌─────────────────────────────────────────────────────────────┐
│  [AGENT STATUS BAR]  ● Monitoring 12 assets  ⚡ 2 alerts    │
├──── AGENT FEED ────┬──── AGENT WORKSPACE ────┬── REASONING ─┤
│                    │                          │ CHAIN         │
│ ● Alert:           │  현재 Agent가 분석 중    │               │
│ BTC OI +18% 30s    │  혹은 완료된 카드들      │ Step 1 ✓      │
│                    │                          │ MTF synth     │
│ ● Regime shift:    │  ┌───────────────────┐   │               │
│ risk_on_high       │  │ VERDICT CARD       │   │ Step 2 ✓      │
│                    │  │ BTC/USDT 4H       │   │ Regime: R-On  │
│ ● ETH setup        │  │ ██ BULLISH HIGH   │   │               │
│ forming            │  │                   │   │ Step 3 ✓      │
│                    │  │ Entry:  $96,200   │   │ Liq: $94K     │
│                    │  │ Stop:   $94,800   │   │               │
│                    │  │ T1:     $99,500   │   │ Step 4 →      │
│                    │  │ T2:     $103,000  │   │ News scan     │
│                    │  │                   │   │ in progress   │
│                    │  │ Conf: 73%         │   │               │
│                    │  │ Sources: 8        │   │               │
│                    │  └───────────────────┘   │               │
├────────────────────┴──────────────────────────┴───────────────┤
│  [INTENT DOCK]  "Goal"이지 "Question"이 아님                   │
│  Give the agent a goal…                                       │
│  "Find best long setup now"   "Monitor BTC alert @97k"        │
│  "Compare BTC vs ETH"         "What changed since 1H?"        │
└───────────────────────────────────────────────────────────────┘
```

#### 3개 신규 패널

**Agent Feed (Left Rail 하단):**
- Agent가 자율로 감지한 이벤트 스트림
- 포맷: `● [심볼] [이벤트 유형] [시간]`
- 클릭 → 해당 심볼 Main Board 포커스
- 현재 Left Rail의 Top Movers 영역을 점진적으로 대체

**Reasoning Chain (Right Panel — 분석 중일 때):**
- Agent가 현재 실행 중인 plan steps 실시간 표시
- 완료된 step: `✓` + 1줄 결과 요약
- 진행 중: `→` + 스피너
- 완료 후: Reasoning Chain → 5탭으로 전환 (Summary/Entry/Risk/Catalysts/Metrics)

**Intent Dock (Bottom Dock 교체):**
- 현재 "메시지 입력창" → "Goal 입력창"으로 reframe
- Quick goal chips: `Find best long` · `Monitor alert` · `Compare assets` · `What changed?`
- Goal 입력 시 Agent가 plan 수립 후 Reasoning Chain에 표시

#### Status Bar

```
● Monitoring 12 assets   ⚡ 2 unread alerts   Last scan: 8s ago   [Pause]
```

항상 visible. Terminal 최상단 (Command Bar 바로 아래).

---

### § 8.1-M Terminal P0/P1 Fix Spec — 현재 문제와 해결 설계

> **진단 요약 (CTO 관점):** 엔진은 잘 만들었고, UI 껍데기도 만들었는데, 두 개가 제대로 연결되지 않아서 지금은 **좋은 데이터를 가진 나쁜 표시**를 하고 있다.

#### 현재 데이터 흐름 갭

```
있는 것:                   UI까지 도달하는 것:
92개 engine features  →  6~7개만 표시 (86개 버려짐)
DEPTH_L2_20           →  ❌ UI 없음
AGG_TRADES_LIVE       →  ❌ UI 없음
FORCE_ORDERS          →  ❌ UI 없음
On-chain/MVRV         →  ❌ evidence에 표시 안 됨
```

`buildEvidence()`가 하드코딩으로 일부만 추출. KnownRawId에 20개 데이터소스가 정의되지만 end-to-end로 UI까지 흐르는 건 5개.

#### P0 버그 — 즉시 수정 필요

**P0-1: `buildAssetFromAnalysis()` 가짜 숫자**

```ts
// 현재 (오도하는 추정치):
changePct15m: (snap.rsi14 - 50) / 100,   // ❌ RSI로 15분 변동률 추정
changePct1h:  change24h / 24,             // ❌ 24h를 24로 나눔
changePct4h:  change24h / 6,             // ❌ 24h를 6으로 나눔
tf15m: tfAlign((snap.rsi14 - 50) / 100), // ❌ RSI로 방향 추정
tf4h:  tfAlign(snap.oi_change_1h ?? 0),  // ❌ OI 변화로 방향 추정

// 해결:
// analyze API에서 실제 OHLCV 기반 changePct(15m/1h/4h) 반환
// 없으면 null 표시, 추정치 표시 금지
```

**P0-2: `setActiveTimeframe()` 미호출**

```ts
// 현재: TF 버튼 클릭 → store 업데이트 안 됨 → API 재호출 없음
// 해결:
function handleTfChange(tf: string) {
  setActiveTimeframe(tf);   // ← 추가
  loadAnalysis(activeSymbol, tf);
}
```

**P0-3: worktree / main repo 빌드 분리**

- 개발 서버는 반드시 worktree 경로에서 실행: `npm --prefix /worktrees/mystifying-kapitsa/app run dev`
- 변경사항이 main repo 빌드에 포함되지 않는 문제 — worktree 완료 후 PR merge 전까지는 worktree 서버만 사용

#### P1 수정 — Right Panel 실질 내용

| 탭 | 현재 | 해결 |
|----|------|------|
| Entry | placeholder | entry zone · stop · TP1/TP2 · RR — `analysisData.entry` 필드에서 |
| Risk | placeholder | crowding · thin liquidity · divergence — `analysisData.risks[]`에서 |
| Metrics | 완전 비어 있음 | OI 패널 + Funding 패널 (기존 API 데이터 활용) |
| News | 미확인 | `/api/market/news` 응답을 `CatalystsTab`으로 렌더링 |

#### P1 수정 — Left Rail "Loading movers..."

- `/api/market/trending` 응답 형태 확인 후 `trendingData` → `TopMovers` 컴포넌트 연결
- 폴링은 이미 작동 중 — 렌더링 매핑 누락 가능성 높음

#### 86개 feature → UI 활용 로드맵

```
즉시 활용 가능 (API 이미 반환):
  vol_ratio_3, vol_regime, trend_strength → FlowMetricsRow 확장
  spread_pct, bid_ask_imbalance → PriceStrip 에 spread 표시
  rsi_slope, macd_histogram → chart indicator values

단계적 연결:
  DEPTH_L2_20 → Metrics 탭 OrderBook 패널
  AGG_TRADES  → Log-Tape 패널 (체결 테이프)
  FORCE_ORDERS → Liquidation 마커 (Chart Event Layer)
  On-chain    → Macro-Breadth 패널
```

#### 수정 우선순위 실행 순서

```
1. P0-1: buildAssetFromAnalysis() — 가짜 숫자 제거, null 처리
2. P0-2: setActiveTimeframe() 호출 추가
3. P1: Right Panel Entry/Risk 탭 실제 데이터 연결
4. P1: Left Rail TopMovers 렌더링 매핑 수정
5. P1: Metrics 탭 OI + Funding 패널 추가
6. P2: DEPTH/Tape/Liquidation UI 연결
```

---

### § 8.1A `/terminal` Wallet Intel Mode — Address-Led Investigation

**Why this exists:** 사용자는 Etherscan 스타일의 raw truth만 원하는 게 아니라, **주소가 누구인지 · 지금 무엇을 하고 있는지 · 그게 시장에서 왜 중요한지**를 한 흐름으로 보고 싶다. 이 모드는 Explorer truth, derived on-chain intelligence, market confirmation을 같은 surface로 묶는다.

**Entry triggers:**
1. Terminal input에 `0x...` 또는 ENS 입력
2. Scanner / alert / saved thesis에서 특정 wallet deep link 클릭
3. Passport dossier에서 `OPEN IN TERMINAL` 액션 클릭

**Desktop layout (investigation mode):**

```
┌─ LEFT 22% ────────────┬─ CENTER 53% ─────────────────┬─ RIGHT 25% ───────┐
│ AI Summary / Query     │ Main Investigation Canvas    │ Evidence Rail      │
│ • "이 주소는..."        │ • Tab A: Flow Map            │ • tx list          │
│ • 핵심 주장 3개         │ • Tab B: Token Bubble Graph  │ • labels           │
│ • follow-up prompt     │ • Tab C: Cluster View        │ • counterparties   │
│ • filters              │ • selected node detail strip │ • saved alerts     │
│                        │                              │                    │
│ ── Behavior Cards ───  │ ── Market Confirmation ──── │ ── Action Plan ──  │
│ • accumulation score   │ • token price chart          │ • watch/follow     │
│ • distribution score   │ • wallet event markers       │ • fade/ignore      │
│ • cex deposit risk     │ • CVD / OI / funding / vΔ    │ • risk notes       │
│ • holding horizon      │                              │ • scenario notes   │
└────────────────────────┴──────────────────────────────┴────────────────────┘
```

**Core tabs:**
1. **Flow Map** — source → split wallets → holding layer → final hub 를 시간순/금액순으로 보여준다.
2. **Token Bubble Graph** — 입력 주소와 엮인 토큰/컨트랙트/상대지갑 관계를 force graph로 탐색한다. 버블은 `token`, `wallet`, `contract`, `cex`, `bridge`, `cluster` 타입을 가진다.
3. **Cluster View** — 단일 주소가 아닌 동일 주체로 추정되는 지갑 묶음을 보여준다. "주소 하나"가 아니라 "세력 하나"를 이해하는 탭이다.

**V1 features (must-have):**
1. **Identity card** — chain, address, label confidence, first seen, last active, known tags
2. **Executive summary** — "이 주소는 무엇인가"를 한 문장으로 답하고, confidence + 근거 3개를 보여준다
3. **Flow map** — 분산/집결/브리지/CEX 입금 패턴을 레이어형 그래프로 시각화
4. **Token bubble graph** — 주소와 많이 엮인 토큰/컨트랙트/상대지갑을 bubble/graph로 탐색
5. **Market confirmation chart** — 선택 토큰 차트 위에 wallet 이벤트 마커를 겹치고 하단 pane에 `CVD`, `volume delta`, `OI`, `funding` 중 2~3개 표시
6. **Evidence rail** — tx hash, timestamp, counterparty, notional, action type을 raw evidence로 유지
7. **Action outputs** — `watch`, `follow`, `fade`, `ignore` 네 가지 행동 제안을 출력. 모든 주소에 TP/SL을 강제하지 않는다
8. **Save thesis / set alert** — "이 클러스터가 다시 CEX로 300k 이상 입금하면" 같은 패턴형 alert 저장

**Interpretation rules (non-negotiable):**
- **Explorer truth**와 **derived inference**를 시각적으로 분리한다. raw tx list는 근거이고, "distribution hub" 같은 문장은 해석이다.
- **CVD는 주소의 truth가 아니라 market confirmation**이다. 주소 행동을 시장 구조와 교차검증하는 layer로만 쓴다.
- 첫 화면은 tx list가 아니라 `Who → What → Why it matters → What to do` 순서여야 한다.
- 버블 그래프는 보조 탐색기다. 기본 탭은 항상 **Flow Map**으로 시작한다.

**V1 scope:**
- EVM chains only
- single address input
- automatic chain detect + manual override
- 1~2 hop cluster inference
- top token 기준 market overlay
- executive summary + flow map + token bubble + evidence rail

**Explicit non-goals (V1):**
- 3D graph / globe view
- non-EVM multi-chain normalization
- every wallet gets a trading plan with exact TP/SL
- "smart money score"를 모든 주소에 무조건 부여

---

### § 8.2 `/lab` — Challenge Workbench (list + detail + runner)

**Role:** the only place where challenges live. Replaces the old backtest builder UI, the character HQ, and the scanner cockpit — all at once.

**Layout (desktop, 2-pane):**

```
┌─ LAB ─────────────────────────────────────────────────────┐
│ ┌─ My Challenges ────┐  ┌─ Selected ─────────────────────┐│
│ │                     │  │                                 ││
│ │ ⭐ sample-rally      │  │ sample-rally-pattern            ││
│ │    0.0234  2h       │  │ long · binance_30 · 1h          ││
│ │ ⦿ cvd-div-funding   │  │ "10% rally over 3 days, BB ..." ││
│ │    -1.0    8h       │  │                                 ││
│ │ ⦿ bb-squeeze-long   │  │ ── Blocks ──                    ││
│ │    never run        │  │ trigger: recent_rally           ││
│ │                     │  │   pct=0.1  lookback_bars=72     ││
│ │ [+ new from         │  │ confirm: bollinger_expansion    ││
│ │    /terminal]       │  │ entry:   long_lower_wick        ││
│ │                     │  │ disq:    extreme_volatility     ││
│ │                     │  │                                 ││
│ │                     │  │ [ ▶ RUN EVALUATE ]              ││
│ │                     │  │                                 ││
│ │                     │  │ ── Live output ──               ││
│ │                     │  │ [prepare] warming...            ││
│ │                     │  │ ok BTCUSDT                      ││
│ │                     │  │ ---                             ││
│ │                     │  │ SCORE: 0.0234                   ││
│ │                     │  │ N_INSTANCES: 47                 ││
│ │                     │  │ POSITIVE_RATE: 0.68             ││
│ │                     │  │                                 ││
│ │                     │  │ ── Instances (47) ──            ││
│ │                     │  │ BTC  3/22 14:00  +4.2%  ✓      ││
│ │                     │  │ click → /terminal jump          ││
│ └─────────────────────┘  └─────────────────────────────────┘│
└───────────────────────────────────────────────────────────┘
```

**Day-1 features:**
1. **Left — My Challenges list** — filesystem scan of `WTD/challenges/pattern-hunting/*/`. Each row: slug + latest SCORE + last run time. Sort: recent run desc. Starred rows pinned top.
2. **Right — Selected challenge detail:**
   - Header: slug · direction · universe · timeframe · one-line description (from `answers.yaml::identity.description`)
   - Blocks section: parse `answers.yaml::blocks` → 4 cards (trigger / confirmations[] / entry / disqualifiers[])
   - Read-only view of `match.py` (copy button → open in editor)
3. **Run Evaluate button** — `POST /api/challenges/[slug]/run`. Server spawns `python prepare.py evaluate` in the challenge dir and pipes stdout/stderr via SSE to the client. Final `---` summary is parsed into the SCORE card.
4. **Instances table** — after run, read `<slug>/output/instances.jsonl` and render rows: `symbol · timestamp · upside · downside · outcome`. Click → `/terminal?slug=<slug>&instance=<ts>` to jump to the bar.
5. **[+ new from /terminal]** — deep link to `/terminal` (composer lives there).

**Day-1 backend bridges:**
- **Filesystem bridge:** `src/lib/server/challengesApi.ts` — `listChallenges()`, `getChallenge(slug)`, `readInstances(slug)`. Pure filesystem reads rooted at `process.env.WTD_ROOT`.
- **Subprocess bridge:** `src/lib/server/runnerApi.ts` — `streamEvaluate(slug): ReadableStream`. Spawns `uv run --project $WTD_ROOT/cogochi-autoresearch python prepare.py evaluate` with cwd = challenge dir.
- Both bridges are server-side only (`src/lib/server/**`).

**Day-1 NOT in /lab:**
- Backtest strategy builder UI (v3 tabs: strategy / result / order / trades) — old code parked at `src/routes/lab/+page.svelte` stays buildable but is unreachable without redirect
- Per-user LoRA adapter runner (Phase 2+, goes to /training)
- Weekly natural-language report (Phase 2+)
- Feedback pool counter + Manual Fine-tune button (Phase 2+, requires KTO pipeline)
- Character stage bar, archetype badge (permanently out)

**Critical UX rule:** /lab is where challenges LIVE. If you want to create a new one you go to /terminal. If you want to run or inspect one, you stay in /lab.

---

### § 8.3 `/agent/[id]` — **REDIRECTED to /lab (Day-1)**

This route is deprecated for Day-1. Ownership + history now live in `/lab`'s challenge list (left pane) + detail (right pane). The character layer that motivated this page (DOUNI identity, Stage progress, Archetype badge, Reflection log) is entirely out of Day-1 scope (see § 9).

**Day-1 behaviour:**
- Any existing `/agent` or `/agent/[id]` deep link should 302 → `/lab?slug=<id>` (treat the id as a challenge slug rather than an agent id).
- The 1187-line `src/routes/agent/[id]/+page.svelte` stays parked but is never linked.
- Saved patterns list, adapter version history, and reflection log are all absorbed by `/lab` as challenge rows / instance rows. No per-user agent object exists in Day-1.

**Returns in Phase 3** when the character layer (Stage / Archetype / Memory Card grid) comes back for `/battle` and `/passport`. Until then, treat "agent" = "challenge".

---

### § 8.4 `/create` — **DEFERRED (Day-1)**

No onboarding page in Day-1. The former 5-step DOUNI flow (name → archetype → first dialogue → first pattern → scanner check) depended on the character layer and on Supabase-side per-user agents — neither of which exists in Day-1.

**Day-1 behaviour:**
- New users land directly in `/terminal` with an empty state hint ("type a pattern like `btc 4h recent_rally 10% + bollinger_expansion` to start").
- The WTD CLI `python -m wizard.new_pattern` remains as the power-user entry point for authoring challenges outside the UI. It's fully functional and supported.
- The existing `src/routes/create/+page.svelte` (246 lines, 3-step wallet bridge) is left in place but unlinked; `/create` still resolves if visited directly.

**Returns in Phase 2+** if archetype/character flow comes back, OR as a lightweight "connect wallet + seed example patterns" bridge even without character.

---

### § 8.5 `/cogochi/scanner` (and `/scanner`) — **FOLDED into /lab (Day-1)**

Both scanner routes are deprecated for Day-1. The "my saved patterns" use case is served by `/lab`'s left-pane challenge list (each row = a saved challenge with its latest SCORE and enable/disable toggle). The live scan cockpit use case (deep dive, filter bar, scan table) is out of scope — real-time observation happens in `/terminal`, historical evaluation happens via `/lab`'s Run button.

**Day-1 behaviour:**
- `/scanner` stays as a 301 → `/terminal` redirect (already in `src/routes/scanner/+page.ts`).
- `/cogochi/scanner` (the 1634-line legacy cockpit at `src/routes/cogochi/scanner/+page.svelte`) is parked: buildable but unlinked from the Day-1 nav. Not deleted — may revive in Phase 2.
- `/lab` absorbs the three features that actually mattered from the old scanner:
  1. List of saved patterns (now "challenges") with their SCOREs
  2. On/off toggle (stored as a starred flag in the /lab list — not reevaluated)
  3. Deep link back into `/terminal` for the detail view

**Returns in Phase 2** only if a live-scanner cockpit is explicitly requested; most of its functionality is redundant with /terminal + /lab.

---

### § 8.6 `/` — Home Landing (detailed layout in § 16, copy deltas below)

Existing `src/routes/+page.svelte` (1186 lines) stays structurally intact — hero + learning loop + surfaces + footer. The layout rules in § 16 are still valid.

**2026-04-11 copy deltas (Day-1 pivot):**
- Hero CTA primary: `START A CHALLENGE` → `/terminal` (not `/onboard`)
- Hero CTA secondary: `SEE HOW IT SCORES` → `/lab`
- Remove any copy referencing DOUNI / adapter / Stage / Archetype / onboarding
- Proof panel timeline stages: `COMPOSE` · `EVALUATE` · `INSPECT` · `ITERATE` (not `PATTERN/SCAN HIT/VERDICT/DEPLOY`)
- Surfaces section: `Terminal (compose) · Lab (evaluate) · Dashboard (my stuff)`. Drop `Agent`.
- Footer: fix `return-actions` links to point at `/dashboard` and `/lab` only

**Body scroll fix (separate from pivot):**
- Remove `:global(body) { height: 100%; overflow: hidden auto; }` at the top of the `<style>` block. Home must scroll at window level.
- Normalize responsive breakpoints to `1200px` / `768px` / `480px` (was `1180/960/720/540`).

See § 16 for the fuller approved layout (mostly still valid, just re-label the timeline and CTAs per above).

---

### § 8.7 `/dashboard` — My Stuff Inbox (3 sections)

Lightweight return page — 3 stacked sections, one column, no fancy layout. Reads from WTD filesystem + browser local state. No character greeting, no DOUNI name, no morning hype copy.

```
┌─ Dashboard — my stuff ──────────────────────────┐
│                                                  │
│ 1. MY CHALLENGES                                 │
│    sample-rally-pattern    SCORE 0.0234  2h ago │
│    cvd-div-funding-hot     SCORE -1.0    8h ago │
│    bb-squeeze-long         never run             │
│    [+ new from /terminal]                       │
│                                                  │
│ 2. WATCHING                                      │
│    BTC 4H  recent_rally + bb_expansion  ✓ live  │
│    ETH 1H  cvd_bearish + funding_hot    ✓ live  │
│    SOL 4H  volume_spike                 paused  │
│    [+ add from /terminal]                       │
│                                                  │
│ 3. MY ADAPTERS (Phase 2+ placeholder)           │
│    No adapters yet. Adapter training (KTO/LoRA) │
│    comes in Phase 2 via /training.              │
│                                                  │
│ [ OPEN /terminal ]  [ OPEN /lab ]               │
└──────────────────────────────────────────────────┘
```

**Day-1 features:**
1. **MY CHALLENGES** — summary of `/lab` list. Top 5 by latest run time. Clicking a row → `/lab?slug=<slug>`. `[+ new]` → `/terminal`.
2. **WATCHING** — saved live searches from `/terminal`. Day-1 storage: `localStorage["cogochi.watches"]` (array of `{slug, query, createdAt, lastEvaluatedAt}`). Day-2+ promotes to `WTD/watches/*.json` filesystem for cross-device sync.
3. **MY ADAPTERS** — placeholder. Empty state copy explaining Phase 2+ scope. No data source yet.

**Data sources:**
- Challenges: `GET /api/challenges` (filesystem read, same as /lab)
- Watches: client-side `localStorage` (Day-1)
- Adapters: empty array (Phase 2+)

**Day-1 NOT:**
- DOUNI greeting or any character copy
- Missed alerts stream (requires live scanner backend — out of scope)
- Weekly Δ / Feedback pool counter (requires per-user KTO pipeline — Phase 2+)
- Morning recap auto-generation

---

### § 8.8 `/passport/wallet/[chain]/[address]` — Wallet Dossier

**Role:** Terminal이 조사하는 surface라면, Passport wallet dossier는 **저장 가능한 정적 기록 / 공유 가능한 증거 페이지**다.

> **Terminal investigates. Passport remembers.**

**Canonical contract:**
- Terminal은 빠른 탐색과 차트/CVD 연동을 소유한다
- Passport dossier는 저장된 thesis, evidence snapshot, cluster history, alert history를 소유한다
- 동일 주소에 대한 canonical URL은 `/passport/wallet/[chain]/[address]`

**Dossier layout:**

```
┌──────────────────────────────────────────────┐
│ Wallet Dossier Header                        │
│ address · chain · labels · confidence        │
│ [Open in Terminal] [Save Thesis] [Share]     │
├──────────────────────────────────────────────┤
│ 1. Executive Summary                         │
│ 2. Saved Theses / prior analyst notes        │
│ 3. Cluster history timeline                  │
│ 4. Evidence snapshots (tx / counterparties)  │
│ 5. Alert history + outcomes                  │
│ 6. Related tokens / related wallets          │
└──────────────────────────────────────────────┘
```

**Must-have features:**
1. **Stable identity header** — chain/address/labels/known aliases
2. **Saved theses** — "distribution hub", "smart-money accumulation" 같은 과거 판단과 작성 시점
3. **Cluster history** — 집결/분산/브리지/CEX 입금 같은 주요 상태 변화의 시계열
4. **Evidence snapshots** — investigation 시점의 raw evidence를 immutable snapshot으로 저장
5. **Alert outcomes** — 저장한 wallet alert가 실제로 몇 번 발생했고 결과가 어땠는지
6. **Open in Terminal CTA** — dossier에서 즉시 interactive investigation mode로 복귀

**Non-goals:**
- Passport dossier가 live market chart를 소유하지 않는다
- dossier는 chat-first가 아니다. conversation은 Terminal이 소유한다

---

