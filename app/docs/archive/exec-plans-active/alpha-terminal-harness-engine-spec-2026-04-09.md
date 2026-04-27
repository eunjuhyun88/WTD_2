# Alpha Terminal Harness — Engine Spec

Part of the Alpha Terminal harness package:
- `alpha-terminal-harness-engine-spec-2026-04-09.md` (this file — Stage A deterministic engine contracts)
- `alpha-terminal-harness-methodology-2026-04-09.md` (overall approach + tool taxonomy)
- `alpha-terminal-harness-html-dissection-2026-04-10.md` (atom-level HTML ledger)
- `alpha-terminal-harness-boundary-2026-04-10.md` (engine vs LLM boundary rules)
- `alpha-terminal-harness-i18n-contract-2026-04-10.md` (locale axis rules)
- `alpha-terminal-harness-rationale-2026-04-10.md` (trader + engineer dual-lens rationale)

Purpose:
- Decompose the provided Alpha Terminal HTML and follow-up user requirements into a complete precision-engine contract.
- Define the full chain from raw market data to user-visible answers for click UI, natural-language queries, and multimodal requests.
- Replace browser-side heuristic authority with a server-authoritative registry model.

Related canonical docs:
- `README.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/SYSTEM_INTENT.md`
- `docs/product-specs/terminal.md`
- `docs/page-specs/terminal-page.md`

Related implementation surfaces:
- `src/lib/server/scanner.ts`
- `src/lib/engine/cogochi/layerEngine.ts`
- `src/lib/engine/cogochi/layers/l1Wyckoff.ts`
- `src/routes/api/cogochi/scan/+server.ts`
- `src/routes/api/cogochi/analyze/+server.ts`
- `src/lib/server/douni/toolExecutor.ts`
- `src/routes/terminal/+page.svelte`
- `src/routes/cogochi/scanner/+page.svelte`

## 1. Core Design Rule

The system must never answer users directly from loose UI state or browser-side ad hoc calculations.

Every answer must follow the same authority chain:

`raw data -> normalized raw fields -> feature values -> event detections -> structure/state -> verdict/execution -> UI/LLM explanation`

This chain is shared by:
- click interactions
- scanner table rendering
- deep-dive panels
- natural-language questions
- multimodal chart/image requests

## 2. Architecture Layers

| Layer | Responsibility | Output contract | Authority |
| --- | --- | --- | --- |
| Raw Data Registry | Normalize all exchange, on-chain, sentiment, FX, and local session inputs | typed raw fields with freshness metadata | server |
| Feature Registry | Compute deterministic intermediate values from raw fields | named feature values with formulas and units | server |
| Event Registry | Convert feature thresholds and sequences into interpretable market events | typed event list with direction, severity, confidence | server |
| Structure Engine | Resolve market structure and state transitions, especially Wyckoff | structural state object plus evidence chain | server |
| Verdict Engine | Generate trade bias, risk, invalidation, and execution references | verdict object and trade plan | server |
| Exposure Layer | Project the same contracts into scan rows, deep-dive panels, and LLM/tool responses | UI view models and explanation blocks | server + client projection only |

## 3. UI / Interaction Inventory Extracted From HTML

| Surface block | HTML role | Required engine backing |
| --- | --- | --- |
| Header | product identity, live mode, version | no market authority; metadata only |
| Market bar | global regime summary and scan counts | global raw fields, scan aggregation outputs |
| Controls | scan mode, watchlist, timeframe, alpha filter, start/stop | scan request contract |
| Progress bar | running step and completion state | batch scan runtime events |
| Stats bar | structural and alert counts | aggregated event/state counts |
| Filter bar | client-side result filtering | scan row facets |
| Table | ranked result list | symbol overview contract |
| Deep-dive panel | feature/event/state inspection | symbol detail contract |
| Verdict box | final interpretation and trade references | verdict/execution contract |
| Natural-language answer | explanation, comparison, drilldown | same symbol detail + verdict contract |
| Multimodal request | chart/screenshot-grounded interpretation | same contract, plus selected symbol/timeframe/focus extraction |

## 4. Raw Data Registry

### 4.1 Global / Cross-Market Raw Fields

