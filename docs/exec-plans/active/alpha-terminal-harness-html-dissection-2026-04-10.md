# Alpha Terminal Harness — HTML Dissection Worksheet

Status: draft
Date: 2026-04-10
Source file: `/Users/ej/Downloads/Telegram Lite/나혼자매매 Alpha Flow_by 아카.html` (2305 lines, v3.0 — "15-LAYER ANALYSIS")

Part of the Alpha Terminal harness package:
- `alpha-terminal-harness-engine-spec-2026-04-09.md`
- `alpha-terminal-harness-methodology-2026-04-09.md`
- `alpha-terminal-harness-html-dissection-2026-04-10.md` (this file)
- `alpha-terminal-harness-boundary-2026-04-10.md`
- `alpha-terminal-harness-i18n-contract-2026-04-10.md`
- `alpha-terminal-harness-rationale-2026-04-10.md`

Purpose:
- Take every *atom* in the source HTML — every DOM id, every network call, every JS function, every hard-coded threshold — and tag it with:
  1. Which of the 6 engine contracts owns it (raw / feature / event / structure / verdict / interaction).
  2. The port-scope decision for CHATBATTLE (KEEP / REWRITE / REPLACE / DROP / DEFER).
  3. How a natural-language utterance could reach it.
- This is the P0 ledger that the precision-engine spec abstracts over. Use this when you implement registries, tool contracts, or NL routing.

Contract shorthand:
- `RAW` = raw data registry (pre-normalized external or session fields)
- `FEAT` = deterministic feature value (derived from raw)
- `EVT` = event detection (threshold / sequence / divergence)
- `STRUCT` = structural state / state-machine
- `VERD` = verdict / execution output
- `INTX` = interaction / exposure (UI block, tool call, NL route)

Port-scope shorthand:
- `KEEP` = bring as-is, contract already matches
- `REWRITE` = keep idea, move math to server with explicit contract
- `REPLACE` = current logic is heuristic/wrong; replace with structure/event engine
- `DROP` = local-only UX chrome, no engine backing needed
- `DEFER` = out of P0/P1 scope, park for later phase

---

## 1. Network atoms (raw data sources)

All fetches are browser-side in the source; we move every one of these server-side.

| # | Source call (HTML line) | Endpoint | Returns | Contract owner | Port |
|---|---|---|---|---|---|
| N1 | 635 | `alternative.me/fng/?limit=1` | Fear & Greed value 0-100 | `RAW raw.global.fear_greed.value` | REWRITE (server poll + cache) |
| N2 | 636 | `coingecko /simple/price?ids=tether&vs_currencies=krw` | USDT→KRW proxy | `RAW raw.global.usd_krw.rate` | REWRITE |
| N3 | 637 | `blockchain.info/stats` | `n_tx`, `total_btc_sent` | `RAW raw.global.btc_onchain.*` | REWRITE |
| N4 | 638 | `mempool.space/api/mempool` | `count`, `vsize`, `total_fee` | `RAW raw.global.mempool.{pending_tx,vsize_mb}` | REWRITE |
| N5 | 639 | `mempool.space/api/v1/fees/recommended` | `fastestFee`, `halfHourFee`, `hourFee` | `RAW raw.global.mempool.{fastest_fee,halfhour_fee,hour_fee}` | REWRITE |
| N6 | 640 | `upbit /v1/market/all` + `/v1/ticker` | KRW markets + prices + 24H turnover | `RAW raw.global.exchange.upbit_price_map` + `upbit_volume_map` | REWRITE |
| N7 | 641 | `bithumb /public/ticker/ALL_KRW` (via allorigins proxy) | KRW spot map | `RAW raw.global.exchange.bithumb_price_map` | REWRITE (server direct, drop CORS proxy) |
| N8 | 1687 | `fapi /v1/ticker/24hr` | Full futures universe snapshot | `RAW raw.scan.ticker_24h.*` | REWRITE (server poll or stream) |
| N9 | 767 | `fapi /v1/klines?interval=4h&limit=150` | 4H OHLCV | `RAW raw.symbol.klines.4h` | REWRITE |
| N10 | 768 | `fapi /v1/klines?interval=1h&limit=100` | 1H OHLCV | `RAW raw.symbol.klines.1h` | REWRITE |
| N11 | 769 | `fapi /v1/klines?interval=1d&limit=100` | 1D OHLCV | `RAW raw.symbol.klines.1d` | REWRITE |
| N12 | 770 | `fapi /v1/premiumIndex?symbol=…` | `lastFundingRate`, `markPrice` | `RAW raw.symbol.{funding_rate, mark_price}` | REWRITE |
| N13 | 771 | `fapi /futures/data/openInterestHist?period=…&limit=6` | OI series | `RAW raw.symbol.oi_hist.display_tf` | REWRITE |
| N14 | 772 | `fapi /futures/data/globalLongShortAccountRatio?period=…&limit=4` | L/S ratio series | `RAW raw.symbol.long_short.global` | REWRITE |
| N15 | 773 | `fapi /futures/data/takerlongshortRatio?period=…&limit=6` | taker B/S series | `RAW raw.symbol.taker_buy_sell_ratio` | REWRITE |
| N16 | 774 | `fapi /v1/depth?limit=20` | Top-20 L2 depth | `RAW raw.symbol.depth.l2_20` | REWRITE |
| N17 | 775 | `fapi /v1/forceOrders?limit=50` | Force-orders window | `RAW raw.symbol.force_orders.1h` | REWRITE |
| N18 | — | (missing) sector taxonomy | hard-coded map at 731-747 | `RAW raw.global.sector.map` | REPLACE with server registry |
| N19 | — | (missing) 1m/5m klines | not fetched | `RAW raw.symbol.klines.1m` + `.5m` | DEFER → add for radar / micro-squeeze |
| N20 | — | (missing) websocket feeds | not used | `RAW raw.symbol.{agg_trades,book_ticker,depth}.live` | DEFER → P5 live watch |
| N21 | — | (missing) 5m / 1h OI hist (hybrid) | not fetched | `RAW raw.symbol.oi_hist.{5m,1h}` | REWRITE (needed for precision flow) |

