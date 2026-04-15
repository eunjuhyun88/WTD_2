# Terminal Backend Mapping

## Purpose

Canonical map of `/terminal` UI blocks to active backend routes and fields.
Use this when wiring new UI or debugging data regressions.

## Active Routes Used By `/terminal`

- `GET /api/cogochi/analyze?symbol=<symbol>&tf=<tf>`
- `GET /api/market/ohlcv?symbol=<symbol>&interval=<interval>&limit=<n>`
- `GET /api/market/oi?symbol=<symbol>&period=<period>&limit=<n>`
- `GET /api/market/funding?symbol=<symbol>&limit=<n>`
- `GET /api/market/flow?pair=<pair>&timeframe=<tf>`
- `GET /api/market/trending`
- `GET /api/market/news`
- `GET /api/cogochi/alerts?limit=<n>`
- `GET /api/market/snapshot?pair=<pair>&timeframe=<tf>&persist=0`
- `GET /api/market/derivatives/<pair>?timeframe=<tf>`
- `GET /api/market/events?pair=<pair>&timeframe=<tf>`
- `POST /api/cogochi/terminal/message` (SSE stream)

## UI Block -> Backend Field Map

- `Main chart (candles/line)`:
  - source: `/api/market/ohlcv`, `/api/chart/klines`
  - fields: `bars[*].t/o/h/l/c/v`, `klines[*].open/high/low/close/volume`

- `Volume / RSI / OI panes`:
  - source: `/api/chart/klines`, `/api/market/oi`
  - fields: `indicators.rsi14`, `oi bars`

- `Hero decision strip (Verdict/Action/Invalidation/Confidence)`:
  - source: `/api/cogochi/analyze`
  - fields: `deep.verdict`, `deep.total_score`, `deep.atr_levels`, `ensemble.reason`

- `Right panel Summary/Entry/Risk/Flow/News`:
  - source: `/api/cogochi/analyze`, `/api/market/news`
  - adapter: `app/src/lib/terminal/panelAdapter.ts`
  - fields: `price`, `change24h`, `snapshot.*`, `deep.atr_levels`, `p_win`, `layers`

- `Order book depth + liquidation strips (chart area)`:
  - source: `/api/market/derivatives/<pair>`, `/api/market/snapshot`
  - mapped in page composition (`+page.svelte`) into `analysisData.microstructure`
  - fields: `funding`, `lsRatio`, `liqLong24h`, `liqShort24h`, derived `spreadBps`, `depth.ratio`

- `Left rail watch/momentum`:
  - source: `/api/market/trending`
  - fields: `trending`, `gainers`, `losers`, `price`, `change24h`

- `Left rail scanner alerts`:
  - source: `/api/cogochi/alerts`
  - fields: `alerts[*].symbol`, `timeframe`, `blocks_triggered`, `p_win`, `created_at`

- `Bottom dock event tape`:
  - source: composed in `+page.svelte` from:
    - `activeAsset` (analyze/market series)
    - `/api/market/flow`
    - `/api/market/events`
    - local `statusStripItems`
  - fields: `events.data.records[*].tag/text/level`

- `Pattern transition tray`:
  - source: `/api/patterns/states`
  - fields: `states[symbol][slug].phase_name/current_phase`

## Mapping Rules

- `app/` only composes and adapts payloads.
- Business logic remains in `engine/` and backend routes.
- UI fallback derivations are allowed only when route fields are absent.
- New UI widgets must declare:
  - primary route
  - fallback route
  - exact field path(s)

## Known Gaps

- No dedicated backend depth ladder endpoint yet; current depth bars are derived from derivatives context.
- No dedicated liquidation-cluster route yet; current cluster positions are derived from price + derivatives liquidation totals.
