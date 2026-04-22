# Terminal HTML Backend Parity Plan

## Purpose

Define how every meaningful interaction in `/Users/ej/Downloads/cogochi_terminal_interactive.html`
maps to a real backend-backed capability in the current product architecture.

This document is the contract-level design target for finishing the interactive prototype port
without reintroducing frontend-only fake behavior.

## Design Rules

1. `engine/` remains the only decision authority for scoring, pattern state, scan output, and verdict math.
2. `app/` may orchestrate market providers, persistence, auth, rate limiting, and UX-safe action workflows.
3. Every visible action in `/terminal` must end in one of four states:
   - reads a real backend route
   - writes to a real backend route
   - opens an existing real workflow
   - is explicitly removed as non-product behavior
4. Silent frontend-only modal state is not acceptable for market, alert, scan, or action semantics.
5. If a widget needs derived values, the route contract must declare the source fields and fallback rules.

## Ownership Model

### Engine-owned

- deep analysis
- score / probability
- pattern state
- scanner output generation
- challenge creation and evaluation
- deterministic comparison scoring where consensus matters

### App-domain

- saved watches / pins / UI state
- alert rule CRUD and user subscriptions
- export job creation and delivery
- command routing for `/terminal`
- market context aggregation from external providers
- compare session lifecycle and persistence

### Worker-control

- scheduled scans
- export generation
- notification fan-out
- long-running refresh or recompute jobs

## Feature Matrix

| Prototype area | Current state | Target backend design |
|---|---|---|
| Regime badge | mock modal text | `GET /api/market/regime` returning current regime, inputs, confidence, updated timestamp |
| BTC dominance badge | mock modal text | `GET /api/market/macro-overview` returning `btcDominance`, `dominanceChange24h`, key thresholds, next macro items |
| Scan summary badge | mock counts | `GET /api/terminal/scan/status` returning last run, universe size, counts by preset, freshness |
| Alerts toggle/list | partial, read-only alert feed exists | `GET /api/cogochi/alerts`, plus `GET /api/terminal/alerts/preferences` and `PATCH /api/terminal/alerts/preferences` |
| Settings modal | frontend-only | `GET/PATCH /api/preferences/terminal` for persisted runtime mode, default timeframe, auto-scan cadence, audio, density |
| Symbol/timeframe picker | real data refresh | keep current behavior; formalize context route contract around selected pair/timeframe |
| Query chips / quick queries | mostly prompt-driven | `GET /api/terminal/query-presets` and `POST /api/terminal/query-runs` for deterministic preset counts and results |
| Left watchlist | market-only | `GET/PUT /api/terminal/watchlist` with persisted user watch symbols and server-enriched preview metrics |
| Anomalies list | not yet a dedicated route | `GET /api/terminal/anomalies` backed by scanner + market anomaly detectors |
| Macro next section | mock | `GET /api/market/macro-calendar` returning scheduled events, severity, countdown, related assets |
| Left alerts section | real feed exists | keep `GET /api/cogochi/alerts`; add normalized terminal adapter fields and alert detail route |
| Hero card verdict | real | keep `GET /api/cogochi/analyze`; treat as canonical verdict payload |
| Chart candles / volume | real | keep `GET /api/market/ohlcv` and `/api/chart/klines` |
| Indicator toggles | local-only rendering toggle | keep local toggle state, but indicator values must come from chart/analyze contracts |
| Metric tiles | real-ish, adapter-derived | formalize `GET /api/terminal/metrics?pair=&timeframe=` as a summary route over analyze/snapshot/derivatives |
| Order book depth strip | derived, no dedicated route | add `GET /api/market/depth-ladder?pair=&timeframe=` for explicit ladder buckets and spread stats |
| Liquidation cluster strip | derived, no dedicated route | add `GET /api/market/liquidation-clusters?pair=&timeframe=` for priced cluster bands and intensity |
| Source pills | partial | add `sources[]` contract section on analyze/metrics/news responses with `name`, `timestamp`, `kind`, `detailUrl?` |
| Mini compare cards | mostly local composition | `POST /api/terminal/compare` becomes canonical compare execution route for 2-5 symbols |
| More matches link | mock | `GET /api/terminal/opportunities?query=&timeframe=&cursor=` |
| Right Summary tab | real | keep current analyze/news-backed panel contract |
| Right Entry tab | derived from analyze | add explicit `entryPlan` object into analyze envelope to remove UI guesswork |
| Right Risk tab | derived from analyze | add explicit `riskPlan` object into analyze envelope or `GET /api/terminal/risk-plan` |
| Right Flow tab | real but split across routes | add `GET /api/terminal/flow-panel` composing flow, events, large trades, CVD/OI/funding rows |
| Right News tab | real | keep `GET /api/market/news`; add symbol/timeframe relevance scoring |
| Pin actions | currently local | `GET/PUT /api/terminal/pins` for saved symbols, analyses, and compare sets |
| Compare action | currently prompt-driven | wire UI to `POST /api/terminal/compare` directly, with SSE only for commentary follow-up |
| Chart action | currently prompt-driven | no new backend route required; open chart-focused view from existing market bundle |
| Alert+ action | currently prompt-driven | `POST /api/terminal/alerts` and `GET/DELETE /api/terminal/alerts/:id` |
| Execute Entry | prototype-only, non-goal | remove as trading action; replace with `Create Plan` or `Save Setup` backed by challenge/create |
| Save Challenge | real | keep `POST /api/engine/challenge/create` through `SaveSetupModal` |
| Bottom event tape | real composition | keep composition but formalize `GET /api/terminal/tape` adapter route if multiple clients need same ordering |
| Bottom Scan / Board / Alerts / Risk / Export buttons | prompt-driven | move to first-class app-domain endpoints with optional SSE commentary on top |
| Command input / AI | real SSE | keep `POST /api/cogochi/terminal/message` as conversational path |