| Raw ID | Field | Source | Scope | Cadence | Unit | Null / fallback policy | Primary consumers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raw.global.fear_greed.value` | Fear & Greed value | Alternative.me | global | 1h-4h poll | 0-100 | fallback last known, else 50 | L7, regime context, market bar |
| `raw.global.usd_krw.rate` | USD/KRW proxy via USDT/KRW | CoinGecko or exchange composite | global | 1m-5m poll | KRW per USD | fallback last known, else recent median | L8, market bar |
| `raw.global.btc_onchain.n_tx_24h` | BTC 24h tx count | blockchain.info or better provider | BTC/global | 15m-1h poll | count | if unavailable mark stale and zero-weight L6 | L6, market bar |
| `raw.global.btc_onchain.total_btc_sent_24h` | BTC moved in 24h | blockchain.info | BTC/global | 15m-1h poll | BTC | same as above | L6 |
| `raw.global.btc_onchain.avg_tx_value` | derived raw from tx count and sent volume | derived | BTC/global | same as source | BTC/tx | null if source incomplete | L6 |
| `raw.global.mempool.pending_tx` | mempool count | mempool.space | BTC/global | 1m-5m poll | count | stale-safe; do not synthesize | L6, market bar |
| `raw.global.mempool.vsize_mb` | mempool virtual size | mempool.space | BTC/global | 1m-5m poll | MB | null-safe | L6, market bar |
| `raw.global.mempool.fastest_fee` | recommended fast fee | mempool.space | BTC/global | 1m-5m poll | sat/vB | stale-safe | L6, market bar |
| `raw.global.mempool.halfhour_fee` | recommended half-hour fee | mempool.space | BTC/global | 1m-5m poll | sat/vB | stale-safe | L6 |
| `raw.global.mempool.hour_fee` | recommended hour fee | mempool.space | BTC/global | 1m-5m poll | sat/vB | stale-safe | L6 |
| `raw.global.exchange.upbit_price_map` | KRW spot prices by symbol | Upbit | cross-symbol | 5s-30s poll | KRW | fallback last good snapshot | L8 |
| `raw.global.exchange.upbit_volume_map` | 24h KRW turnover by symbol | Upbit | cross-symbol | 5s-30s poll | KRW | fallback last good snapshot | sector/context |
| `raw.global.exchange.bithumb_price_map` | KRW spot prices by symbol | Bithumb | cross-symbol | 5s-30s poll | KRW | fallback last good snapshot | L8 |
| `raw.global.sector.map` | symbol -> sector taxonomy | internal registry | cross-symbol | deploy-time + admin updates | enum | default `OTHER` | L12 |
| `raw.global.sector.override` | manual sector corrections | internal admin | cross-symbol | on edit | enum | optional | L12 |

### 4.2 Scan Universe Raw Fields

| Raw ID | Field | Source | Scope | Cadence | Unit | Null / fallback policy | Primary consumers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raw.scan.ticker_24h.symbol` | futures symbol | Binance futures 24h ticker | symbol | per scan or stream | string | required | scanner |
| `raw.scan.ticker_24h.quote_volume` | 24h quote volume | Binance futures 24h ticker | symbol | per scan or stream | quote currency | required | group 1 |
| `raw.scan.ticker_24h.price_change_pct` | 24h price change % | Binance futures 24h ticker | symbol | per scan or stream | % | required | group 2 |
| `raw.scan.ticker_24h.high_price` | 24h high | Binance futures 24h ticker | symbol | per scan or stream | price | required | group 3 |
| `raw.scan.ticker_24h.low_price` | 24h low | Binance futures 24h ticker | symbol | per scan or stream | price | required | group 3 |
| `raw.scan.ticker_24h.last_price` | last traded price | Binance futures 24h ticker | symbol | per scan or stream | price | required | group 3, table |
| `raw.scan.universe.is_usdt` | USDT perpetual filter | internal normalization | symbol | per scan | boolean | required | scanner |

### 4.3 Symbol OHLCV Raw Fields

| Raw ID | Field | Source | Scope | Cadence | Unit | Null / fallback policy | Primary consumers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raw.symbol.klines.1m` | 1m OHLCV series | Binance futures klines | symbol | poll or websocket | series | optional but preferred for radar/live watch | radar, micro-squeeze |
| `raw.symbol.klines.5m` | 5m OHLCV series | Binance futures klines | symbol | per analysis | series | required for L3/L11/L18 and short structure confirmation | L3, L11, L18, precision Wyckoff confirmation |
| `raw.symbol.klines.15m` | 15m OHLCV series | Binance futures klines | symbol | per analysis | series | optional display timeframe | user-selected chart context |
| `raw.symbol.klines.1h` | 1h OHLCV series | Binance futures klines | symbol | per analysis | series | required for MTF | L10, regime |
| `raw.symbol.klines.4h` | 4h OHLCV series | Binance futures klines | symbol | per analysis | series | current main scan base | L1 primary in current HTML |
| `raw.symbol.klines.1d` | 1d OHLCV series | Binance futures klines | symbol | per analysis | series | required for exact 7d/30d breakout truth | L13, higher timeframe structure |

### 4.4 Symbol Derivatives / Liquidity Raw Fields

| Raw ID | Field | Source | Scope | Cadence | Unit | Null / fallback policy | Primary consumers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raw.symbol.mark_price` | mark price | Binance premiumIndex | symbol | 1s-15s poll/stream | price | required | execution, L2, L5, L8 |
| `raw.symbol.funding_rate` | current funding rate | Binance premiumIndex | symbol | 1m-8h | % | required | L2, alerts |
| `raw.symbol.oi_hist.5m` | 5m open interest history | Binance openInterestHist | symbol | per analysis | series | required for L19 | L19 |
| `raw.symbol.oi_hist.1h` | 1h open interest history | Binance openInterestHist | symbol | per analysis | series | required for slower crowding confirmation | L2, hybrid OI |
| `raw.symbol.oi_hist.display_tf` | display timeframe OI history | Binance openInterestHist | symbol | per analysis | series | optional, never authoritative alone | user-view helpers |
| `raw.symbol.long_short.global` | account long/short ratio series | Binance globalLongShortAccountRatio | symbol | per analysis | series | required for L2 | L2 |
| `raw.symbol.taker_buy_sell_ratio` | taker buy/sell series | Binance takerlongshortRatio | symbol | per analysis | series | required for L2 and order-flow checks | L2 |
| `raw.symbol.depth.l2_20` | top 20 bids/asks | Binance depth | symbol | 1s-5s poll or stream | ladder | required | L4 |
| `raw.symbol.force_orders.1h` | recent forced orders | Binance forceOrders | symbol | per analysis or stream | event list | required | L9 |
| `raw.symbol.agg_trades.live` | live trades / aggTrades | Binance websocket | symbol | realtime | trade stream | required for whale tick, rolling radar, precise CVD | live watch |
| `raw.symbol.book_ticker.live` | best bid/ask | Binance websocket | symbol | realtime | quote stream | optional but preferred | live watch |
| `raw.symbol.depth.live` | live order book delta | Binance websocket | symbol | realtime | delta stream | optional but preferred | live watch, imbalance persistence |

### 4.5 Session / User-Controlled Raw Fields

