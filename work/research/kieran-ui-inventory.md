# Kieran.ai — Hypertrader Ledger Dashboard: Complete UI/UX Inventory

**Captured:** 2026-05-05  
**Source:** https://kieran.ai  
**Build tag visible in UI:** `build-02may-atrium`  
**Purpose of this document:** Sufficient detail to clone the frontend in SvelteKit without revisiting the site.

---

## Table of Contents

1. [Site Overview & Architecture](#1-site-overview--architecture)
2. [Sitemap](#2-sitemap)
3. [Overview Tab (default page)](#3-overview-tab-default-page)
4. [Positions Tab](#4-positions-tab)
5. [Signals Tab](#5-signals-tab)
6. [Research Tab](#6-research-tab)
7. [Tape Tab](#7-tape-tab)
8. [Review Tab](#8-review-tab)
9. [Formula Tab](#9-formula-tab)
10. [Component Library Inventory](#10-component-library-inventory)
11. [API Surface](#11-api-surface)
12. [Data Freshness & Polling](#12-data-freshness--polling)
13. [Mobile Responsiveness](#13-mobile-responsiveness)

---

## 1. Site Overview & Architecture

### Stack
- **Framework:** Next.js (React SPA, client-side rendered)
- **Deployment:** Vercel or similar (Next.js `_next/` asset paths confirmed)
- **Theme:** Dark theme (dashboard-style, implied by "diagnostic dashboard" branding)
- **No login gate:** The entire dashboard is publicly accessible with no authentication

### Header (global, persistent across all tabs)
- **Title:** `Hypertrader Ledger Dashboard` (large heading, top-left or top-center)
- **Subtitle:** `diagnostic dashboard · build-02may-atrium` (smaller, muted text below title)
- **Status indicator:** `connecting…` (real-time connection indicator, appears in header region, with ellipsis suggesting animated dots or pulsing state)
- **No logo image detected**

### Global Navigation
Single horizontal tab bar, left-to-right:

| Position | Label | Type | Notes |
|---|---|---|---|
| 1 | `Overview` | Primary nav tab | Default/home tab |
| 2 | `Positions` | Primary nav tab | |
| 3 | `Signals` | Primary nav tab | |
| 4 | `Research` | Primary nav tab | |
| 5 | `Tape` | Primary nav tab | |
| 6 | `Review` | Secondary link (bracketed in source `[Review]`) | Possibly external or sub-route |
| 7 | `Formula` | Secondary link (bracketed in source `[Formula]`) | Possibly external or sub-route |

The `[Review]` and `[Formula]` items are visually or semantically distinct from the first 5 — they may use a different style (e.g., secondary button appearance, different color) or link to sub-routes rather than tab-swap behavior.

---

## 2. Sitemap

All routes are within a single SPA — tab switching is client-side. The URL structure is not confirmed (React SPA may use hash routing or Next.js pages).

| Route / Tab | Title | Primary Purpose |
|---|---|---|
| `/` (Overview) | Hypertrader Ledger Dashboard | Aggregate stats, equity curve, positions summary, signals summary, decision log |
| `/positions` or tab | Positions | Open positions detail, position reviews |
| `/signals` or tab | Signals | Signal feed (24h), signal events |
| `/research` or tab | Research | Hold time analysis, Sharpe drag, macro autoresearch path stats, partial exits |
| `/tape` or tab | Tape / MarketTape Recorder | Tick-by-tick signal timeline (placeholder — "Coming soon") |
| `/review` or route | Review | Position reviews (secondary nav) |
| `/formula` or route | Formula | Formula attribution diagnostic |

**No footer links detected.** No external nav links. No modals or drawer overlays confirmed beyond the "Decision Inspector" inline expand.

---

## 3. Overview Tab (default page)

The Overview tab is the landing page. It is a long vertical scroll with multiple sections stacked.

### 3.1 Layout Structure

```
┌─────────────────────────────────────────────┐
│  HEADER: title + subtitle + status          │
│  NAV TABS: Overview | Positions | Signals…  │
├─────────────────────────────────────────────┤
│  METRIC CARDS ROW (4 cards)                 │
│  [Paper PnL·Gross] [Win Rate] [Risk Util.] [Risk@Stop] │
├─────────────────────────────────────────────┤
│  EQUITY CURVE (full-width chart)            │
├──────────────────┬──────────────────────────┤
│  OPEN POSITIONS  │  CAPITAL & RISK          │
│  (table)         │  (stats panel)           │
├──────────────────┴──────────────────────────┤
│  PnL BY TICKER   │  PnL BY HOLD TIME        │
│  (chart/table)   │  (chart/table)           │
├─────────────────────────────────────────────┤
│  SIGNAL EVENTS · 24h (with ticker filters)  │
├──────────────────┬──────────────────────────┤
│  SIGNALS · 24h   │  DECISION LOG            │
│  (table)         │  (table)                 │
├─────────────────────────────────────────────┤
│  CLOSED PAPER TRADES (table)                │
├──────────────────┬──────────────────────────┤
│  SAMPLE GATES    │  SHARPE DRAG             │
├──────────────────┴──────────────────────────┤
│  HOLD TIME (table)                          │
├──────────────────┬──────────────────────────┤
│  MACRO AUTORESEARCH PATH STATS              │
├─────────────────────────────────────────────┤
│  LONGEST HOLDS (table)                      │
├──────────────────┬──────────────────────────┤
│  PARTIAL EXITS   │  POSITION REVIEWS        │
├─────────────────────────────────────────────┤
│  MARKETTAPE RECORDER (placeholder)          │
├─────────────────────────────────────────────┤
│  DECISION INSPECTOR                         │
└─────────────────────────────────────────────┘
```

### 3.2 Metric Cards Row

Four KPI cards in a horizontal row (likely CSS grid `grid-cols-4` or flexbox). Each card shows:
- **Label** (top)
- **Value** (large number, center)
- Dashes (`—`) shown during loading/connecting state

| Card Label | Value Source | Format | Example |
|---|---|---|---|
| `Paper PnL · Gross` | `stats.total_pnl_usd` | `$X,XXX.XX` | `$1,310.25` |
| `Win Rate` | `stats.win_rate` | `XX.X%` | `40.3%` |
| `Risk Utilization` | `positions.slot_utilization` or runtime | `XX%` | from position runtime data |
| `Risk @ Stop` | derived from position stop levels | `$XXX` or `%` | risk exposure |

**Loading state:** Each card shows `—` (em dash) for both label and value while `connecting…`

### 3.3 Equity Curve

Full-width chart below the KPI row.

- **Chart type:** Line chart (equity curve — confirmed by `equity_reconstructed_snapshots` data source)
- **X-axis:** Timestamps (Unix timestamps from `/api/equity`, displayed as dates)
- **Y-axis:** USD equity value (starts at $2,000 initial basis)
- **Data source:** `GET /api/equity`
- **Key fields plotted:**
  - `mark_to_market_equity_usd` — primary equity line
  - Possibly: `unrealized_pnl_usd`, `realized_pnl_usd` as secondary lines or fill
- **Data shape:**
  ```json
  {
    "points": [
      { "ts": 1776189600.0, "equity": 0.0, "mark_to_market_equity_usd": 2000.0, "realized_pnl_usd": 0.0, "unrealized_pnl_usd": 0.0 },
      ...
      { "ts": 1777925967.3, "equity": 1303.87, "closed_trade_pnl_usd": 481.22, "partial_pnl_usd": 829.03, "unrealized_pnl_usd": -6.38, "open_positions_n": 1 }
    ],
    "pnl_scope": "closed_trades_plus_partial_exits_plus_open_mark_to_market",
    "source": "equity_reconstructed_snapshots.mark_to_market_equity_usd"
  }
  ```
- **Section heading:** `Equity Curve`
- **No explicit tooltip or annotation text confirmed**, but typical for such charts to show value + date on hover

### 3.4 Open Positions Table

Section heading: `Open Positions`

**Columns (left to right):**

| Column Header | API Field | Format |
|---|---|---|
| `Ticker` | `positions[].ticker` | String: `BTC`, `ETH`, etc. |
| `Side` | `positions[].direction` | `long` / `short` |
| `Entry` | `positions[].entry_price` | Numeric, asset-appropriate decimals |
| `Mark` (or `Now`) | `positions[].current_price` | Numeric |
| `Size` | `positions[].size_usd` | `$X,XXX.XX` |
| `Lev` | `positions[].leverage` | `Nx` (e.g., `2x`) |
| `Age` | `positions[].age_hours` | `X.Xh` |
| `uPnL` | `positions[].unrealized_usd` | `$X.XX` (green if positive, red if negative) |
| `Funding/Fees` | `positions[].execution_costs.estimated_funding_since_entry_usd` | `$X.XX` |

**Data source:** `GET /api/positions`

**Example row data (from API):**
```
BTC | short | 79409.50 | 79933.50 | $924.54 | 2x | 5.7h | -$6.10 | -$0.003
```

**Color conventions:**
- `Side`: `long` likely green text, `short` likely red/orange text
- `uPnL`: green for positive, red for negative

**Interaction:** Clicking a row likely populates the "Decision Inspector" section below (see §3.11)

**Empty state:** Table shows no rows (or a placeholder message) when no positions are open

### 3.5 Capital & Risk Panel

Section heading: `Capital & Risk`

**Fields (vertical list or 2-column key-value pairs):**

| Label | API Field / Source | Format |
|---|---|---|
| `Basis` | Base capital (initial equity) | `$X,XXX` |
| `Equity` | Current mark-to-market equity | `$X,XXX.XX` |
| `Risk Budget` | Derived from capital × risk % | `$XXX` |
| `Per-Trade Cap` | Position sizing policy cap | `$XXX` or `X%` |
| `N` | `stats.total_trades` or open position count | Integer |
| `Status` | `stats.optimization_status` | String: `blocked`, `ok`, etc. |

**Data source:** Combination of `/api/stats` and `/api/positions`

**Color for Status:** `blocked` likely red/orange; `ok` likely green

### 3.6 PnL by Ticker

Section heading: `PnL by Ticker`

- **Chart type:** Bar chart or horizontal bar chart — one bar per ticker
- **Data source:** `stats.by_ticker` object from `GET /api/stats`
- **Tickers shown:** BTC, DOGE, ETH, HYPE, SOL, TAO, XRP, ZEC
- **Values available:** `pnl_usd`, `win_rate`, `trades`, `wins`
- **Color:** Green bars for positive PnL, red bars for negative PnL

**Example values:**
```
XRP:  +$417.26
ETH:  +$279.84
BTC:  +$153.46
DOGE: +$59.55
TAO:  -$30.01
HYPE: -$68.92
SOL:  -$118.12
ZEC:  -$211.84
```

### 3.7 PnL by Hold Time

Section heading: `PnL by Hold Time`

- **Chart type:** Bar chart bucketed by duration, or table
- **Data source:** Derived from `/api/trades` `duration_hours` + `pnl_usd`
- **Bucket labels:** Implied by Research tab's "Hold Time Analysis" columns (see §6)

### 3.8 Signal Events · 24h

Section heading: `Signal Events · 24h`

**Ticker filter pills (horizontal row):**
`ALL` | `ZEC` | `BTC` | `ETH` | `SOL` | `HYPE` | `TAO` | `DOGE` | `XRP`

- Active filter pill: likely highlighted (different background color or underline)
- Default: `ALL` selected

**Columns:**

| Column | API Field | Format |
|---|---|---|
| `Time` | `signals[].timestamp` | Relative (`Xm ago`) or absolute time |
| `Ticker` | `signals[].ticker` | Uppercase string |
| `Signal/Detail` | `signals[].signal_name` + `signals[].detail` | Signal name + description text |
| `T` | `signals[].tier` | Integer: `1`, `2`, etc. |
| `Bias` | `signals[].bias` | `long` / `short` / `neutral` |
| `Conf` | `signals[].confidence` | `0.X` (e.g., `0.70`) |
| `×` | — | Dismiss/close button for that signal row |

**Data source:** `GET /api/signals`

**Unique signal names observed:**
- `momentum_shift`
- `range_resistance_touch`
- `vwap_rejection`
- `vwap_reclaim`
- `oi_divergence_bearish`
- `oi_divergence_bullish`
- `oi_surge`

**Severity values:** `alert`, `info`, `neutral`
**Total signals in feed:** 103 (at time of capture)
**Confidence range:** 0.5–0.7
**Count field:** Number of consecutive occurrences of the same signal for that ticker (range: 1–60)

**Color conventions:**
- `Bias = long`: green
- `Bias = short`: red/pink
- `Severity = alert`: possibly bold or accent color
- `Severity = info`: muted

### 3.9 Signals · 24h (Decision Log / Secondary Table)

Note: There appear to be two signals-related panels. The primary one has the ticker filters (§3.8). This is a second, separate table.

Section heading: `Signals · 24h` (possibly this is the same section — see also Decision Log)

**Columns:**

| Column | Description |
|---|---|
| `Time` | Timestamp of signal event |
| `Ticker` | Asset symbol |
| `Level` | Tier level (1, 2, etc.) |
| `Bias` | `long` / `short` |
| `Score` | Numeric score (e.g., effective_score from trade metadata) |
| `Aligned` | Boolean or Yes/No — whether signal aligned with position |
| `Signals` | Signal name(s) contributing |

### 3.10 Decision Log

Section heading: `Decision Log`

**Columns (identical structure to Signals · 24h table above):**

| Column | Description |
|---|---|
| `Time` | Timestamp |
| `Ticker` | Asset symbol |
| `Level` | Tier level |
| `Bias` | `long` / `short` |
| `Score` | Effective score |
| `Aligned` | Alignment flag |
| `Signals` | Contributing signals |

**Interaction:** Clicking a row populates the "Decision Inspector" panel

### 3.11 Closed Paper Trades Table

Section heading: `Closed Paper Trades`

**Columns (left to right):**

| Column | API Field | Format |
|---|---|---|
| `Exit` | `timestamp_exit` | Date/time string |
| `Ticker` | `ticker` | Uppercase |
| `Side` | `direction` | `long` / `short` |
| `PnL` | `pnl_usd` | `$XX.XX` (green/red) |
| `%` | `pnl_pct` | `X.XX%` (green/red) |
| `Dur` | `duration_hours` | `X.Xh` |
| `Reason` | `exit_reason` | Raw string: `tp3`, `trailing_stop`, `stale_no_progress`, `position_policy_cleanup`, `replaced_by_opposite_signal`, `openclaw_weak_btc_range_resistance_family_under_new_empirical_guard` |
| `Lifecycle` | `lifecycle_summary` or `trade_events` count | Badge or summary string |

**Data source:** `GET /api/trades`

**Color conventions:**
- Positive PnL row: green text for PnL and %
- Negative PnL row: red text for PnL and %
- `Side` column: color-coded (long=green, short=red)

**Total trades:** 119 closed trades (at time of capture)

### 3.12 Sample Gates

Section heading: `Sample Gates`

**Columns:**

| Column | Description |
|---|---|
| `Variable` | Variable name (e.g., `slot_utilization`) |
| `Value` | Current value / bucket |
| `N` | Sample count |
| `Status` | `ok`, `watch`, `learning` |

**Data source:** `GET /api/formula-attribution` — from `variables` array

### 3.13 Sharpe Drag

Section heading: `Sharpe Drag`

**Columns:**

| Column | Description |
|---|---|
| `Cohort` | Trade cohort grouping (by ticker, side, regime, etc.) |
| `N` | Number of trades in cohort |
| `PnL` | Total PnL for cohort |
| `Win` | Win rate |
| `Trade Sharpe` | `sharpe_per_trade` for cohort |

**Data source:** `GET /api/stats` — `by_ticker`, `by_side`, `by_ticker_side` sub-objects

### 3.14 Hold Time Analysis

Section heading: `Hold Time` (or `Hold Time Analysis`)

**Columns:**

| Column | Description |
|---|---|
| `Bucket` | Duration bucket (e.g., `0-2h`, `2-8h`, `8-24h`, `>24h`) |
| `N` | Number of trades in bucket |
| `Avg Hold` | Average hold time |
| `Total` | Total PnL for bucket |
| `Avg R` | Average R-multiple |
| `R/h` | R per hour |
| `PnL/h` | PnL per hour |
| `Win` | Win rate |
| `Capture` | Capture rate (MFE vs actual exit %) |

**Data source:** Derived from `/api/trades` fields: `duration_hours`, `pnl_usd`, `max_favorable_r`, `max_favorable_pct`

### 3.15 Macro Autoresearch Path Stats

Section heading: `Macro Autoresearch Path Stats`

**Columns:**

| Column | Description |
|---|---|
| `Candidate` | Trade candidate / signal path name |
| `N` | Number of candidates |
| `Fee R` | Fee as R-multiple |
| `Cost R` | Total cost as R |
| `Cost Scope` | Cost category |
| `T1` | TP1 hit rate |
| `T2` | TP2 hit rate |
| `T3` | TP3 hit rate |
| `Time→T1` | Average time to first take-profit |
| `Giveback` | Average peak giveback % |
| `Blockers` | Number of blocked candidates |

**Data source:** Derived analytics, likely from `/api/trades` with entry_meta_json analysis

### 3.16 Longest Holds

Section heading: `Longest Holds`

**Columns:**

| Column | Description |
|---|---|
| `Ticker` | Asset symbol |
| `Side` | `long` / `short` |
| `Dur` | Duration (hours) |
| `PnL` | PnL in USD |
| `R` | R-multiple |
| `R/h` | R per hour |
| `Capture` | Capture rate |
| `Exit` | Exit reason |

**Data source:** Sorted subset of `/api/trades` by `duration_hours` descending

### 3.17 Partial Exits

Section heading: `Partial Exits`

**Columns:**

| Column | Description |
|---|---|
| `Reason` | Exit reason for the partial |
| `N` | Number of partial exits |
| `Avg` | Average partial exit % |
| `Total` | Total PnL from partials |
| `Avg PnL` | Average PnL per partial |

**Data source:** Derived from `/api/trades` `trade_events` arrays (events where `event_type = take_profit` and position not fully closed)

### 3.18 Position Reviews

Section heading: `Position Reviews`

**Columns:**

| Column | Description |
|---|---|
| `Position` | Ticker + direction identifier |
| `Age` | Age of position in hours |
| `Baseline` | Baseline PnL reference |
| `DD` | Drawdown |
| `Queued` | Queued action indicator |
| `Blocked` | Whether position review is blocked |
| `Reason` | Reason string |

**Data source:** Likely from `/api/positions` enriched with review logic

### 3.19 MarketTape Recorder

Section heading: `MarketTape Recorder`

**State:** Placeholder / Coming Soon

**Text shown:** `Coming soon`
**Implied description:** "Tick-by-tick signal timeline, alert firehose, position lifecycle events"

No interactive elements currently present.

### 3.20 Decision Inspector

Section heading: `Decision Inspector`

**Default state text:** `Select a row to inspect decision context.`

**Behavior:** When a row is clicked in the Decision Log or Open Positions table, this panel populates with detailed context for that decision/position.

**Likely fields shown (based on trade API data):**
- Signal list contributing to decision
- Effective score
- Entry conviction level
- Regime at entry
- Position sizing details
- Entry meta (entry block logic version, dominant signal, planned vs actual entry)
- Risk parameters

---

## 4. Positions Tab

The Positions tab likely surfaces the same data as the Overview's position sections but in more detail, possibly full-page.

**Expected content (based on API and Overview tab):**

### 4.1 Open Positions Table (expanded)

Same columns as Overview (§3.4), possibly with additional columns or a detail expand:
- `Ticker` | `Side` | `Entry` | `Mark` | `Size` | `Lev` | `Age` | `uPnL` | `Funding/Fees`

**Additional detail on click:** Execution costs breakdown panel showing:
- `funding_rate`: e.g., `4.4106e-06`
- `funding_rate_pct_8h`: `0.00044%`
- `estimated_funding_since_entry_usd`
- `estimated_entry_fee_usd`
- `estimated_exit_fee_usd`
- `estimated_round_trip_fee_usd`
- `estimated_spread_cost_usd`
- `estimated_slippage_usd`
- `estimated_open_cost_usd`
- `spread_bps`
- `top_bid` / `top_ask`
- `telemetry_quality`: `partial_missing_next_funding_time`
- `missing_fields`: array of missing fields

**Signals on open position:**
Each position carries attached signals (from `positions[].signals` array):
- `name`: e.g., `vwap_reclaim`
- `tier`: `1`
- `severity`: `info`
- `bias`: `long`
- `confidence`: `0.5`
- `feature_group`: `momentum`

### 4.2 Position Reviews Table

Same as Overview §3.18 — `Position | Age | Baseline | DD | Queued | Blocked | Reason`

---

## 5. Signals Tab

Dedicated full-page view of the signals feed.

### 5.1 Signals Feed

**Same structure as Overview §3.8 (Signal Events · 24h)**

**Ticker filter pills:** `ALL` | `ZEC` | `BTC` | `ETH` | `SOL` | `HYPE` | `TAO` | `DOGE` | `XRP`

**Table columns:** `Time` | `Ticker` | `Signal/Detail` | `T` | `Bias` | `Conf` | `×`

**Signal types displayed (7 unique signal_names):**
1. `momentum_shift` — "Bearish EMA cross: 8 EMA crossed below 21 EMA on 2h"
2. `range_resistance_touch` — "Price X within 1.0% of 56d high Y"
3. `vwap_rejection` — "Price rejected at daily VWAP X"
4. `vwap_reclaim` — "Price reclaimed daily VWAP X"
5. `oi_divergence_bearish` — OI divergence bearish pattern
6. `oi_divergence_bullish` — OI divergence bullish pattern
7. `oi_surge` — OI surge alert

**Detail text examples (verbatim from API):**
- `"Bearish EMA cross: 8 EMA crossed below 21 EMA on 2h"`
- `"Price 79933.50 within 1.0% of 56d high 80762.00"`
- `"Price rejected at daily VWAP 41.59"`
- `"Price rejected at daily VWAP 2353.64"`
- `"Price rejected at daily VWAP 1.40"`

**`×` column:** Dismiss button for individual signal rows

### 5.2 Signal Badge Color Convention
- `severity = alert` + `bias = short`: Red/orange accent
- `severity = alert` + `bias = long`: Green accent
- `severity = info` + any bias: Muted/gray accent
- `severity = neutral`: Neutral gray

---

## 6. Research Tab

Research tab contains analytical breakdowns derived from closed trade history.

### 6.1 Hold Time Analysis

Section heading: `Hold Time Analysis`

**Columns:** `Bucket` | `N` | `Avg Hold` | `Total` | `Avg R` | `R/h` | `PnL/h` | `Win` | `Capture`

**Bucket examples (implied):**
- `<1h`
- `1-4h`
- `4-12h`
- `12-24h`
- `>24h`

### 6.2 Sharpe Drag Analysis

Section heading: `Sharpe Drag`

**Columns:** `Cohort` | `N` | `PnL` | `Win` | `Trade Sharpe`

**Cohort breakdown from API data:**
By ticker: BTC, DOGE, ETH, HYPE, SOL, TAO, XRP, ZEC
By side: long, short
By ticker+side: BTC:long, BTC:short, ETH:long, etc.

### 6.3 Macro Autoresearch Path Stats

Section heading: `Macro Autoresearch Path Stats`

**Columns:** `Candidate` | `N` | `Fee R` | `Cost R` | `Cost Scope` | `T1` | `T2` | `T3` | `Time→T1` | `Giveback` | `Blockers`

### 6.4 Partial Exits

Section heading: `Partial Exits`

**Columns:** `Reason` | `N` | `Avg` | `Total` | `Avg PnL`

### 6.5 Longest Holds

Section heading: `Longest Holds`

**Columns:** `Ticker` | `Side` | `Dur` | `PnL` | `R` | `R/h` | `Capture` | `Exit`

---

## 7. Tape Tab

### 7.1 MarketTape Recorder

**State:** Not yet implemented — placeholder

**Text shown verbatim:** `Coming soon`

**Implied purpose:** "Tick-by-tick signal timeline, alert firehose, position lifecycle events"

**Status:** This tab exists in the nav but has no functional content at time of capture.

---

## 8. Review Tab

The `[Review]` navigation item (shown in brackets, indicating secondary status) likely contains:

### 8.1 Position Reviews (full page)

Expanded version of the Position Reviews table from Overview:

**Columns:** `Position` | `Age` | `Baseline` | `DD` | `Queued` | `Blocked` | `Reason`

This may include additional detail rows, expanded decision context, or filtering capabilities not available in the Overview summary.

---

## 9. Formula Tab

The `[Formula]` navigation item corresponds to the formula attribution diagnostic.

**Data source:** `GET /api/formula-attribution`

### 9.1 Response structure

Top-level fields:
```json
{
  "status": "ok",
  "diagnostic_only": true,
  "sample_rows": 1500,
  "settings": [...],
  "variables": [...],
  "review_queue": [...],
  "notes": [...],
  "warnings": [
    "read_only_no_tuning",
    "barrier_labels_required_for_mature_outcomes"
  ]
}
```

### 9.2 Settings Overview Table

**Settings tracked (4):**
1. `portfolio_capacity` — status: `watch`
2. `position_sizing` — status: `ok`
3. `regime_penalty` — status: `learning`
4. `tier2_score` — status: `learning`

**Columns for settings table:**

| Column | Field | Description |
|---|---|---|
| `Setting` | `setting` | Setting group name |
| `N` | `n` | Total sample count |
| `Variables` | `variables` | Number of tracked variables |
| `Watch` | `watch_variables` | Variables flagged for review |
| `Status` | `status` | `ok`, `watch`, `learning` |

### 9.3 Variables Table

**10 unique variables tracked:**
1. `slot_utilization` (portfolio_capacity)
2. `penalty_applied` (regime_penalty)
3. `leverage_cap` (position_sizing)
4. `counter_multiplier` (regime_penalty)
5. `regime_distance` (regime_penalty)
6. `entry_flip` (tier2_score)
7. `selected_equity_usd` (position_sizing)
8. `candidate_risk_pct` (position_sizing)
9. `risk_pct` (position_sizing)
10. `resize_block` (position_sizing)

**Columns for variables table:**

| Column | Field | Description |
|---|---|---|
| `Setting` | `setting` | Parent setting group |
| `Variable` | `variable` | Variable name |
| `Bucket` | `bucket` | Value range bucket (e.g., `67-99%`, `5-8x`, `<0.25`) |
| `N` | `n` | Sample count |
| `Accepted` | `accepted_n` | Accepted trades |
| `Labeled` | `labeled_n` | Labeled outcomes |
| `TP` | `tp_n` | Take-profit outcomes |
| `Stop` | `stop_n` | Stop-loss outcomes |
| `Timeout` | `timeout_n` | Timeout outcomes |
| `Avg Score` | `avg_score` | Mean score in bucket |
| `Stop Rate` | `stop_rate` | Stop frequency |
| `TP Rate` | `tp_rate` | TP frequency |
| `Status` | `status` | `ok`, `watch`, `learning` |

### 9.4 Review Queue

Single P1 item:
```
Priority: P1
Setting: portfolio_capacity
Variable: slot_utilization
Bucket: 67-99%
Reason: stop_rate=0.67, avg_score=-0.162
```

**Status badge colors (implied):**
- `P1`: Red/critical
- `watch`: Orange/yellow
- `learning`: Blue/neutral
- `ok`: Green

### 9.5 Notes / Audit Log

Historical notes with fields: `id`, `timestamp`, `setting`, `variable`, `bucket`, `severity`, `status`, `note` (plain text description), `suggested_action`

**Note text example (verbatim):**
`"portfolio_capacity/slot_utilization/67-99%: n=51, accepted=0.10, tp=0.33, stop=0.67, avg_score=-0.1624732014564544"`

**Suggested action text (verbatim):**
`"review variable bucket before any tuning; collect more labels if low-sample"`

### 9.6 Top Suspects Panel

Each setting's top-suspect buckets are surfaced visually:

**Example (portfolio_capacity/slot_utilization/67-99%):**
- n=51, accepted=5 (9.8%), tp=17 (33.3%), stop=34 (66.7%)
- avg_score=-0.162 → NEGATIVE (bad)
- Status: `watch`

---

## 10. Component Library Inventory

### 10.1 Navigation

**Top Nav Tab Bar:**
- Horizontal row of text tabs
- Active tab: distinct visual treatment (underline, background highlight, or color change)
- 5 primary tabs + 2 secondary items (bracketed)
- Secondary items may use a lighter weight or different color

### 10.2 KPI / Metric Cards

- Rectangular cards in a horizontal row
- **Loading state:** Shows `—` (em dash) for all values
- Label text: small, muted
- Value text: large, prominent
- Likely: white or light number on dark card background
- 4 cards in the visible layout

### 10.3 Status Indicator

- Text: `connecting…` during websocket/polling initialization
- Location: near the header subtitle or top-right
- Likely animated (pulsing dot or animated ellipsis)
- Changes to a connected/live state once data loads

### 10.4 Data Tables

Multiple tables throughout the dashboard. Common attributes:

- **Header row:** Sticky or non-sticky, muted label text
- **Rows:** Alternating shade or flat dark rows
- **Hover state:** Row highlight on hover
- **Sortable columns:** Implied by dashboard context (not confirmed)
- **Pagination:** Not confirmed — likely shows all rows or has implicit limit
- **Color coding in cells:**
  - PnL positive: green text
  - PnL negative: red text
  - Side `long`: green
  - Side `short`: red/pink
  - Status `watch`: orange/yellow
  - Status `ok`: green
  - Status `learning`: blue/gray

### 10.5 Ticker Filter Pills

Used in Signal Events section:

```
[ALL] [ZEC] [BTC] [ETH] [SOL] [HYPE] [TAO] [DOGE] [XRP]
```

- Horizontal row of pill/chip buttons
- Active pill: filled background, contrasting text
- Inactive pill: outline or muted background
- Single-select (radio behavior)

### 10.6 Status Badges

Used in Formula tab for setting/variable status:

| Badge text | Implied color |
|---|---|
| `ok` | Green |
| `watch` | Orange/yellow |
| `learning` | Blue/gray |
| `blocked` | Red |

Used in optimization_status from `/api/stats`:
- `blocked`: Red badge

Used in priority labels (review_queue):
- `P1`: Red/critical badge

### 10.7 Charts

**Equity Curve:** Line chart (time series)
- X-axis: Date/time
- Y-axis: USD equity
- Likely uses Recharts or a similar React charting library

**PnL by Ticker:** Horizontal or vertical bar chart
- Colors: Green bars (positive PnL), Red bars (negative PnL)

**PnL by Hold Time:** Bar chart bucketed by duration

### 10.8 Decision Inspector Panel

- Appears at the bottom of the page
- Default state: instructional text `"Select a row to inspect decision context."`
- Active state: populates with decision detail cards/fields

### 10.9 Placeholder / Coming Soon Block

- Section heading visible
- Body text: `Coming soon`
- No interactive elements

### 10.10 Close Button

- A `Close` button appears (possibly for a modal or the Decision Inspector panel)
- Exact position: bottom of Decision Inspector or modal overlay

### 10.11 Typography Scale (inferred)

| Usage | Size (approximate) |
|---|---|
| Page title | `text-2xl` or `text-3xl` (24–30px) |
| Section headings | `text-lg` or `text-xl` (18–20px) |
| Table headers | `text-sm` (14px), likely uppercase or muted |
| Table body | `text-sm` (13–14px) |
| KPI values | `text-2xl` or `text-3xl` (24–32px), bold |
| KPI labels | `text-xs` or `text-sm` (11–13px), muted |
| Subtitle / build tag | `text-xs` or `text-sm` (11–13px), muted |
| Badge / pill text | `text-xs` (10–12px) |

### 10.12 Color / Theme

**Theme:** Dark (implied by "diagnostic dashboard" style, confirmed by monitoring-tool aesthetic)

**Color conventions inferred from data semantics:**
- Background: dark gray or near-black (e.g., `#0f1117`, `#111827`, or similar)
- Card background: slightly lighter dark (e.g., `#1a1f2e`)
- Text primary: white or light gray
- Text muted: medium gray (subtitles, headers, labels)
- Accent green: positive PnL, long positions, ok status
- Accent red: negative PnL, short positions, blocked/alert status
- Accent orange/yellow: `watch` status, warnings
- Accent blue: `learning` status
- Border: subtle dark border between sections

---

## 11. API Surface

### Confirmed Working Endpoints

| Method | Path | Returns | Used By |
|---|---|---|---|
| `GET` | `/api/health` | `{"ok":true,"db":true,"micro_db":true,"ts":...}` | Status indicator |
| `GET` | `/api/stats` | Full stats object (see below) | Overview KPIs, Sharpe Drag, PnL by Ticker |
| `GET` | `/api/equity` | `{"points":[...],"pnl_scope":"...","source":"..."}` | Equity Curve |
| `GET` | `/api/positions` | `{"positions":[...]}` | Open Positions table |
| `GET` | `/api/signals` | `{"signals":[...]}` | Signal Events, Signals feed |
| `GET` | `/api/trades` | Array of closed trade objects | Closed Trades table, analytics |
| `GET` | `/api/formula-attribution` | Formula diagnostic object | Formula tab |

### Confirmed 404 Endpoints

| Path | Notes |
|---|---|
| `/api/regime` | Returns 404 — appears planned but not yet implemented |
| `/api/closed-trades` | Returns 404 — trades served from `/api/trades` instead |

### `/api/stats` Schema (complete)

```json
{
  "total_trades": 119,
  "wins": 48,
  "losses": 66,
  "win_rate": 40.34,
  "total_pnl_usd": 1310.25,
  "closed_trade_pnl_usd": 481.22,
  "active_partial_pnl_usd": 829.03,
  "pnl_scope": "closed_trades_plus_active_partial_exits",
  "cost_scope": "paper_gross_no_fees_or_slippage",
  "optimization_status": "blocked",
  "promotion_allowed": false,
  "warnings": ["paper_gross_no_fees_or_slippage", "partial_exits_exclude_ignored_for_research", "portfolio_sharpe_small_daily_n:20", "ignored_partial_exit_rows:9"],
  "avg_win_usd": 59.56,
  "avg_loss_usd": -36.03,
  "best_trade": { "ticker": "ETH", "pnl_usd": 340.29, "pnl_pct": 10.29 },
  "worst_trade": { "ticker": "SOL", "pnl_usd": -309.28, "pnl_pct": -8.62 },
  "max_drawdown_usd": 733.90,
  "profit_factor": 1.20,
  "sharpe_per_trade": 0.055,
  "sharpe_n": 119,
  "sharpe_scope": "closed_trade_pnl_usd_per_trade_unannualized",
  "portfolio_sharpe": 0.080,
  "portfolio_sharpe_annualized": 7.50,
  "portfolio_sharpe_daily_annualized": 5.58,
  "portfolio_sharpe_n": 478,
  "portfolio_sharpe_daily_n": 20,
  "portfolio_sharpe_source": "equity_reconstructed_snapshots.mark_to_market_equity_usd",
  "portfolio_sharpe_scope": "daily_mark_to_market_equity_returns_headline_hourly_context",
  "by_ticker": { "BTC": {"trades":14,"wins":5,"pnl_usd":153.46,"win_rate":35.71,"sharpe_per_trade":0.170}, ... },
  "by_side": { "long": {"trades":56,...}, "short": {"trades":63,...} },
  "by_ticker_side": { "BTC:long": {...}, "ETH:short": {...}, ... }
}
```

### `/api/positions` Schema (complete single-position example)

```json
{
  "positions": [{
    "id": "4689370e-...",
    "ticker": "BTC",
    "direction": "short",
    "entry_price": 79409.5,
    "current_price": 79933.5,
    "size_usd": 924.54,
    "remaining_size_usd": 924.54,
    "original_size_usd": 924.54,
    "partial_exit_adjusted": false,
    "leverage": 2,
    "timestamp_entry": 1777905449.68,
    "age_hours": 5.70,
    "unrealized_pct": -0.660,
    "unrealized_usd": -6.10,
    "signals": [{ "name":"vwap_reclaim","tier":1,"severity":"info","bias":"long","confidence":0.5,"feature_group":"momentum" }],
    "execution_costs": {
      "available": true,
      "source": "shadow_execution_intents",
      "cost_scope": "fee_spread_slippage_depth_funding",
      "telemetry_quality": "partial_missing_next_funding_time",
      "funding_rate": 4.41e-6,
      "funding_rate_pct_8h": 0.00044,
      "estimated_funding_since_entry_usd": -0.0029,
      "estimated_entry_fee_usd": 0.416,
      "estimated_exit_fee_usd": 0.416,
      "estimated_round_trip_fee_usd": 0.832,
      "estimated_spread_cost_usd": 0.0058,
      "estimated_slippage_usd": 0.231,
      "estimated_open_cost_usd": 0.650,
      "spread_bps": 0.126,
      "top_bid": 79409.0,
      "top_ask": 79410.0,
      "missing_fields": ["next_funding_time","queue_ahead","queue_estimate"]
    }
  }]
}
```

### `/api/trades` Schema (complete field list)

All unique fields observed:
```
id, alert_id, timestamp_entry, timestamp_exit, ticker, direction,
entry_price, exit_price, stop_price, tp1, tp2, tp3,
size_usd, size_coin, leverage,
exit_reason, pnl_usd, pnl_pct,
max_drawdown_pct, max_favorable_pct, duration_hours,
entry_conviction, regime_at_entry,
entry_meta_json (object — see below),
regime_slope_pct_per_hr, regime_threshold_pct_per_hr,
effective_score, regime_penalty_applied,
conviction_before_penalty, regime_distance_to_threshold, regime_label_version,
window_signals_json,
remaining_size_usd, remaining_size_coin,
tp1_hit, tp2_hit, tp3_hit,
runtime_value_used_json, equity_basis_type, basis_source, basis_timestamp,
selected_equity_usd, live_open_positions_n, live_max_open_positions,
slot_utilization, rejected_by_max_positions, max_positions_block_type,
live_counter_regime_multiplier, accepted_penalty_exercised_n, rejected_due_to_regime_penalty_n,
risk_pct, risk_usd, deployed_risk_usd, leverage_cap,
conviction_after_penalty, max_adverse_pct, max_favorable_r, max_adverse_r,
max_peak_giveback_pct, atr_at_entry,
mfe_first_seen_ts, mfe_time_offset_hours, mfe_price,
tp1_hit_ts, tp2_hit_ts, tp3_hit_ts,
trade_events (array), lifecycle_summary, raw_exit_reason,
stored_pnl_usd, stored_pnl_pct, pnl_corrected_on_read, signals
```

**`entry_meta_json` fields:**
```
entry_block_logic_version, position_sizing_policy (version, target_risk_pct,
selected_equity_usd, target_margin_pct), dominant_signal_name, dominant_signal_bias,
planned_entry_price, actual_entry_price, actual_risk_pct,
conflict_bypassed, conflict_bypass_reason
```

**`trade_events` array item fields:**
```
id, trade_id, event_seq, event_type, event_reason, timestamp,
ticker, direction, price, size_usd, size_coin,
remaining_size_usd, remaining_size_coin,
pnl_usd, pnl_pct, cumulative_pnl_usd, cumulative_pnl_pct, r_multiple,
stop_price_after, source_table, source_id, ignored_for_research,
metadata (object)
```

**`event_type` values:** `open`, `take_profit`

**Unique `exit_reason` values:**
- `tp3`
- `trailing_stop`
- `position_policy_cleanup`
- `stale_no_progress`
- `replaced_by_opposite_signal`
- `openclaw_weak_btc_range_resistance_family_under_new_empirical_guard`

**Unique `entry_conviction` values:** `LOW`

**Unique `regime_at_entry` values:** `range`

### `/api/signals` Schema (single signal object)

```json
{
  "ticker": "TAO",
  "signal_name": "momentum_shift",
  "tier": 1,
  "severity": "alert",
  "bias": "short",
  "timestamp": 1777925986.27,
  "confidence": 0.65,
  "value": -0.3324,
  "detail": "Bearish EMA cross: 8 EMA crossed below 21 EMA on 2h",
  "count": 20
}
```

### `/api/equity` Schema

```json
{
  "points": [
    { "ts": float, "equity": float, "realized_pnl_usd": float, "unrealized_pnl_usd": float, "mark_to_market_equity_usd": float },
    ...
    { "ts": float, "equity": float, "closed_trade_pnl_usd": float, "partial_pnl_usd": float, "unrealized_pnl_usd": float, "open_positions_n": int, "priced_positions_n": int }
  ],
  "pnl_scope": "closed_trades_plus_partial_exits_plus_open_mark_to_market",
  "source": "equity_reconstructed_snapshots.mark_to_market_equity_usd"
}
```

Note: intermediate points have a different schema than the final point.

### `/api/health` Schema

```json
{ "ok": true, "db": true, "micro_db": true, "ts": 1777925961.40 }
```

---

## 12. Data Freshness & Polling

### Status Indicator
- The `connecting…` text in the header strongly implies a WebSocket or SSE connection for live data
- Once connected, this indicator likely changes state (disappears or shows green "live")

### Polling / WebSocket inference
- **`/api/health`**: Used to establish connection status. Likely polled on a short interval (5–30s)
- **`/api/positions`**: Live positions — likely polled frequently (5–15s) or via WebSocket
- **`/api/signals`**: Signal feed — likely polled or streamed (new signals pushed)
- **`/api/equity`**: Less frequent — hourly snapshots in the data suggest polling every 1h
- **`/api/stats`**: Aggregate stats — likely refreshed when trades close (event-based or 30–60s polling)
- **`/api/trades`**: Historical — likely refreshed after new trade closes

### Last-Updated Timestamps
- `/api/health` response includes `ts` field (Unix timestamp)
- `/api/equity` final point includes current timestamp
- No explicit "last updated" label confirmed in the UI

### WebSocket
- The `connecting…` indicator + real-time dashboard nature strongly suggests WebSocket usage
- No WebSocket endpoint URL confirmed from static analysis

---

## 13. Mobile Responsiveness

### Assessment
- **Primary target:** Desktop / wide-screen dashboard
- The layout (4-column KPI row, side-by-side tables, equity curve) strongly implies desktop-first design
- No explicit mobile breakpoints or responsive classes confirmed from WebFetch analysis
- The "diagnostic dashboard" label suggests internal/research tooling, not a mobile-first consumer app

### Likely Behavior on Mobile
- KPI cards: stack vertically (1 column)
- Tables: horizontal scroll within container
- Charts: full width, height adjusts
- Navigation: possibly collapses to hamburger or horizontal scroll
- Side-by-side panels: stack vertically

### Conclusion
Mobile support is likely minimal or treated as "usable but not optimized." The dashboard is clearly designed for desktop viewing with multiple data-dense tables visible simultaneously.

---

## Appendix A: Data Values Reference

### Ticker Universe (8 assets)
`BTC`, `ETH`, `SOL`, `XRP`, `DOGE`, `TAO`, `HYPE`, `ZEC`

### Number Formatting
- **USD amounts:** `$X,XXX.XX` (2 decimal places, comma separators)
- **Percentages:** `XX.X%` (1 decimal place)
- **Prices (BTC/ETH):** Full precision (e.g., `79409.5`, `2353.64`)
- **Prices (DOGE):** 6 decimal places (e.g., `0.113255`)
- **Leverage:** `Nx` (e.g., `2x`)
- **Age/Duration:** `X.Xh` (hours with 1 decimal)
- **Confidence:** `0.X` (1 decimal, range 0.5–0.7)
- **R-multiple:** `X.XX` (2 decimal places)
- **Score:** signed float (e.g., `-0.162`, `2.43`)

### Regime Labels Seen
- `range` (only value observed in current dataset)

### Entry Conviction Labels
- `LOW` (only value observed; `MEDIUM`, `HIGH` likely exist)

### Portfolio State (at time of capture)
- Initial basis: $2,000
- Current equity: ~$3,303 (initial + $1,303 PnL)
- Total trades: 119
- Win rate: 40.3%
- Profit factor: 1.20
- Open positions: 1 (BTC short, $924.54, 2x leverage)

---

## Appendix B: Empty / Loading States

| Component | Loading State | Empty State |
|---|---|---|
| KPI Cards | `—` (em dash) for value | N/A (always shows a number or dash) |
| Status indicator | `connecting…` | Implied: changes to "live" or disappears |
| Open Positions table | No data yet visible | Likely: "No open positions" or empty rows |
| Closed Trades table | — | Likely: empty table with headers |
| Equity Curve | No chart rendered | Likely: blank chart area |
| Decision Inspector | `"Select a row to inspect decision context."` | Same as default |
| MarketTape Recorder | `"Coming soon"` | Permanent placeholder |
| Signal Events | Empty table | Likely: "No signals" message |

---

*End of inventory. Captured via WebFetch + direct API inspection on 2026-05-05. Chrome extension unavailable during this session — all data sourced from WebFetch HTML rendering + direct API calls. React SPA tab content confirmed by API response shapes matching dashboard sections.*