## Required New Contracts

### 1. Terminal Status

- Route: `GET /api/terminal/status`
- Ownership: app-domain
- Returns:
  - selected market regime summary
  - last scan metadata
  - macro headline metrics
  - system health badges for `/terminal`

### 2. Query Presets

- Route: `GET /api/terminal/query-presets?timeframe=<tf>`
- Ownership: app-domain
- Returns:
  - preset id
  - label
  - count
  - tone
  - sample symbols
  - freshness

Counts must come from scanner/anomaly outputs, not hardcoded chips.

### 3. Anomalies

- Route: `GET /api/terminal/anomalies?timeframe=<tf>&limit=<n>`
- Ownership: app-domain orchestrating engine + market providers
- Returns:
  - symbol
  - anomaly type
  - severity
  - summary
  - supporting metrics
  - related action

### 4. Macro Calendar

- Route: `GET /api/market/macro-calendar`
- Ownership: app-domain
- Returns:
  - event title
  - scheduled time
  - countdown seconds
  - impact
  - affected assets
  - narrative summary

### 5. Depth Ladder

- Route: `GET /api/market/depth-ladder?pair=<pair>&timeframe=<tf>`
- Ownership: app-domain
- Returns:
  - bid buckets
  - ask buckets
  - spread bps
  - imbalance ratio
  - timestamp

This removes the current undocumented derivation of display bars from generic derivatives payloads.

### 6. Liquidation Clusters

- Route: `GET /api/market/liquidation-clusters?pair=<pair>&timeframe=<tf>`
- Ownership: app-domain
- Returns:
  - price bands
  - side
  - relative intensity
  - nearest long cluster
  - nearest short cluster
  - range bounds

### 7. Alert Rules

- Routes:
  - `GET /api/terminal/alerts`
  - `POST /api/terminal/alerts`
  - `DELETE /api/terminal/alerts/:id`
- Ownership: app-domain
- Stores user-facing alert rules and links them to scan/anomaly source semantics.

### 8. Export Jobs

- Routes:
  - `POST /api/terminal/exports`
  - `GET /api/terminal/exports/:id`
- Ownership: app-domain + worker-control
- Export generation must be asynchronous.

### 9. Watchlist and Pins

- Routes:
  - `GET/PUT /api/terminal/watchlist`
  - `GET/PUT /api/terminal/pins`
- Ownership: app-domain
- Persists watch rows, pinned analyses, and compare sets per user.

### 10. Compare Execution

- Route: `POST /api/terminal/compare`
- Ownership: app-domain
- Current route exists, but the UI should call it directly for deterministic compare mode.
- SSE commentary remains optional and secondary.

## Analyze Envelope Extensions

The existing `GET /api/cogochi/analyze` route should remain canonical for decision payloads,
but it should grow explicit sections so the UI stops inferring product semantics from raw fields.

Add these fields:

- `entryPlan`
  - `entry`
  - `stop`
  - `targets[]`
  - `riskReward`
  - `validUntil`
- `riskPlan`
  - `bias`
  - `avoid`
  - `riskTrigger`
  - `invalidation`
  - `crowding`
- `flowSummary`
  - `cvd`
  - `oi`
  - `funding`
  - `takerBuyRatio`
- `sources[]`
  - `id`
  - `name`
  - `kind`
  - `timestamp`
  - `detail`

## Action Semantics

### Keep

- `Save Challenge`
- `Compare`
- `Alert+`
- `Scan`
- `Board`
- `Risk`
- `Export`

### Rename

- `Execute Entry` -> `Create Plan`

Reason:
the product does not execute trades from `/terminal`, and the current work item forbids fake execution.

### Remove

- frontend-only mock confirmations that imply persistence or execution without a route write

## Delivery Phases

### Phase 1: Contract closure

- add missing docs for new routes
- define terminal-specific response schemas in `app/src/lib/contracts`
- update route ownership comments

### Phase 2: Read-path parity

- implement status, query presets, anomalies, macro calendar, depth ladder, liquidation clusters
- migrate current UI adapters away from mock modal content

### Phase 3: Write-path parity

- implement alert CRUD, watchlist/pins persistence, export jobs
- wire buttons to direct routes instead of only prompt text

### Phase 4: SSE specialization

- keep `/api/cogochi/terminal/message` for commentary, explanation, and tool-assisted follow-up
- do not use SSE as the primary transport for deterministic product actions that deserve stable contracts

## Acceptance Criteria

- every user-visible control in the prototype either hits a real route or is intentionally removed
- no market badge or quick-action count is hardcoded in `/terminal`
- compare, alert, export, watchlist, and pin interactions persist through app-domain routes
- depth and liquidation visuals use explicit route contracts instead of undocumented UI derivations
- `/api/cogochi/terminal/message` remains conversational, not the only backend path for all terminal behavior