| Raw ID | Field | Source | Scope | Cadence | Unit | Null / fallback policy | Primary consumers |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `raw.session.scan_mode` | `topn` or `custom` | UI request | session | on change | enum | required | scanner |
| `raw.session.top_n` | top N count | UI request | session | on change | integer | default 50 | scanner |
| `raw.session.custom_symbols` | custom watchlist | UI request / local persistence | session | on change | symbol list | dedupe and validate | scanner |
| `raw.session.display_timeframe` | active chart timeframe | UI request | session | on change | enum | default 4h | chart and some user-relative overlays |
| `raw.session.min_alpha` | alpha filter | UI request | session | on change | score | default 25 | filter bar |
| `raw.session.active_filter` | result facet filter | UI request | session | on change | enum | default `ALL` | filter bar |
| `raw.session.selected_symbol` | current drilldown symbol | UI request | session | on click | symbol | optional | deep dive |
| `raw.session.intent_focus` | natural-language focus such as `wyckoff`, `cvd`, `risk` | LLM/tool router | turn | per request | enum/list | optional | explanation |

## 5. Feature Registry

### 5.1 Scan Universe Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.scan.rank_quote_volume_24h` | `quote_volume` | sort descending by 24h quote volume | exact percentile rank across eligible futures universe | rank / percentile |
| `feat.scan.rank_abs_price_change_24h` | `price_change_pct` | sort by absolute 24h move | exact percentile rank, side-aware and abs-aware both stored | rank / percentile |
| `feat.scan.near_24h_high_pct` | `last_price`, `high_price` | user request says `24H high 90%+` | `last_price / high_price * 100` with threshold banding | % |
| `feat.scan.near_24h_low_pct` | `last_price`, `low_price` | not in original HTML | add symmetric downside band for breakdown mode | % |
| `feat.scan.universe_group_flags` | ranks and high proximity | not explicit in HTML | store boolean membership for group1/group2/group3 | bitset/list |
| `feat.scan.universe_priority_score` | group flags + ranks | implicit only | deterministic pre-score for scan scheduling and progressive rendering | score |

### 5.2 Global Context Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.global.fear_greed_bucket` | `fear_greed.value` | fixed threshold buckets | same buckets, plus z-score against trailing history if available | enum |
| `feat.global.usd_krw_bucket` | `usd_krw.rate` | display only | contextual only; do not score directly | enum |
| `feat.global.btc_network_activity_bucket` | `n_tx_24h` | fixed tx thresholds | percentile or fixed threshold by rolling 90d distribution | enum |
| `feat.global.btc_avg_tx_value_bucket` | `avg_tx_value` | fixed thresholds for whale movement | percentile or absolute threshold depending provider stability | enum |
| `feat.global.mempool_congestion_bucket` | `pending_tx`, `vsize_mb` | fixed threshold buckets | combine tx count and vsize; mark conflicting states | enum |
| `feat.global.fee_pressure_bucket` | `fastest_fee` | fixed thresholds | derive low/normal/high/surge using rolling percentiles | enum |

### 5.3 Price / Structure Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.struct.prev_trend_pct` | `klines[trend window]` | compare start/end median or close over trend slice | keep baseline but also store linear regression slope and log-return slope | % plus slopes |
| `feat.struct.range_high` | `range slice highs` | max high | same | price |
| `feat.struct.range_low` | `range slice lows` | min low | same | price |
| `feat.struct.range_width_abs` | `range_high`, `range_low` | implicit | exact absolute width | price |
| `feat.struct.range_width_pct` | `range_high`, `range_low` | width / low | same | % |
| `feat.struct.close_position_in_range_pct` | `close`, `range_high`, `range_low` | HTML `pip` | same | % |
| `feat.struct.climax_volume_ratio` | `volume slice` | first 5 range candles vs average | precision engine should search for candidate SC/BC bars, not just first 5 bars | ratio |
| `feat.struct.secondary_test_count` | range candles | simple count near range boundary | count only event-qualified STs after SC/BC/AR candidate ordering | count |
| `feat.struct.secondary_test_low_volume_count` | range candles, avg volume | ST with low volume | same but event-qualified | count |
| `feat.struct.spring_penetration_pct` | lows, range_low, closes | simple penetration and recovery thresholds | store both penetration depth and recovery strength | % |
| `feat.struct.utad_penetration_pct` | highs, range_high, closes | simple penetration and recovery thresholds | same | % |
| `feat.struct.sos_break_strength` | last bars close/volume | boolean breakout with volume | breakout magnitude * volume ratio * close location | score |
| `feat.struct.sow_break_strength` | last bars close/volume | boolean breakdown with volume | same | score |
| `feat.struct.volume_contraction_ratio` | early vs late range volume | second half lower than first half | exact ratio, plus rolling percentile | ratio |
| `feat.struct.cause_width` | range high-low | used for C&E target | same | price |
| `feat.struct.ce_target_bull` | range, direction | `rangeHigh + width` | keep baseline and optionally support cause multipliers later | price |
| `feat.struct.ce_target_bear` | range, direction | `rangeLow - width` | same | price |
| `feat.struct.phase_confidence` | structural feature bundle | not explicit | confidence score for structure engine, not a user-facing alpha score | 0-1 |