### 1.1 Rate-limiting primitive (HTML-local, server-replaces)

- HTML line 589-611: `class RateLimiter` with `maxConcurrent=8`, `minInterval=80ms`.
- Port: DROP. Server-side batching + Binance fapi quota manager replaces it; no client-side limiter.

---

## 2. DOM atoms (interaction + exposure surface)

### 2.1 Header / watermark

| DOM id / class | Line | Purpose | Contract | Port |
|---|---|---|---|---|
| `#wm` + `#_wmt` / `#_wms` / `#_hcn` | 311-318, 2247-2302 | watermark guardian (injects title, creator name via char-code reconstruction every 5s) | none | DROP (branding only) |
| `.h-main` "◈ ALPHA TERMINAL" | 323 | product label | none | DROP |
| `.h-ver` "v3.0" | 324 | version badge | none | DROP |
| `.live-ind` "15-LAYER ANALYSIS" | 331 | marketing label | none | DROP |

### 2.2 Market bar (global regime strip)

| DOM id | Line | Raw/feature it shows | Contract | Port |
|---|---|---|---|---|
| `#mb-fg` / `#mb-fg-lbl` | 339-340 | F&G value + bucket label | `RAW raw.global.fear_greed.value` + `FEAT feat.global.fear_greed_bucket` | KEEP mapping |
| `#mb-kp` / `#mb-kp-lbl` | 344-345 | BTC kimchi premium %; thresholds `>3` 과열, `<-2` 역발상 | `FEAT feat.kimchi.avg_pct` (BTC) + `EVT event.context.kimchi_*` | KEEP |
| `#mb-usdkrw` | 349 | USD→KRW | `RAW raw.global.usd_krw.rate` | KEEP |
| `#mb-btctx` / `#mb-btctx-lbl` | 354-355 | BTC 24H tx count; thresholds `>450k` / `>250k` | `RAW raw.global.btc_onchain.n_tx_24h` + `FEAT feat.global.btc_network_activity_bucket` | REWRITE (percentile instead of fixed threshold) |
| `#mb-mempool` / `-lbl` | 359-360 | mempool pending tx + MB; thresholds `>80k` / `>30k` | `RAW raw.global.mempool.{pending_tx,vsize_mb}` + `FEAT feat.global.mempool_congestion_bucket` | REWRITE |
| `#mb-fees` / `-lbl` | 364-365 | fastest fee sat/vB; thresholds `>80` 급등, `>30` 높음 | `RAW raw.global.mempool.fastest_fee` + `FEAT feat.global.fee_pressure_bucket` | REWRITE |
| `#mb-sbull` | 369 | count `alpha ≥ 55` | scan aggregation `count(verdict.bias=STRONG_BULL)` | KEEP (replace alpha ≥55 with verdict bias) |
| `#mb-bull` | 374 | count `25..54` | `count(verdict.bias=BULL)` | KEEP |
| `#mb-neut` | 379 | count `-24..24` | `count(verdict.bias=NEUTRAL)` | KEEP |
| `#mb-bear` | 384 | count `-54..-25` | `count(verdict.bias=BEAR)` | KEEP |
| `#mb-sbear` | 389 | count `≤ -55` | `count(verdict.bias=STRONG_BEAR)` | KEEP |
| `#mb-xt` | 394 | count `|FR| > 0.07%` | `count(event.flow.fr_extreme_*)` | KEEP |

### 2.3 Controls (scan request)