### 5.4 Flow / Positioning Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.flow.funding_rate_pct` | `funding_rate` | direct thresholds | same plus rolling percentile by symbol | % |
| `feat.flow.funding_extreme_flag` | funding | `abs(fr) > 0.07%` | same but store positive/negative direction separately | boolean + side |
| `feat.flow.oi_change_pct_5m_1h` | `oi_hist.5m` | user requested 12x5m for 1h | exact `(last-first)/first*100` over 12 bars | % |
| `feat.flow.oi_change_pct_1h_6h` | `oi_hist.1h` | user requested 6x1h | exact `(last-first)/first*100` over 6 bars | % |
| `feat.flow.oi_acceleration` | short and slow OI change | not in original HTML | first derivative and slope delta of OI change | score |
| `feat.flow.long_short_ratio_last` | global LS ratio | last sample | same | ratio |
| `feat.flow.long_short_ratio_regime` | LS ratio series | thresholds only | same plus persistence count | enum |
| `feat.flow.taker_ratio_mean` | taker B/S series | average across sampled bars | same | ratio |
| `feat.flow.taker_ratio_slope` | taker B/S series | sparkline only | explicit momentum of taker pressure | ratio delta |
| `feat.flow.real_liq_long_usd_1h` | force orders | sum SELL side | same | USD |
| `feat.flow.real_liq_short_usd_1h` | force orders | sum BUY side | same | USD |
| `feat.flow.real_liq_total_usd_1h` | force orders | long + short | same | USD |
| `feat.flow.real_liq_net_usd_1h` | force orders | short - long | same | USD |
| `feat.flow.bid_ask_notional_ratio` | depth ladder | sum bid notional / ask notional | same, optionally weighted by distance to mid | ratio |
| `feat.flow.bid_wall_near_mid` | depth ladder | not explicit | largest bid within x bp of mid | notional |
| `feat.flow.ask_wall_near_mid` | depth ladder | not explicit | largest ask within x bp of mid | notional |

### 5.5 CVD / Tape / Radar Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.cvd.bar_delta_series` | candles with taker buy volume or trade tape | `buyVol*2-totalVol` or proxy | prefer true taker buy volume on 5m; fallback to trade reconstruction; final fallback to candle proxy | series |
| `feat.cvd.cumulative_delta_20` | delta series | cumulative last 20 bars | same | number |
| `feat.cvd.trend` | cumulative delta | start/end delta | same | number |
| `feat.cvd.absorption_flag` | price change, cvd trend | low price move + strong one-sided CVD | same with tunable thresholds by volatility regime | boolean |
| `feat.cvd.divergence_state` | price change + cvd trend | manual if/else | standardized enum | enum |
| `feat.radar.rolling_60s_notional` | agg trades | user requested 1m rolling radar | rolling sum over last 60s | USD |
| `feat.radar.rolling_60s_vs_1h_mean` | rolling 60s + trailing 1h windows | user requested 2.5x explosion | ratio against 60s baseline distribution over past 1h | ratio |
| `feat.tape.whale_block_trade_max` | agg trades | user requested whale tick >= $50k | maximum single aggressor trade over recent window | USD |
| `feat.tape.whale_block_trade_count` | agg trades | implicit | count of block trades above configured threshold | count |

### 5.6 Momentum / Volatility / Breakout Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.momo.return_30m_pct` | `klines.5m` last 6 closes | user requested 30m return | exact percentage return | % |
| `feat.momo.vol_accel_30m` | `klines.5m` volumes | compare recent volume to baseline | ratio of recent 30m notional or volume to trailing baseline | ratio |
| `feat.vsurge.factor_5m` | `klines.5m` volumes | recent 5 bars vs prior 25 bars | same | ratio |
| `feat.vsurge.direction` | recent price direction | close vs open | same | signed |
| `feat.breakout.pos_7d_pct` | `klines.1d` | current position in 7d range | exact position with 1d bars, never display timeframe approximation | % |
| `feat.breakout.pos_30d_pct` | `klines.1d` | current position in 30d range | same | % |
| `feat.breakout.distance_to_7d_high_pct` | close and 7d high | implicit in near high checks | exact distance | % |
| `feat.breakout.distance_to_30d_high_pct` | close and 30d high | implicit | exact distance | % |
| `feat.breakout.distance_to_7d_low_pct` | close and 7d low | implicit | exact distance | % |
| `feat.breakout.distance_to_30d_low_pct` | close and 30d low | implicit | exact distance | % |
| `feat.bb.width_pct` | closes | BB bandwidth | same | % |
| `feat.bb.width_percentile` | bandwidth history | not in HTML | percentile over trailing history | percentile |
| `feat.bb.position_pct` | close, upper, lower | current location in BB range | same | % |
| `feat.bb.expansion_ratio` | current vs prior BB width | width now vs past | same | ratio |
| `feat.atr.value` | OHLCV | ATR | same | price |
| `feat.atr.pct` | ATR / close | same | same | % |
| `feat.atr.stop_long` | close, ATR | close - 1.5*ATR | same | price |
| `feat.atr.stop_short` | close, ATR | close + 1.5*ATR | same | price |
| `feat.atr.tp1_long` | close, ATR | close + 2*ATR | same | price |
| `feat.atr.tp2_long` | close, ATR | close + 3*ATR | same | price |
| `feat.atr.vol_state` | atr recent vs older | bucket by ratio | same plus percentile overlay | enum |
| `feat.micro_squeeze.range_3m_pct` | 1m or trade tape | user requested micro-squeeze <= 0.8% | exact 3m high-low compression | % |

### 5.7 Sector / Context Features

| Feature ID | Inputs | Baseline HTML logic | Precision engine rule | Output |
| --- | --- | --- | --- | --- |
| `feat.sector.name` | sector map | hardcoded map | registry-backed sector name | enum |
| `feat.sector.alpha_mean` | all scanned symbols by sector | average alpha by sector | same, but use structure-aware sector summary later | score |
| `feat.sector.flow_state` | sector alpha mean | positive / negative bucket | same | enum |
| `feat.kimchi.upbit_pct` | upbit price, binance KRW price | direct | same | % |
| `feat.kimchi.bithumb_pct` | bithumb price, binance KRW price | direct | same | % |
| `feat.kimchi.avg_pct` | upbit and bithumb premium | mean of available values | same | % |

## 6. Event Registry

### 6.1 Structural / Wyckoff Events

| Event ID | Trigger inputs | Baseline HTML status | Precision engine rule | Direction | Severity |
| --- | --- | --- | --- | --- | --- |
| `event.wyckoff.ps` | trend, boundary test, volume expansion | not explicitly modeled | detect preliminary support after markdown with expanded spread/volume near lower range | bull | medium |
| `event.wyckoff.sc` | sell climax candidate | implicit via climax volume | explicit SC event with widest spread, extreme volume, downside exhaustion | bull | high |
| `event.wyckoff.ar` | automatic rally | not explicit | detect reaction after SC with impulsive bounce and reduced downside continuation | bull | medium |
| `event.wyckoff.st` | retest near SC/BC area | simple count | event-qualified retest after SC/AR or BC/AR ordering | context | medium |
| `event.wyckoff.spring` | lower-bound penetration and recovery | explicit | require penetration depth, close recovery, and contextual placement after prior tests | bull | high |
| `event.wyckoff.sos` | breakout above range with effort | explicit | require close beyond resistance, spread expansion, and volume confirmation | bull | high |
| `event.wyckoff.lps` | last point of support | not explicit | detect pullback hold after SOS | bull | medium |
| `event.wyckoff.bc` | buying climax | implicit via climax volume | explicit BC event for distribution | bear | high |
| `event.wyckoff.ut` | upthrust | not explicit | resistance probe failure before UTAD | bear | medium |
| `event.wyckoff.utad` | upper-bound penetration and rejection | explicit | require placement after BC/AR/ST structure | bear | high |
| `event.wyckoff.sow` | breakdown below range with effort | explicit | require close below support plus effort | bear | high |
| `event.wyckoff.lpsy` | last point supply | not explicit | detect failed retest after SOW | bear | medium |

### 6.2 Flow / Positioning Events

| Event ID | Trigger inputs | Baseline HTML status | Precision engine rule | Direction | Severity |
| --- | --- | --- | --- | --- | --- |
| `event.flow.fr_extreme_negative` | funding rate | explicit | negative funding beyond configured percentile or absolute threshold | bull squeeze setup | high |
| `event.flow.fr_extreme_positive` | funding rate | explicit | positive funding beyond configured percentile or absolute threshold | bear liquidation setup | high |
| `event.flow.long_entry_build` | OI up + price up | explicit | require positive OI slope and positive price move over matching horizon | bull | medium |
| `event.flow.short_entry_build` | OI up + price down | explicit | same for short build | bear | medium |
| `event.flow.short_squeeze_active` | short liq dominance, price rise, negative FR | partial | require multi-signal alignment, not one metric alone | bull | high |
| `event.flow.long_cascade_active` | long liq dominance, price drop, positive FR | partial | same | bear | high |
| `event.flow.taker_buy_aggression` | taker ratio | explicit | same plus persistence threshold | bull | medium |
| `event.flow.taker_sell_aggression` | taker ratio | explicit | same | bear | medium |
| `event.flow.ob_support_imbalance` | depth ratio and wall position | explicit only as ratio | require near-mid bid wall support, not just total ratio | bull | medium |
| `event.flow.ob_resistance_imbalance` | depth ratio and wall position | explicit only as ratio | require near-mid ask wall resistance | bear | medium |

### 6.3 Tape / CVD / Radar Events

| Event ID | Trigger inputs | Baseline HTML status | Precision engine rule | Direction | Severity |
| --- | --- | --- | --- | --- | --- |
| `event.cvd.bullish_divergence` | price down, CVD up | explicit | same | bull | medium |
| `event.cvd.bearish_divergence` | price up, CVD down | explicit | same | bear | medium |
| `event.cvd.absorption_buy` | price flat/down, CVD strongly up | explicit | same | bull | medium |
| `event.cvd.absorption_sell` | price flat/up, CVD strongly down | explicit | same | bear | medium |
| `event.radar.rolling_volume_explosion` | rolling 60s notional vs 1h mean | user requested | trigger when ratio crosses configured threshold such as 2.5x | direction from trade imbalance | high |
| `event.tape.whale_block_trade` | single trade >= threshold | user requested | detect by aggressor side and threshold in USD | side-aware | medium |
| `event.micro_squeeze.compression` | 3m range <= threshold and falling vol | user requested | compression regime before breakout | neutral setup | medium |
| `event.micro_squeeze.release` | compression + volume explosion + directional break | user requested | exact release event | side-aware | high |

### 6.4 Breakout / Volatility / Context Events

| Event ID | Trigger inputs | Baseline HTML status | Precision engine rule | Direction | Severity |
| --- | --- | --- | --- | --- | --- |
| `event.breakout.near_7d_high` | position in range | explicit | same | bull setup | low |
| `event.breakout.near_30d_high` | position in range | explicit | same | bull setup | medium |
| `event.breakout.confirm_7d_high` | close > 7d high | explicit | same | bull | medium |
| `event.breakout.confirm_30d_high` | close > 30d high | explicit | same | bull | high |
| `event.breakdown.near_7d_low` | position in range | explicit | same | bear setup | low |
| `event.breakdown.near_30d_low` | position in range | explicit | same | bear setup | medium |
| `event.bb.squeeze` | BB width contraction | explicit | same | neutral setup | medium |
| `event.bb.big_squeeze` | major percentile contraction | explicit | same | neutral setup | high |
| `event.bb.expansion_up` | expansion with upper break | explicit | same | bull | medium |
| `event.bb.expansion_down` | expansion with lower break | explicit | same | bear | medium |
| `event.atr.ultra_low_vol` | low ATR regime | explicit | same | setup | low |
| `event.atr.extreme_vol` | high ATR regime | explicit | same | risk warning | medium |
| `event.context.fear_extreme` | fear & greed | explicit | same | bull contrarian | medium |
| `event.context.greed_extreme` | fear & greed | explicit | same | bear contrarian | medium |
| `event.context.kimchi_overheat` | kimchi avg pct | explicit | same | bear | medium |
| `event.context.kimchi_discount` | kimchi avg pct | explicit | same | bull | medium |
| `event.context.onchain_demand_surge` | mempool and tx activity | explicit but coarse | require aligned network and fee pressure | bull | medium |
| `event.context.onchain_whale_transfer_risk` | avg tx value | explicit but coarse | keep as contextual warning, never sole verdict driver | bear risk | low |