| DOM id / handler | Line | Role | Contract | Port |
|---|---|---|---|---|
| `#mode-topn` / `#mode-custom` + `setMode()` | 404-406, 1596-1602 | scan-mode toggle | `RAW raw.session.scan_mode` | KEEP |
| `#topN` `<select>` (30/50/80/100) | 409-414 | top N count | `RAW raw.session.top_n` | KEEP |
| `#sym-input` textarea + `parseSymbols()` | 424-426, 1609-1617 | custom watchlist parser (splits on `[\s,，、\n]+`, uppercases, adds `USDT`) | `RAW raw.session.custom_symbols` | REWRITE (parser is fine; validation must be server-side) |
| `#sym-count` | 420 | UI count echo | none | DROP |
| `.preset-btn` × 6 (BTC+ETH / Top5 / Top10 / L1+L2 / AI+Oracle / DeFi) | 430-435 | quick-fill presets | `RAW raw.session.custom_symbols` (seed) | KEEP as UI helper |
| `.wl-btn` `saveWatchlist()` / `loadWatchlist()` + `localStorage['alpha_watchlist']` | 421-422, 1624-1645 | local watchlist persistence | `RAW raw.session.custom_symbols` (persisted) | REWRITE (user-scoped persistence server-side) |
| `#period` `<select>` (1H/4H/1D) | 442-446 | OI / L·S / Taker period | `RAW raw.session.display_timeframe` | REWRITE (this is **not** the same as the engine's structural timeframe — HTML conflates them) |
| `#minAlpha` `<select>` (-100 / 25 / 55 / -999) | 450-455 | filter lower bound | `RAW raw.session.min_alpha` | KEEP |
| `#scanBtn` + `doScan()` | 459, 1664-1830 | scan orchestrator | `INTX scan.start` | REWRITE (server orchestrates; client fires request) |
| `#stopBtn` + `doStop()` | 458, 1659-1662 | abort flag | `INTX scan.stop` | REWRITE |

### 2.4 Progress / stats bar

| DOM id | Line | Meaning | Contract | Port |
|---|---|---|---|---|
| `#pMsg` / `#pPct` / `#pFill` + `setProgress()` | 466-469, 1588-1592 | runtime batch status | `INTX scan.progress` event | KEEP (stream from server) |
| `#ss-sb` / `-b` / `-n` / `-be` / `-sbe` | 474-478 | verdict-bucket counts | scan aggregation (same as market bar) | KEEP |
| `#ss-tot` | 479 | total scanned count | scan aggregation | KEEP |
| `#ss-wk` | 480 | count with Wyckoff structure (`hasWyckoff`) | `count(verdict.structure_state != state.none)` | REPLACE (currently = `L1.pattern !== 'NONE'`; use structural state) |
| `#ss-mtf` | 481 | count with MTF alignment (`hasMTF`) | `count(mtf alignment feature >= 2 TFs)` | KEEP |
| `#ss-sq` | 482 | BB squeeze count (`hasSqueeze`) | `count(event.bb.{squeeze,big_squeeze})` | KEEP |
| `#ss-liq` | 483 | real-liq alert count (`hasLiqAlert = |L.rl.score| >= 6`) | `count(event.flow.{short_squeeze,long_cascade})` | REWRITE (replace score threshold with event truth) |
| `#ss-xt` | 484 | extreme FR count | `count(event.flow.fr_extreme_*)` | KEEP |

### 2.5 Filter bar + search

| DOM id / handler | Line | Filter meaning | Contract | Port |
|---|---|---|---|---|
| `#searchBox` | 492 | substring match on `symbol` | client filter | KEEP (client) |
| `#f-all` / `-bull` / `-bear` / `-wk` / `-mtf` / `-sq` / `-liq` / `-xt` + `setFilter()` | 493-500, 1886-1895 | facet toggles | `RAW raw.session.active_filter` | KEEP |
| `#rcount` | 501 | filtered row count | client | KEEP |

### 2.6 Table columns

Columns are rendered by `renderTable()` (1951-2031). Each `<th>` calls `sortBy(col)`.

| Column (line) | Source field | Contract | Port |
|---|---|---|---|
| `Symbol` (540) | `r.symbol` + flags (`hasMTF`, `hasSqueeze`, `hasLiqAlert`) + Wyckoff label badge | symbol identity + `verdict.structure_state` + event flags | KEEP |
| `Alpha ↓` (541) | `alphaScore` + bar + label (`aL()`) | `verdict.bias` + legacy alpha score | REWRITE (keep alpha as secondary ranking only) |
| `Wyckoff` (542) | `wyckoffScore` + `wkL.label` | `verdict.structure_state` + `feat.struct.*` | REPLACE |
| `MTF` (543) | `mtfScore` + `layers.mtf.label` | MTF alignment feature/event | KEEP |
| `CVD` (544) | `cvdScore` + absorption flag | `feat.cvd.*` + `event.cvd.*` | KEEP |
| `청산` (545) | `realLiqScore` + `layers.rl.label` | `feat.flow.real_liq_*` + liq events | KEEP |
| `BB` (546) | `bbScore` + `layers.bb.label` | `feat.bb.*` + `event.bb.*` | KEEP |
| `ATR` (547) | `atrScore` + `layers.atr.label` | `feat.atr.*` + `event.atr.*` | KEEP |
| `돌파` (548) | `brkScore` + `layers.brk.label` | `feat.breakout.*` + `event.breakout.*` | KEEP (but source 1D, not 4H × 6 — see §5.13) |
| `Flow` (549) | `flowScore` | L2 flow feature/event bundle | KEEP |
| `Surge` (550) | `surgeScore` + surge factor | `feat.vsurge.*` | KEEP |
| `Kimchi` (551) | `kimchiScore` + `layers.km.premium` | `feat.kimchi.*` | KEEP |
| `FR%` (552) | `r.fr` | `RAW raw.symbol.funding_rate` | KEEP |
| `OI Δ` (553) | `r.oiChangePct` + sparkline over `oiVals` | `feat.flow.oi_change_pct_*` | KEEP |
| `Price Δ` (554) | `r.pricePct` (24h) | `RAW raw.scan.ticker_24h.price_change_pct` | KEEP |
| `Signals` (555) | bull/bear counts over `allSigs` | `count(events by direction)` | KEEP |

### 2.7 Deep-dive panel sections (`#dd-grid`)

Nine panel sections rendered in `openDd()` (2045-2238):

| Section (line) | Fields | Contract | Port |
|---|---|---|---|
| L1 WYCKOFF (2080-2093) | pattern, phase, trend %, range %, climax vol, ST count, spring/utad, sos/sow, C&E target | `STRUCT state.*` + `feat.struct.*` + wyckoff events | REPLACE (event-sequence engine) |
| ② MTF 컨플루언스 (2094-2101) | per-TF pattern + phase + signals | MTF feature + per-TF structure states | KEEP |
| ③ CVD (2102-2106) | trend direction, absorption flag, signals | `feat.cvd.*` + `event.cvd.*` | KEEP |
| ① 실제 강제청산 (2107-2112) | long/short USD (1H), total, signals | `feat.flow.real_liq_*` + liq events | KEEP |
| L2 FLOW (2113-2118) | FR, OI %, L/S, taker B/S + sparkline | flow features + events | KEEP |
| ⑱ BB 스퀴즈 (2119-2125) | state, bandwidth, BB position, upper/lower | `feat.bb.*` + `event.bb.*` | KEEP |
| ⑲ ATR 변동성 (2126-2131) | ATR, ATR %, vol state, stop long, TP1/TP2 | `feat.atr.*` + `event.atr.*` | KEEP |
| ⑫ 가격 돌파 (2133-2141) | pos7, pos30, h7/l7/h30/l30 | `feat.breakout.*` + `event.breakout.*` | REWRITE (source 1D bars, not 4H×6 approximation) |
| ④ 섹터 자금 흐름 (2142-2144) | sector name + mean alpha | `feat.sector.*` | KEEP |
| L4 호가창 (2147-2150) | bid/ask ratio, label, mini viz | `feat.flow.bid_ask_notional_ratio` + `feat.flow.{bid,ask}_wall_near_mid` | REWRITE (add wall-near-mid) |
| L7+L8 시장온도 (2151-2153) | F&G, kimchi | global context features | KEEP |
| L6 BTC 온체인 (2154-2157) | daily tx, mempool, fee | global BTC raw + features | KEEP |
| 15 LAYER 점수 요약 (2159-2190) | per-layer score bar (15 rows) with max caps 28/20/12/12/10/6/12/10/55/15/12/12/10/8/10 | legacy scoring view | KEEP as debug/audit view only |

### 2.8 Verdict box

`#vbox`, rendered by `openDd()` (2195-2235):

| DOM id | Meaning | Contract | Port |
|---|---|---|---|
| `#vb-sym` | symbol label | identity | KEEP |
| `#vb-sigs` | badge list of `allSigs` (bull/bear/neut/warn) | `verdict.top_reasons` | REWRITE (must reference typed events, not prose) |
| `#vverdict` | banner text + class (`vv-bull/bear/neut/warn`) | `verdict.bias` + alert suffix | REWRITE |
| `#vnote` | "active N / bull X / bear Y" string | aggregation text | KEEP |
| `#entry-row` (`eb-entry` / `eb-target` / `eb-stop` + RR) | entry/target/stop/RR boxes | `verdict.{entry_zone,targets,stop,rr_reference}` | KEEP mapping, REWRITE math source |

---

## 3. JS function atoms (client-side compute to server-migrate)

All 15 layer functions + alpha aggregator must move server-side.

| # | Function (line) | Role | Output fields | Contract | Port |
|---|---|---|---|---|---|
| F1 | `loadGlobal()` 631-759 | fetch global context, write to `globalCtx` | F&G, KRW, BTC on-chain, mempool, Upbit/Bithumb maps, sector map | RAW loader | REWRITE (server poller) |
| F2 | `fetchSymbol(symbol, pricePct)` 764-816 | per-symbol fan-out fetch | candles 4h/1h/1d, FR, mark, OI, L/S, taker, depth, forceOrders | RAW loader | REWRITE |
| F3 | `L1_wyckoff(candles)` + `_tryWyckoff()` 821-1002 | 6-window search for Wyckoff; scores ±28 | `{score, pattern, phase, rH/rL/rPct/tPct, spring, utad, sos/sow, climaxVol, stCount, pip, cp, targetBull/Bear, stopBull/Bear}` | STRUCT + FEAT + EVT | REPLACE (event-sequence engine, see §4) |
| F4 | `L2_flow(fr, oiPct, ls, taker, pr)` 1007-1039 | flow score ±55 | `{score, sigs, fr, oiPct, lsRatio, takerRatio}` | FEAT + EVT | REWRITE (explicit events) |
| F5 | `L3_vsurge(candles)` 1044-1059 | recent 5 vs prior 25 volume | `{score, surgeFactor, label}` | FEAT `feat.vsurge.*` | KEEP logic, rewrite output |
| F6 | `L4_ob(bids, asks)` 1064-1078 | bid/ask notional ratio | `{score, ratio, label, bidVol, askVol}` | FEAT `feat.flow.bid_ask_notional_ratio` | REWRITE (add wall-near-mid) |
| F7 | `L5_liq(fr, cp, oiPct)` 1083-1094 | heuristic liquidation bias | `{score, label, risk, liqLong, liqShort}` | FEAT + EVT | REPLACE (use real force orders, not fr+oi guess; the `cp*0.9` / `cp*1.1` is wrong) |
| F8 | `L6_onchain(btcOn, mp, fees)` 1099-1161 | BTC on-chain score ±10 | `{score, label, sigs, nTx, …}` | FEAT + EVT global context | REWRITE (percentile buckets) |
| F9 | `L7_fg(fgVal)` 1166-1176 | F&G score ±8 | `{score, label, value, col}` | FEAT + EVT | KEEP logic |
| F10 | `L8_kimchi(sym, cp, upMap, biMap, krw)` 1181-1206 | kimchi premium ±10 | `{score, premium, label, upbitP, bithumbP, …}` | FEAT + EVT | KEEP |
| F11 | `L9_realLiq(forceOrders, cp)` 1211-1253 | real-liq score ±12 | `{score, label, shortLiqUSD, longLiqUSD, net, total, sigs}` | FEAT + EVT | KEEP |
| F12 | `L10_mtf(c4h, c1h, c1d)` 1258-1296 | MTF alignment ±20 | `{score, sigs, tfs, accCount, distCount, label}` | cross-TF structure summary | REWRITE (source from structural state per TF, not from re-running L1_wyckoff on each TF) |
| F13 | `L11_cvd(candles)` 1301-1354 | CVD divergence/absorption ±12 | `{score, sigs, cvdTrend, absorption, cvdVals, label}` | FEAT + EVT | KEEP (but prefer true taker-buy on 5m) |
| F14 | `L12_sector(symbol)` 1359-1381 | sector flow ±10 | `{score, sector, sectorScore, sigs, label}` | FEAT `feat.sector.*` | KEEP |
| F15 | `L13_breakout(candles)` 1386-1432 | 7d/30d breakout ±12 | `{score, sigs, h7/l7/h30/l30, pos7/pos30, label}` | FEAT + EVT breakout | REWRITE (source 1D bars, not `candles.slice(-7*6)` over 4H) |
| F16 | `L14_bb(candles, 20, 2.0)` 1437-1486 | BB squeeze ±10 | `{score, squeeze, bigSqueeze, expanding, bw, bbPos, upper, lower, sma, label}` | FEAT + EVT | KEEP (add rolling percentile) |
| F17 | `L15_atr(candles, 14)` 1491-1537 | ATR vol ±6 | `{score, atr, atrPct, volState, stopLong, stopShort, tp1Long, tp2Long, label}` | FEAT + EVT | KEEP |
| F18 | `computeAlpha(L)` 1545-1583 | sum of 15 layer scores | `{alpha, verdict, vClass, allSigs, note}` | VERD (legacy) | REPLACE (structure-first verdict; keep alpha as compat field) |
| F19 | `renderTable()` 1951-2031 | client-side row rendering | — | INTX view | KEEP (consumes server payload) |
| F20 | `openDd(symbol)` 2045-2238 | deep-dive + verdict box rendering | — | INTX view | KEEP |
| F21 | `closeDd()` 2240-2245 | dismiss panel | — | INTX view | KEEP |
| F22 | `filterData()` 1902-1918 | client facet filter | — | INTX view | KEEP |
| F23 | `sortBy(col)` 1896-1901 | client sort | — | INTX view | KEEP |
| F24 | `updateMarketBar()` 1842-1867 | fill `#mb-*` from aggregations | — | INTX view | KEEP |
| F25 | `updateStats()` 1869-1881 | fill `#ss-*` counts | — | INTX view | KEEP |

---

## 4. Hard-coded threshold & magic-number ledger

These are the knobs that make answers drift. Every one of them must become a named, server-owned config so NL answers and click answers agree.

### 4.1 Wyckoff (`_tryWyckoff` 847-1001)

| Line | Constant | Meaning | Registry target |
|---|---|---|---|
| 830-832 | `configs [{R:30,T:40}…{R:55,T:75}]` | multi-window search grid | `feat.struct.window_grid` |
| 864-866 | `tPct < -0.05` / `> 0.05` | ACC vs DIST trend gate | `feat.struct.trend_gate_pct` |
| 872 | `rPct > 0.38 \|\| < 0.015` | range width bounds | `feat.struct.range_bounds` |
| 888 | `vSpike >= 1.2` | climax volume min spike | `feat.struct.climax_min_ratio` |
| 899 | `buf = 0.08` | ST proximity band 8% | `feat.struct.st_band_pct` |
| 908 | `stCount = min(7)` | ST cap | `feat.struct.st_cap` |
| 911 | `last25` | spring/UTAD search window | `feat.struct.springutad_window` |
| 916 | `c.l < rL*0.9975 && c.c > rL*0.994` | spring penetration (0.25%) + recovery (0.6%) | `feat.struct.spring_depth/recovery` |
| 920 | `c.h > rH*1.0025 && c.c < rH*1.006` | UTAD inverse | `feat.struct.utad_depth/recovery` |
| 927 | `c.c > rH*1.004 && ... v > avgVol*1.1` | SOS breakout (0.4% + 1.1×v) | `event.wyckoff.sos.thresholds` |
| 928 | `c.c < rL*0.996 && ... v > avgVol*1.1` | SOW | `event.wyckoff.sow.thresholds` |
| 934 | `vol2 < vol1*0.82` | volume contraction 18% | `feat.struct.volume_contraction` |
| 959-976 | layer-1 score weights (12, 10, 7, 4, 8, 9/6, 6, 4, 5) | heuristic alpha weights | **REPLACE** — structure-first engine should not depend on these |
| 979 | `rawScore < 12` | minimum structure admission | `feat.struct.min_phase_conf` |
| 986 | `clip [-28, 28]` | score cap | legacy compat only |

### 4.2 Flow (`L2_flow` 1007-1039)

| Line | Constant | Meaning | Registry target |
|---|---|---|---|
| 1010 | `fr < -0.07` | FR extreme short squeeze | `event.flow.fr_extreme_negative` |
| 1011 | `fr < -0.025` | FR negative | `event.flow.fr_negative` |
| 1015 | `fr < 0.04` | FR positive | `event.flow.fr_positive` |
| 1016 | `fr < 0.08` | FR hot | `event.flow.fr_hot` |
| 1016-1017 | `fr ≥ 0.08` | FR extreme long risk | `event.flow.fr_extreme_positive` |
| 1019 | `oi>3 && pr>0.5` | long entry build | `event.flow.long_entry_build` |
| 1020 | `oi>3 && pr<-0.5` | short entry build | `event.flow.short_entry_build` |
| 1021 | `oi<-3 && pr<-0.5` | long liquidation capitulation | `event.flow.long_cascade_active` |
| 1022 | `oi<-3 && pr>0.5` | short capitulation | `event.flow.short_squeeze_active` |
| 1026-1029 | L/S bands (`>2.2`, `>1.6`, `<0.6`, `<0.9`) | regime buckets | `feat.flow.long_short_ratio_regime` |
| 1033-1036 | taker bands (`>1.25`, `>1.08`, `<0.75`, `<0.92`) | taker regime | `feat.flow.taker_regime` |
| 1038 | `clip [-55, 55]` | layer cap | compat only |

### 4.3 Other layer magic numbers (abbreviated — every one must become registry)

| Layer | Key thresholds |
|---|---|
| L3 V-surge (1044-1059) | `sf > 5 / 3 / 1.8 / 1.3 / <0.35 / <0.6` → bands |
| L4 OB (1064-1078) | `ratio > 3.5 / 2 / 1.3 / 0.8 / 0.5 / 0.3` → bid/ask bands |
| L5 liq (1083-1094) | `cp*0.90` long liq proxy, `cp*1.10` short liq proxy (**WRONG: assumes 10×; DROP**) |
| L6 on-chain (1099-1161) | nTx 450k/300k/150k; avgTxV 3.0/1.5/0.5 BTC; pending 100k/50k/20k; fee 100/50/20 |
| L7 F&G (1166-1176) | bands 15/30/45/55/70/85 |
| L8 kimchi (1181-1206) | bands 5/3/1.5/0.5/-0.5/-2/-4 |
| L9 real-liq (1211-1253) | $500k / $100k absolute + 2× / 1.5× dominance; 1H window |
| L11 CVD (1301-1354) | priceChange ±0.005; absorption: `|priceChange|<0.008 && |cvdTrend|>|cvdStart|*0.3` |
| L13 breakout (1386-1432) | `candles.slice(-7*6)` / `-30*6` assumes 4H bars (**WRONG at other TFs; REWRITE**) |
| L14 BB (1437-1486) | period 20, mult 2.0; squeeze `bw<bw20ago*0.65`; bigSqueeze `bw<bw50ago*0.5`; expanding `*1.3` |
| L15 ATR (1491-1537) | period 14; vol bands `<0.6` / `<0.8` / `>1.8` / `>1.3`; stop 1.5×ATR; TP 2×/3× |
| alpha (1545-1583) | bands ±60 / ±25 for verdict; suffixes: extreme FR, MTF triple, BB big squeeze |

> **Rule:** none of these numbers stays in a client file. They live in a single config registry, surfaced via `scan.get_registry_config` for debug/admin tools.

---

## 5. 6-contract mapping summary table

For quick lookup, every scorable thing in the HTML resolves to:

| HTML artefact | RAW | FEAT | EVT | STRUCT | VERD | INTX |
|---|---|---|---|---|---|---|
| Market bar global fields | ✅ | ✅ (buckets) | ✅ (regime) | — | — | `view.market_bar` |
| Market bar verdict counts | — | — | — | — | ✅ (aggregation) | `view.market_bar` |
| Stats bar counts | — | — | ✅ (counts over events) | ✅ (state count) | — | `view.stats_bar` |
| Table row: Alpha column | — | — | — | — | ✅ (`bias`, legacy alpha) | `view.scan_table` |
| Table row: Wyckoff column | — | ✅ | ✅ | ✅ | — | `view.scan_table` |
| Table row: MTF/CVD/BB/ATR/돌파 cols | — | ✅ | ✅ | — | — | `view.scan_table` |
| Table row: Flow/Surge/Kimchi/FR/OI/Price cols | ✅ | ✅ | ✅ | — | — | `view.scan_table` |
| Table row: Signals column | — | — | ✅ (aggregation) | — | — | `view.scan_table` |
| Deep-dive L1 Wyckoff | ✅ | ✅ | ✅ | ✅ | — | `view.symbol_deep_dive` |
| Deep-dive MTF | ✅ | ✅ | — | ✅ (per-TF) | — | `view.symbol_deep_dive` |
| Deep-dive CVD/BB/ATR/breakout/sector/OB | ✅ | ✅ | ✅ | — | — | `view.symbol_deep_dive` |
| Deep-dive liquidation | ✅ | ✅ | ✅ | — | — | `view.symbol_deep_dive` |
| Deep-dive "15 layer 점수 요약" | — | — | — | — | ✅ (legacy compat) | `view.debug_panel` |
| Verdict box | — | — | ✅ (top_reasons) | ✅ (structure_state) | ✅ | `view.verdict_box` |
| Entry/TP/Stop/RR boxes | — | ✅ (atr, wyckoff targets) | — | ✅ (invalidation) | ✅ (execution refs) | `view.verdict_box` |
| Scan mode / TopN / custom / presets / watchlist | ✅ (session) | — | — | — | — | `view.controls` |
| Scan button / progress / stop | — | — | — | — | — | `INTX scan.start/stop/progress` |
| Filter/search | — | — | — | — | — | `view.filter_bar` (client) |

---

## 6. Port-scope decision summary

### 6.1 What we bring over as-is (KEEP)

- All DOM structure of controls, market bar, stats bar, table columns, filter bar, deep-dive grid, verdict box (the layout is sound and the information density is right).
- `parseSymbols()` parser behavior (commas/spaces/CJK separators, uppercase, `USDT` suffix).
- Preset buttons and watchlist feature (UX).
- Feature math for: L3 V-Surge, L4 OB ratio (with wall extension), L7 F&G, L8 kimchi, L9 real-liq, L11 CVD, L12 sector, L14 BB, L15 ATR.

### 6.2 What we rewrite (REWRITE — same idea, server-authoritative + explicit contract)

- All network fetches (§1).
- Rate limiter → server quota manager.
- L2 flow scoring → split into explicit event detections.
- L6 on-chain buckets → percentile instead of hard threshold.
- OB ratio → add `bid_wall_near_mid` / `ask_wall_near_mid`.
- L13 breakout → source 1D bars (not 4H × 6 approximation).
- Watchlist persistence → server-scoped.
- `period` dropdown → split display-timeframe (chart) from engine-timeframe (feature authority).

### 6.3 What we replace (REPLACE — logic is wrong or fundamentally heuristic)

- `L1_wyckoff` → event-sequence structural state engine (per existing spec §7).
- `L5_liq` heuristic (`cp*0.9` / `cp*1.1` liq-zone guess) → drop entirely; use `L9_realLiq` force-order data as the only liquidation authority.
- `L10_mtf` → source per-TF structural state instead of re-running L1 heuristic on each TF.
- `computeAlpha` flat sum → structure-first verdict engine; keep `alphaScore` only as a secondary compat field for ranking.
- Sector hard-coded map → server registry.
- All hard-coded thresholds → named config registry, editable and versioned.

### 6.4 What we drop (DROP — UX chrome, no engine backing)

- Watermark guardian `(function(){ _c, _a, _s, _p ... })()` (2247-2302).
- CORS proxy (`allorigins`) — server calls Bithumb directly.
- Client-side RateLimiter class.
- `#sym-count`, `.live-ind`, version badge, header branding text.

### 6.5 What we defer (DEFER — later phase)

- 1m / 5m klines for radar + micro-squeeze (P5 live-watch).
- Websocket streams (aggTrades, bookTicker, depth diffs).
- Whale tick ($50k+ single-trade event).
- Rolling 60s notional radar and 2.5× explosion detector.

---

## 7. Natural-language access plan

The whole point of the decomposition is that NL utterances land on the same contracts as click UI. Every utterance resolves to (a) one or more contract IDs and (b) optional filter/scope parameters.

### 7.1 Intent → contract routing matrix

| Intent class | Example utterances | Required contracts | Scope params |
|---|---|---|---|
| **Rank / scan** | "지금 알파 점수 높은 거 보여줘", "Strong Bull만", "롱 과열 종목", "숏 우세 코인", "Top 20 USDT 페어" | `scan.get_table` | `bias_min`, `facet (wk/mtf/sq/liq/xt)`, `top_n`, `sort` |
| **Overview lookup** | "BTC 어때", "ETH 지금 상태", "솔라나 간단히" | `scan.get_symbol_overview` | `symbol` |
| **Why / explanation** | "왜 Bull Bias야", "이거 왜 이 점수야", "근거 알려줘" | `scan.get_symbol_verdict` + `scan.get_symbol_structure` | `symbol`, optional `focus` |
| **Structure drill** | "와이코프만 자세히", "Phase 뭐야", "spring 떴어?", "Distribution이야?" | `scan.get_symbol_structure` + filtered `features/events` | `symbol`, `focus=wyckoff` |
| **Flow drill** | "펀딩 어때", "OI 얼마나 늘었어", "L/S 비율", "테이커 매수 많아?" | `scan.get_symbol_features` + `scan.get_symbol_events` (focus=flow) | `symbol`, `focus=flow` |
| **Liquidation drill** | "실제 청산 얼마나 있었어", "롱 청산 가속 중?", "숏 스퀴즈 가능?" | `scan.get_symbol_features` + `events` (focus=liq) | `symbol`, `focus=liq` |
| **Volatility / setup** | "BB 스퀴즈 중이야?", "ATR 낮아?", "폭발 임박?" | `features+events` (focus=vol/bb/atr) | `symbol` |
| **Breakout** | "30일 신고가 근접한 거", "지지선 깨진 거", "레인지 상단 돌파" | `scan.get_table` with breakout event filter | `event=breakout.*` |
| **Context / regime** | "공포탐욕지수", "김프 얼마야", "BTC 네트워크 붐비는 중?" | `scan.get_global_context` | none |
| **Compare** | "BTC랑 ETH 비교", "SOL이랑 AVAX 누가 더 강해" | `scan.compare_symbols` | `symbols[]` |
| **Entry / risk** | "진입가 얼마에 보면 돼", "손절 어디", "RR 좋아?" | `scan.get_symbol_verdict` (execution block) | `symbol` |
| **Multimodal chart** | "(이미지) 이거 어때", "(차트 캡처) 지금 진입 가능?" | image → `{symbol, timeframe, focus}` → `get_symbol_structure` + `verdict` | `symbol`, `timeframe`, `focus` |
| **Live watch** *(deferred)* | "1분봉 돌돌 굴려줘", "고래 체결 뜨면 알려줘" | `scan.start_live_watch` | `symbol`, `triggers[]` |
| **Session control** | "다시 스캔해", "Top 100으로 바꿔", "BTC ETH SOL만 분석" | `INTX scan.start` with `{mode, topN | symbols}` | as given |

### 7.2 Utterance parser requirements

The NL router must extract:
1. **Intent class** (one of 7.1's rows).
2. **Symbol list** (BTC, BTCUSDT, 비트코인, $BTC — normalize to `BTCUSDT` via symbol resolver).
3. **Timeframe** (1m/5m/15m/1h/4h/1d; default 4h but display-TF, not engine-TF).
4. **Focus** (wyckoff / flow / liq / bb / atr / breakout / cvd / sector / context / exec).
5. **Facet filters** (bull/bear/squeeze/mtf/liq alert/extreme fr).
6. **Rank parameters** (top N, min alpha, sort column).

### 7.3 Response shape rules

Every NL answer must be assembled from cached contract outputs. The LLM formats; it **never recomputes market math**. Canonical blocks returned to the LLM:

1. `verdict_block`: `{bias, structure_state, confidence, urgency, top_reasons[], counter_reasons[], invalidation, entry_zone, stop, targets[], rr_reference, data_freshness}`.
2. `feature_block` (filtered by focus): only the feature IDs relevant to the intent.
3. `event_block` (filtered by focus): active events + inactive-but-near-trigger events.
4. `raw_block` (debug / deep inspection only).

### 7.4 Ambiguity / failure handling

| Case | Behavior |
|---|---|
| Symbol not in Binance futures universe | return structured error; LLM formats as "바이낸스 선물 미상장" with fallback suggestions |
| Data stale (`data_freshness.stale = true`) | LLM must mention staleness in answer; never pretend fresh |
| Missing focus → wide query | return overview + top 3 reasons only; do not dump all features |
| Multiple symbols in single sentence | route to `scan.compare_symbols` |
| No symbol mentioned | route to `scan.get_table` with remaining parameters |

---

## 8. P0 / P1 / P2 extraction from this worksheet

This slots directly into the existing precision-engine spec phases:

| Phase | Items from this worksheet |
|---|---|
| **P0 — raw + feature registry contracts** | §1 network atoms (N1-N17, +N21), §3 F1-F2 rewritten as server loaders, §4 all thresholds lifted to config registry, §5 mapping table completed, §2.3 + §2.6 + §2.7 DOM field owners assigned |
| **P1 — event registry + explainability** | §3 F4-F17 rewritten as explicit event emitters, §2.4 stats-bar counts rewired to event aggregations, §2.7 deep-dive signals become typed event lists |
| **P2 — precision Wyckoff structure engine** | §3 F3 replaced (§4.1 thresholds become structural feature registry), §3 F12 MTF sourced from per-TF state, §2.7 "L1 WYCKOFF" + "② MTF" panels consume structure engine output |
| **P3 — verdict refactor** | §3 F18 replaced; §2.8 verdict box reads `verdict_block`; alpha kept as secondary ranking |
| **P4 — UI/LLM unification** | §7 NL routing matrix wired to the same contracts as `renderTable()` / `openDd()` consume |
| **P5 — live watch** | §6.5 deferred items (1m/5m, websockets, whale tick, radar) |

---

## 9. Open questions (to resolve before touching code)

1. **Timeframe authority** — HTML `#period` currently drives OI/LS/Taker limit=4-6 window. Should engine OI-change be always computed at a fixed 5m×12 + 1h×6 pair, with `#period` becoming a pure display control? (Spec assumes yes.)
2. **Sector taxonomy** — should sector be a flat enum like the HTML, or a 2-level registry (chain ecosystem + narrative)? Affects `feat.sector.*` schema.
3. **Watchlist persistence scope** — per-user (authenticated) or per-device (localStorage-only)? Affects whether `raw.session.custom_symbols` is persisted server-side.
4. **Multimodal image parsing** — §7.1 assumes we can extract `{symbol, timeframe, focus}` from a chart screenshot. Do we commit to this now or defer to P4?
5. **Alpha score fate** — keep as secondary ranking only, or drop entirely after P3? (Worksheet keeps it.)
6. **Live force-orders window** — HTML uses last 50 force orders and filters to last 1H. Should we widen to 4H + 24H rolling windows for liquidation regime context?

Resolve these by writing explicit decisions into this file (add §10 "Resolved decisions") before starting P0 implementation.