## 7. Structure / State Engine

The structure engine must be primary for directional interpretation. It must not be replaced by a flat weighted sum.

### 7.1 Structural State Catalog

| State ID | Entry requirements | Typical confirming events | Typical invalidation |
| --- | --- | --- | --- |
| `state.none` | insufficient or incoherent structure evidence | none | n/a |
| `state.range_unresolved` | bounded range without clean accumulation/distribution sequence | low-confidence STs, mixed flow | break in either direction with effort |
| `state.acc_phase_a` | markdown ended, PS/SC/AR sequence emerging | `ps`, `sc`, `ar` | immediate continuation markdown without reaction |
| `state.acc_phase_b` | range building with multiple tests | `st`, lower volume retests | decisive breakdown without recovery |
| `state.acc_phase_c` | shakeout or spring candidate | `spring` | failure to reclaim range, renewed heavy supply |
| `state.acc_phase_d` | demand proving itself | `sos`, `lps`, positive flow confirmation | failed breakout, heavy distribution signs |
| `state.acc_phase_e` | markup leaving accumulation | `sos` persistence, higher highs and LPS holds | re-entry into range |
| `state.reaccumulation` | trend pause inside broader uptrend | accumulation-like events in established uptrend | loss of trend structure |
| `state.dist_phase_a` | markup ended, BC/AR sequence emerging | `bc`, `ar` | immediate continuation markup |
| `state.dist_phase_b` | distributional range building | `ut`, repeated upper tests | decisive breakout with confirmed demand |
| `state.dist_phase_c` | terminal upthrust / UTAD | `utad` | reclaim and hold above failed level |
| `state.dist_phase_d` | supply proving itself | `sow`, `lpsy`, bearish flow | failed breakdown, strong squeeze reclaim |
| `state.dist_phase_e` | markdown leaving distribution | lower lows and failed rallies | re-entry into range |
| `state.redistribution` | downtrend pause inside broader downtrend | distribution-like events in established downtrend | loss of trend structure |
| `state.markup_continuation` | trend-following state without fresh range base | L18 momentum, breakout, strong taker buying | exhaustion, bearish divergence |
| `state.markdown_continuation` | trend-following downside state | negative flow, bearish divergence, breakdown follow-through | squeeze reclaim |
| `state.failed_bull_breakout` | breakout rejected back into range | failed `sos`, bearish divergence, ask wall | renewed close above range high |
| `state.failed_bear_breakdown` | breakdown rejected back into range | failed `sow`, bullish divergence, bid wall | renewed close below range low |

### 7.2 State Transition Rules

| From | To | Required events / conditions |
| --- | --- | --- |
| `state.range_unresolved` | `state.acc_phase_a` | `ps` + `sc` + `ar` candidates with negative prior trend |
| `state.acc_phase_a` | `state.acc_phase_b` | at least one qualified `st` and stable range boundaries |
| `state.acc_phase_b` | `state.acc_phase_c` | `spring` or deep support test after prior tests |
| `state.acc_phase_c` | `state.acc_phase_d` | `sos` plus flow confirmation from L18/L19/CVD or taker pressure |
| `state.acc_phase_d` | `state.acc_phase_e` | breakout persistence and successful `lps` behavior |
| `state.range_unresolved` | `state.dist_phase_a` | `bc` + `ar` candidates with positive prior trend |
| `state.dist_phase_a` | `state.dist_phase_b` | repeated upper tests and coherent range |
| `state.dist_phase_b` | `state.dist_phase_c` | `utad` or terminal upthrust after prior upper tests |
| `state.dist_phase_c` | `state.dist_phase_d` | `sow` plus bearish flow confirmation |
| `state.dist_phase_d` | `state.dist_phase_e` | downside persistence and failed rally retests |
| any bull structure | `state.failed_bull_breakout` | range high reclaim fails and price closes back inside with weakening demand |
| any bear structure | `state.failed_bear_breakdown` | range low breakdown fails and price closes back inside with squeeze evidence |
| accumulation-like state in uptrend | `state.reaccumulation` | higher timeframe uptrend remains intact |
| distribution-like state in downtrend | `state.redistribution` | higher timeframe downtrend remains intact |

### 7.3 Structure Confidence Inputs

| Confidence component | Inputs | Rule |
| --- | --- | --- |
| sequence completeness | qualified Wyckoff events | more ordered events -> higher confidence |
| boundary integrity | stable range high/low across windows | higher stability -> higher confidence |
| volume logic | climax, contraction, breakout effort | coherent volume story -> higher confidence |
| flow confirmation | L18/L19/CVD/L2 alignment | aligned short-term flow boosts confidence |
| invalidation pressure | strong opposite-side events | high opposite pressure reduces confidence |
| timeframe agreement | 5m / 1h / 4h / 1d consistency | more alignment boosts confidence |

## 8. Verdict Engine

### 8.1 Verdict Inputs

| Input family | Role in verdict |
| --- | --- |
| Structural state | primary directional backbone |
| Flow / positioning events | confirm or contradict structural state |
| Trigger events | determine immediacy and timing |
| Volatility and risk features | define stop width, risk tier, and RR realism |
| Context events | macro/regime modifiers only, never sole direction driver |

### 8.2 Verdict Outputs

| Output ID | Meaning | Required fields |
| --- | --- | --- |
| `verdict.bias` | directional label | `STRONG_BULL`, `BULL`, `NEUTRAL`, `BEAR`, `STRONG_BEAR` |
| `verdict.structure_state` | primary state | one of the structure states above |
| `verdict.confidence` | confidence in current interpretation | 0-1 or 0-100 |
| `verdict.urgency` | how immediate the setup is | `LOW`, `MEDIUM`, `HIGH` |
| `verdict.top_reasons` | short human-readable reasons | ordered list of 3-8 reasons |
| `verdict.counter_reasons` | strongest opposing evidence | ordered list |
| `verdict.invalidation` | what breaks the thesis | price levels + event conditions |
| `verdict.entry_zone` | preferred entry or wait zone | price/range description |
| `verdict.stop` | stop or thesis-break level | price |
| `verdict.targets` | one or more targets | price list |
| `verdict.rr_reference` | rough risk-reward | ratio |
| `verdict.data_freshness` | freshness summary | timestamps + stale flags |

### 8.3 Flat Score Policy

| Policy | Rule |
| --- | --- |
| Alpha score is secondary | Keep `alphaScore` for scan ranking and backward compatibility, but never let it replace structure state. |
| Structure-first ranking | Scanner rows should surface structural state and confidence alongside alpha. |
| Context demotion | Fear & Greed, kimchi, on-chain, and sector can modulate confidence and warning badges, but cannot override a strong opposite structure by themselves. |
| Trigger promotion | L18, L19, CVD, and real liquidation can raise urgency and timing priority without rewriting higher-timeframe structure unless repeated. |

## 9. Exposure Contracts For Click, Natural Language, And Multimodal

### 9.1 API / Tool Contracts

| Contract ID | Caller | Purpose | Required response blocks |
| --- | --- | --- | --- |
| `scan.get_table` | UI click / LLM | return ranked scan rows | overview rows, aggregation counts, freshness |
| `scan.get_symbol_overview` | UI click / LLM | one-row summary for symbol | overview row + top reasons |
| `scan.get_symbol_raw` | deep-dive / LLM | inspect raw fields | normalized raw payload + freshness |
| `scan.get_symbol_features` | deep-dive / LLM | inspect intermediate values | feature map grouped by domain |
| `scan.get_symbol_events` | deep-dive / LLM | inspect active/inactive events | event list with truth values |
| `scan.get_symbol_structure` | deep-dive / LLM | inspect structure state machine result | structural state, event chain, invalidation |
| `scan.get_symbol_verdict` | UI / LLM | final decision block | verdict object |
| `scan.compare_symbols` | UI / LLM | compare candidates | normalized comparison bundle |
| `scan.start_live_watch` | UI / LLM | begin live radar/whale/CVD monitor | session id, subscriptions, initial snapshot |
| `scan.stop_live_watch` | UI / LLM | stop long-running stream | stop ack |
| `scan.get_live_snapshot` | UI / LLM | poll or replay current live watch state | rolling radar, whale ticks, micro-squeeze, book imbalance |
| `scan.explain_decision` | LLM | generate human explanation without recomputation | explanation from cached verdict + structure + feature bundle |

### 9.2 UI Exposure Views

| View ID | Intended user need | Required contracts |
| --- | --- | --- |
| `view.scan_table` | rank and filter symbols | `scan.get_table` |
| `view.market_bar` | global regime and scan counts | table aggregation + global context |
| `view.symbol_deep_dive` | inspect why a symbol scored as it did | `scan.get_symbol_raw`, `features`, `events`, `structure`, `verdict` |
| `view.verdict_box` | get actionable bias and trade references | `scan.get_symbol_verdict` |
| `view.debug_panel` | audit engine outputs | raw + feature + event truth table |
| `view.live_watch` | track rolling tape events | `scan.start_live_watch`, `scan.get_live_snapshot` |

### 9.3 Natural-Language Routing Examples

| User utterance | Required tool path | Required returned blocks |
| --- | --- | --- |
| "지금 막 튀기 직전 코인 보여줘" | `scan.get_table` with group3 emphasis | overview rows + breakout features |
| "BZ가 왜 Bull Bias야?" | `scan.get_symbol_verdict` + `scan.get_symbol_structure` | verdict, top reasons, counter reasons |
| "와이코프만 자세히" | `scan.get_symbol_structure` + filtered features/events | structural event chain |
| "CVD랑 OI가 구조를 지지해?" | `scan.get_symbol_features` + `scan.get_symbol_events` | flow features and supporting/contradicting events |
| "실제 청산이랑 호가창까지 보여줘" | `scan.get_symbol_raw` + `features` + `events` | force orders, depth, derived ratios |
| "이 차트 캡처 기준 지금 위험해?" | multimodal parser -> symbol/timeframe/focus -> `scan.get_symbol_structure` + `verdict` | structure, invalidation, urgency |

## 10. HTML DOM / Output Mapping

### 10.1 Market Bar Mapping

| HTML ID | Required contract field |
| --- | --- |
| `mb-fg` | `raw.global.fear_greed.value` + `feat.global.fear_greed_bucket` |
| `mb-kp` | `feat.kimchi.avg_pct` for BTC |
| `mb-usdkrw` | `raw.global.usd_krw.rate` |
| `mb-btctx` | `raw.global.btc_onchain.n_tx_24h` |
| `mb-mempool` | `raw.global.mempool.pending_tx` |
| `mb-fees` | `raw.global.mempool.fastest_fee` |
| `mb-sbull` | scan aggregation count `bias=STRONG_BULL` |
| `mb-bull` | scan aggregation count `bias=BULL` |
| `mb-neut` | scan aggregation count `bias=NEUTRAL` |
| `mb-bear` | scan aggregation count `bias=BEAR` |
| `mb-sbear` | scan aggregation count `bias=STRONG_BEAR` |
| `mb-xt` | scan aggregation count `event.flow.fr_extreme_*` |

### 10.2 Control / Progress / Stats Mapping

| HTML ID | Required contract field |
| --- | --- |
| `topN` | `raw.session.top_n` |
| `sym-input` | `raw.session.custom_symbols` |
| `period` | `raw.session.display_timeframe` for user-facing charts only |
| `minAlpha` | `raw.session.min_alpha` |
| `scanBtn` | scan start action |
| `stopBtn` | scan stop action |
| `pMsg` | batch runtime status label |
| `pPct` | batch runtime percentage |
| `pFill` | batch runtime percentage |
| `ss-sb` | strong bull count |
| `ss-b` | bull count |
| `ss-n` | neutral count |
| `ss-be` | bear count |
| `ss-sbe` | strong bear count |
| `ss-tot` | total scanned |
| `ss-wk` | symbols with non-`state.none` structure |
| `ss-mtf` | symbols with higher-timeframe alignment |
| `ss-sq` | symbols with squeeze event |
| `ss-liq` | symbols with real liquidation alert |
| `ss-xt` | symbols with extreme funding event |

### 10.3 Table Column Mapping

| HTML column | Required contract field |
| --- | --- |
| `Symbol` | symbol identity |
| `Alpha` | `alphaScore` plus `verdict.bias` and `verdict.confidence` |
| `Wyckoff` | `verdict.structure_state` or L1 summary |
| `MTF` | MTF alignment feature/event summary |
| `CVD` | CVD divergence/absorption event summary |
| `청산` | real liquidation event summary |
| `BB` | BB squeeze/expansion summary |
| `ATR` | ATR volatility state |
| `돌파` | breakout proximity/confirmation summary |
| `Flow` | L2 positioning summary |
| `Surge` | V-surge / L18 short momentum summary |
| `Kimchi` | kimchi avg pct |
| `FR%` | funding rate pct |
| `OI Δ` | hybrid OI change summary |
| `Price Δ` | 24h or selected display move summary |
| `Signals` | active event count by direction |

### 10.4 Deep-Dive Panel Mapping

| Panel section | Required registry groups |
| --- | --- |
| `L1 WYCKOFF` | structure features + structural events + state machine output |
| `MTF 컨플루언스` | 1h/4h/1d structure states and conflicts |
| `CVD` | CVD features and tape events |
| `실제 강제청산` | force order raw, liq features, liq events |
| `L2 FLOW` | funding/OI/LS/taker features and events |
| `BB 스퀴즈` | BB features and squeeze events |
| `ATR 변동성` | ATR features and volatility state |
| `가격 돌파` | breakout features and breakout events |
| `섹터 자금 흐름` | sector context features |
| `호가창` | depth raw, depth features, imbalance events |
| `시장온도` | fear/greed, kimchi, on-chain context |
| `점수 요약` | backward-compatible layer score summary plus structure confidence |

### 10.5 Verdict Box Mapping

| HTML block | Required contract field |
| --- | --- |
| top signal badges | `verdict.top_reasons` |
| main verdict banner | `verdict.bias` + `verdict.structure_state` + alert suffix |
| active signal count note | active events grouped by bull/bear/neutral |
| entry box | `verdict.entry_zone` |
| target box | `verdict.targets` |
| stop box | `verdict.stop` |
| RR box | `verdict.rr_reference` |
| chart link | symbol-specific external chart URL |

## 11. Missing Precision Gaps Relative To Current Engine

| Gap | Current status | Required change |
| --- | --- | --- |
| Wyckoff L1 is heuristic | current `computeL1Wyckoff` is a multi-window score heuristic with SMA fallback | replace with event-sequence-aware structural engine |
| Flat alpha weighting dominates | `alphaScore` still central | demote to scan ranking and compatibility metric |
| HTML conflates UI timeframe with engine timeframe | partially fixed in current engine | formalize per-feature timeframe authority |
| Live whale/radar logic missing | not implemented | add trade tape / websocket path and live watch contracts |
| Explainability is string-based | layer detail is mostly prose fragments | store machine-readable evidence chain from raw to verdict |
| Raw/feature/event truth tables not exposed | mostly hidden | add explicit debug and LLM inspection contracts |

## 12. Implementation Order

| Phase | Deliverable | Stop condition |
| --- | --- | --- |
| P0 | Raw data and feature registry contracts | every value in current HTML has a canonical raw or feature owner |
| P1 | Event registry + explainability schema | every visible badge and label is backed by named events |
| P2 | Precision Wyckoff structure engine | current heuristic L1 replaced or wrapped by event/state machine |
| P3 | Verdict engine refactor | structure-first verdict with compatibility alpha score |
| P4 | UI and LLM exposure unification | click, table, deep-dive, and natural-language answers consume the same contracts |
| P5 | Live watch subsystem | rolling radar, whale tick, micro-squeeze, live CVD/log stream |

## 13. Non-Negotiable Rules

| Rule | Reason |
| --- | --- |
| UI never invents calculations | avoids drift between click UI and LLM answers |
| LLM never recomputes market math in prose | avoids hidden divergence from engine authority |
| Every user-visible number must have a raw or feature owner | makes debugging and audit possible |
| Every user-visible badge must map to an event ID | keeps UX and logic synchronized |
| Every verdict must expose counter-evidence and invalidation | prevents one-sided overfitting |
| Every feature must declare timeframe authority | avoids hidden misuse of display timeframe |

