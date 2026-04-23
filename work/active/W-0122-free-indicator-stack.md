# W-0122 — Free Indicator Stack (4 Pillars + Confluence Engine)

## Status

`IN-FLIGHT — Phase 1 shipped, multichain chain-intel route expanded, official Etherscan chain registry added` — 2026-04-23

### Shipped (main)

| Slice | PR | What | Live data |
|---|---|---|---|
| Registry + Archetypes + Pillar 3 + Liq Phase-1 | #148 | Indicator Registry (types/registry/adapter) + 6 archetype renderers + venue-divergence endpoint + liq-clusters endpoint approximation + 3 engine blocks | Venue divergence live; liq clusters derived from chart feed |
| Archetype B+D + venue tests | #154 | Stratified + Divergence renderers + block_evaluator wire + 9 pytest cases pass | — |
| Real 30-day rolling percentile | #156 | `/api/market/indicator-context` backed by Binance public OI/funding history; signed percentile; replaced the adapter magnitude-pinned estimate for OI+funding gauges | OI 1h/4h, funding percentile live |
| W-0122-F Free Wins | #157 | SSR (`/api/market/stablecoin-ssr`), RV Cone (`/api/market/rv-cone`), Funding Flip (`/api/market/funding-flip`). First data producer for Archetype E. | All 3 live |
| W-0122-Confluence Phase 1 | #159 | Pure-function scorer + 6-contribution composer + `/api/confluence/current` aggregator + `ConfluenceBanner` UI. 11 unit tests. | Live banner in TradeMode |
| W-0122-C1 Options Phase 1 | #161 | `/api/market/options-snapshot` (Deribit REST, ~870 instruments/call). P/C ratio + 25d skew + ATM IV. Wired into registry + adapter + Confluence scorer (+3 tests → 14 total). | Live Pillar 2 |

### Confluence readings at commit time (BTC 4h)

```
Before  Slice-F + Confluence + Options:  score was evidence-row only
After  Slice-F:                          no composite score
After  Confluence P1:                    +15.5  BULL  conf 50%  div=true
After  Options:                          +18.8  BULL  conf 67%  div=true
Active contributions: venue_divergence, ssr, options  (3 of 7 material)
```

### Still open (future slices)

- [ ] Pillar 1 real forceOrder WS ingestion (multi-venue) — current Phase 1 is chart-feed approximation
- [ ] Pillar 2 WS streaming + real Greeks (BSM) + GEX + gamma flip overlay
- [ ] Pillar 4 Exchange Netflow (Arkham — blocked on API key provision)
- [ ] Confluence Phase 2: engine-side scoring + Flywheel weight learning + capture snapshot persistence

## Reset Slice — 2026-04-23

`W-0148` reset decision fixes the architecture order as:

`Ingress -> Fact -> Search -> Agent Context -> Surface`

with a separate engine-owned `Runtime State / Workflow State` plane.

For `W-0122`, the immediate job is narrower:

- move app-owned fact assembly toward engine-owned read models
- keep app fetchers as temporary ingress bridges only
- avoid touching search/agent/surface code unless required for compatibility
- start only after `W-0148 / PR0.2` contract/proxy split lands on updated `main`

### First Fact-Plane Impact Cone

| File | Current responsibility | Target layer | Decision | First commit |
|---|---|---|---|---|
| `engine/market_engine/fact_plane.py` | bounded engine fact builder on top of cache/loaders | fact | keep and expand | yes |
| `engine/api/routes/ctx.py` | engine fact gateway (`GET /ctx/fact`) | fact | keep and expand | yes |
| `engine/market_engine/types.py` | legacy market-engine shared types | fact/runtime support | keep; no broad rewrite in this slice | no |
| `app/src/lib/server/marketSnapshotService.ts` | monolithic app fact assembler + persistence fan-out | fact bridge | split; shrink toward engine fact adapter | yes |
| `app/src/routes/api/market/snapshot/+server.ts` | public compatibility route for snapshot consumers | fact adapter | keep route, rewire internals toward engine fact | yes |
| `app/src/routes/api/market/snapshot/snapshot.test.ts` | snapshot route contract coverage | fact adapter test | update with cutover | yes |
| `app/src/lib/server/providers/registry.ts` | wraps `collectMarketSnapshot()` into provider registry context | fact bridge | keep, but point at cut-down snapshot path | maybe |
| `app/src/lib/server/marketFeedService.ts` | derivatives/news/raw normalization helpers | ingress bridge | freeze; do not add product semantics | no |
| `app/src/lib/server/marketDataService.ts` | raw fetch bag for market upstreams | ingress bridge | freeze; eventual engine ownership | no |
| `app/src/routes/api/market/indicator-context/+server.ts` | standalone percentile fact producer | fact | keep temporarily; later fold into engine | no |
| `app/src/routes/api/market/flow/+server.ts` | app-side fact composition for terminal flow panel | fact consumer | defer until snapshot cut settles | no |
| `app/src/routes/api/market/events/+server.ts` | app-side event/fact composition | fact consumer | defer | no |
| `app/src/routes/api/market/derivatives/[pair]/+server.ts` | derivatives snapshot bridge | ingress/fact bridge | defer | no |
| `app/src/routes/api/confluence/current/+server.ts` | app-side confluence composition across fact routes | fact consumer/composer | defer until fact route shape stabilizes | no |
| `app/src/lib/server/terminalParity.ts` | terminal surface adapter over multiple fact/search routes | surface adapter | defer; consume canonical facts later | no |
| `app/src/lib/cogochi/workspaceDataPlane.ts` | workspace bundle / study presentation assembly | surface adapter | keep narrow; no fact ownership | no |
| `app/src/lib/api/terminalBackend.ts` | surface fetch bundle for terminal | surface | consumer only; no changes in first cut | no |

### Route Family Classification

- first-cut fact routes:
  - `app/src/routes/api/market/snapshot/+server.ts`
  - `engine/api/routes/ctx.py`
- fact producers but not first-cut:
  - `app/src/routes/api/market/indicator-context/+server.ts`
  - `app/src/routes/api/market/options-snapshot/+server.ts`
  - `app/src/routes/api/market/venue-divergence/+server.ts`
  - `app/src/routes/api/market/liq-clusters/+server.ts`
  - `app/src/routes/api/market/stablecoin-ssr/+server.ts`
  - `app/src/routes/api/market/rv-cone/+server.ts`
  - `app/src/routes/api/market/funding-flip/+server.ts`
- fact consumers:
  - `app/src/routes/api/market/flow/+server.ts`
  - `app/src/routes/api/market/events/+server.ts`
  - `app/src/routes/api/confluence/current/+server.ts`

### Drift Notes

- the current checkout does not contain several older `W-0122` canonical files listed below as active fact-plane targets:
  - `app/src/lib/server/marketReferenceStack.ts`
  - `app/src/lib/server/marketCapPlane.ts`
  - `app/src/routes/api/market/reference-stack/+server.ts`
  - `app/src/routes/api/market/influencer-metrics/+server.ts`
  - `app/src/routes/api/market/macro-overview/+server.ts`
- those lanes must be treated as extraction or reimplementation follow-ups, not assumed present in this slice.

### Influencer Metrics 100 — 2026-04-23

- scope extension: trader / CT / X 에서 반복적으로 조회되는 지표 100개를 canonical indicator inventory 로 고정한다.
- source basis: X posts + official platform surfaces from CryptoQuant, Glassnode, DefiLlama, Dune, CoinGlass, Deribit, LunarCrush.
- canonical owner: `engine`
- owning file for Phase 1 inventory: `engine/market_engine/indicator_catalog.py`
- first implementation shape:
  - engine catalog file with exactly 100 metrics
  - per-metric status = `live | partial | blocked | missing`
  - per-metric family + primary sources + current local owner (`engine | app_bridge | none`)
  - engine read route exposing filtered catalog + coverage summary
- interpretation rules:
  - `live` = current checkout 에서 실사용 가능한 route/fetch/feature path 가 있음
  - `partial` = proxy/approx/app-only/heuristic 또는 canonical engine cutover 미완
  - `blocked` = API key / paid tier / provider restriction 때문에 현재 운영 기본값으로 닫힘
  - `missing` = 코드/route/fetch lane 자체가 아직 없음
- Karpathy promotion loop for this inventory:
  - `cataloged` = metric row exists and status truth is explicit
  - `readable` = bounded engine contract can describe it or partially serve it
  - `operational` = bridge/live route exists with degraded-state contract
  - `promoted` = engine-owned canonical lane is fit for app/search/agent cutover
- execution rule: 앞으로 새 지표 추가/편입 논의는 먼저 이 catalog row 를 갱신한 뒤 ingestion/read-model work 로 내려간다.
- execution rule 2: `status` 와 `promotion_stage` 는 다른 질문이다. CTO queue 는 `partial -> live` 와 `cataloged/readable -> operational/promoted` 를 따로 관리한다.
- non-goal for this slice: 100개 전부를 당장 live ingestion 으로 완성하지 않는다. 이번 컷은 canonical inventory + status truth + engine read path 를 먼저 만든다.

### First Commit Scope

1. preserve `GET /ctx/fact` as the canonical engine fact entrypoint
2. add an app-side compatibility adapter in `marketSnapshotService.ts` that can read engine fact payloads
3. rewire `/api/market/snapshot` to prefer engine-owned fact data while preserving the existing public response shape
4. update snapshot route tests to lock the compatibility contract

### Explicit Defers

- do not split `scanEngine.ts` in this slice
- do not move `terminalParity.ts` yet
- do not rework `workspaceDataPlane.ts` yet
- do not reopen `W-0139` surface work while fact ownership is still shifting

### Next Compatibility Cut

1. keep `/api/confluence/current` public payload stable
2. make `/api/confluence/current` prefer engine `/api/facts/confluence`
3. preserve current app-side heuristic aggregation only as fallback

### Branch Split Reason — `codex/w-0122-flow-fact-bridge`

- parent `codex/w-0148-data-engine-reset` worktree picked up unrelated user WIP plus merge conflicts
- this slice needs one clean PR and must not touch the conflicted tree
- branch starts from validated reset head `81c1d7c7` and owns one bounded follow-up only

### Current Compatibility Cut

1. keep `/api/market/flow` public payload stable
2. make `/api/market/flow` prefer engine `/api/facts/perp-context`
3. keep ticker / CMC reads in app until a dedicated engine price-summary route exists
4. preserve current app-side derivatives composition only as fallback
5. mirror the same `perp-context` bridge pattern in `/api/market/events` without moving DexScreener enrichment yet
6. make `/api/market/derivatives/[pair]` prefer engine `/api/facts/perp-context` while preserving the route payload shape
7. keep the app `facts` proxy allowlist aligned with the actually-used `price-context` / `perp-context` engine routes

### Current Lane Slice — Consumer Fact Cut
This slice groups the next product-facing fact consumers under one W-0122 merge unit so the app keeps moving toward engine-owned truth without spawning a second branch for the same lane.

This slice groups the next product-facing fact consumers under one W-0122 merge unit so the app keeps moving toward engine-owned truth without spawning a second branch for the same lane.

1. keep `/api/market/events` public payload stable
2. make `/api/market/events` prefer engine `/api/facts/perp-context` for funding / long-short / crowding
3. keep DexScreener event feed and liquidation enrichment on existing ingress bridges until engine fact routes expose a canonical event bundle
4. keep `/api/terminal/intel-policy` public payload stable
5. make `/api/terminal/intel-policy` consume `/api/market/macro-overview`, which is already engine-preferred via `GET /facts/market-cap`
6. keep existing news / events / flow / trending / picks joins in place; only add the macro regime card on top of the flow panel
7. keep `/api/market/reference-stack` curated public payload stable
8. consume engine `/api/facts/reference-stack` only as additive `factCoverage`
9. do not replace curated `entries` with engine coverage `sources`
10. lock the cut with targeted `market/events`, `terminal/intel-policy`, `reference-stack`, and plane-client tests

## Goal

무료 API 만으로 **$400/월 premium stack ($39 Glassnode + $99 Laevitas + $29 Coinglass + $150 Nansen) 의 70-80% 커버리지** 를 달성하고, 우리 80+ building blocks 및 flywheel 과 결합해 **경쟁사가 살 수 없는 독점 confluence** 를 생산한다.

## Owner

engine

## Canonical Files

- `work/active/W-0122-free-indicator-stack.md`
- `work/active/CURRENT.md`
- `docs/product/competitive-indicator-analysis-2026-04-21.md`
- `docs/domains/indicator-registry.md`
- `docs/domains/terminal-html-backend-parity.md`
- `app/src/lib/contracts/chainIntel.ts`
- `app/src/lib/contracts/supportedChains.ts`
- `app/src/lib/contracts/influencerMetrics.ts`
- `app/src/lib/contracts/marketCapPlane.ts`
- `app/src/lib/indicators/adapter.ts`
- `app/src/lib/indicators/registry.ts`
- `app/src/lib/api/terminalBackend.ts`
- `app/src/lib/server/chainIntel.ts`
- `app/src/lib/server/etherscan.ts`
- `app/src/lib/server/supportedChains.ts`
- `app/src/lib/server/solscan.ts`
- `app/src/lib/server/tronscan.ts`
- `app/src/lib/server/marketCapPlane.ts`
- `app/src/lib/server/marketSnapshotService.ts`
- `app/src/lib/server/marketDataService.ts`
- `app/src/routes/api/market/chain-intel/+server.ts`
- `app/src/routes/api/market/chains/search/+server.ts`
- `app/src/routes/api/market/influencer-metrics/+server.ts`
- `app/src/routes/api/market/macro-overview/+server.ts`
- `app/src/routes/api/market/stablecoin-ssr/+server.ts`
- `app/src/routes/api/terminal/intel-policy/+server.ts`
- `app/src/lib/server/intelPolicyRuntime.ts`
- `app/src/lib/server/marketReferenceSources.ts`
- `app/src/lib/server/marketReferenceStack.ts`
- `app/src/routes/api/confluence/current/+server.ts`
- `app/src/routes/api/coingecko/global/+server.ts`
- `app/src/routes/api/market/reference-stack/+server.ts`
- `engine/blocks/`
- `engine/api/routes/ctx.py`
- `engine/market_engine/indicator_catalog.py`

## Why

- 현재 `/cogochi` 는 단일 지표를 단일 값으로 표시. 트레이더 실제 의사결정에 필요한 **맥락 (percentile, venue split, divergence, regime)** 이 없음.
- 단일 지표 경쟁은 Glassnode/CryptoQuant 를 못 이긴다. **조합** 이 유일한 전략.
- 4 pillar 모두 무료 WS/API 로 집계 가능. 인프라만 필요.

## Scope

### Pillar 1 — Multi-Venue Liquidation Intelligence

**데이터 소스 (모두 무료):**

- Binance `wss://fstream.binance.com/ws/!forceOrder@arr`
- Bybit `wss://stream.bybit.com/v5/public/linear/liquidation.BTCUSDT`
- OKX `wss://ws.okx.com:8443/ws/v5/public/liquidation-orders`

**서버 집계 (engine/ingestion):**

```python
# 키: (symbol, venue, side, price_bucket, time_bucket)
# price_bucket = tick_size × 20  (symbol 별 동적)
# time_bucket = 15min
# storage: Redis ZSET, 7d rolling window
# 추가: hourly rollup for 90d archive
```

**시각화 (app):**

- Archetype C — price × time heatmap
- Component: `app/src/components/terminal/panes/LiqHeatmapPane.svelte`
- 렌더: LWC custom price-scale histogram with color intensity (USD 기준 log-scale)

**신규 building blocks:**

- `liq_magnet_above(bars, usd_threshold)` — 진입가 위 청산 클러스터 감지
- `liq_magnet_below(bars, usd_threshold)`
- `liq_cluster_density(price_window, usd_threshold)`
- `multi_venue_liq_cascade(venues, window)` — 거래소 간 연쇄 청산 감지

**Exit:**

- [ ] 3 venue WS ingestion 라이브
- [ ] `/api/engine/liq/heatmap?symbol=&tf=&window=` endpoint (price×time matrix JSON)
- [ ] `LiqHeatmapPane` 컴포넌트 `/cogochi` 및 `/terminal` 에 마운트
- [ ] 4 신규 block 엔진 + tests

### Pillar 2 — Deribit Options Regime Module

**데이터 소스:**

- Deribit WS `wss://www.deribit.com/ws/api/v2` — BTC-* / ETH-* 전 옵션 체인 (mark price, IV, OI, Greeks)

**서버 계산 (engine/options):**

- Greeks: Deribit 가 제공하는 IV 기반 BSM 재계산
- **GEX** = Σ(OI × gamma × spot²) / 100 (per strike, per expiry)
- **25d skew** = IV(25d put) − IV(25d call)
- **Put/Call ratio** = put_OI / call_OI
- **DVOL** = Deribit 공식 index 구독
- **Gamma flip level** = GEX sign change price

**시각화:**

- Archetype A (gauge) — Skew, P/C ratio, DVOL per percentile
- Archetype C 확장 — strike × expiry GEX heatmap
- **Gamma flip overlay** — main chart 에 수평선 (가격 자석)

**신규 building blocks:**

- `gamma_flip_proximity(distance_pct)` — 현재가가 gamma flip 근처
- `skew_extreme_fear(percentile)` / `skew_extreme_greed(percentile)`
- `put_call_ratio_extreme(percentile)`
- `dvol_spike(z_score)` — 내재변동성 급증

**Exit:**

- [ ] Deribit WS ingestion worker
- [ ] `/api/engine/options/regime?asset=BTC` endpoint
- [ ] `OptionsPane.svelte` — Skew curve + GEX by strike + Max Pain marker
- [ ] Gamma flip overlay on ChartBoard
- [ ] 4 신규 block + tests

### Pillar 3 — Venue Divergence Radar ⭐ 독점 기능

**데이터 소스:**

- Coinalyze (기존) — per-venue funding, OI, basis
- Binance / Bybit / OKX public REST — 즉시 OI snapshot
- Coinbase Pro — spot price, volume (premium 계산용)

**서버 계산:**

```python
# 거래소별 시계열을 1m 간격으로 동기화
# divergence detector: OI Δ 1h, funding Δ 1h, basis Δ 1h per venue
# 이상 탐지: venue A Δ > threshold AND venue B Δ < threshold/2
```

**시각화:**

- Archetype F — per-venue mini multi-line + divergence alert badge
- `VenueDivergenceStrip.svelte` — compact row in evidence panel
- Alert badge: "Bybit isolated OI pump +8% 1h"

**신규 building blocks (5):**

- `venue_oi_divergence_bull` / `_bear`
- `venue_funding_spread_extreme` — 거래소 간 funding 격차 z-score
- `isolated_venue_pump` — 한 거래소에 고립된 OI 스파이크
- `coinbase_premium_flip` (확장)
- `basis_divergence_cross_venue`

**Exit:**

- [ ] Coinalyze + Binance/Bybit/OKX/Coinbase 동기화 파이프라인
- [ ] `/api/engine/venue/divergence?symbol=` endpoint
- [ ] `VenueDivergenceStrip.svelte` 컴포넌트
- [ ] 5 신규 block + tests

### Pillar 4 — Exchange Netflow (via Arkham)

**데이터 소스:**

- Arkham Intelligence API (free tier) — 거래소 엔티티별 inflow/outflow 시계열

**서버 집계:**

- Arkham REST poll (5min interval) per exchange entity
- Redis: 24h rolling netflow, 30d percentile

**시각화:**

- Archetype A — percentile gauge
- Top-5 whale transfer feed (Arkham entity labels 포함)

**신규 building blocks (3):**

- `exchange_netflow_inflow_spike(percentile)` — 매도 압력 경고
- `exchange_netflow_outflow_persistent(bars, usd_threshold)` — hodl 지표
- `whale_transfer_to_exchange(usd_threshold)`

**Exit:**

- [ ] Arkham API provider (`engine/data_providers/arkham.py`)
- [ ] `/api/engine/netflow/exchange?exchange=binance` endpoint
- [ ] `NetflowGauge.svelte` + `WhaleTransferFeed.svelte`
- [ ] 3 신규 block + tests

### Confluence Engine (통합 레이어)

**목표:** 4 pillar 의 신호를 80+ building blocks 위에 합성하고, flywheel outcome 으로 가중치를 학습.

**엔진:**

```python
# engine/scoring/confluence.py
def compute_confluence_score(ctx: Context) -> ConfluenceResult:
    return (
        w1 * pattern_block_score(ctx)
      + w2 * liq_magnet_proximity_score(ctx)      # Pillar 1
      + w3 * gamma_alignment_score(ctx)           # Pillar 2
      + w4 * venue_divergence_severity(ctx)       # Pillar 3
      + w5 * netflow_direction_score(ctx)         # Pillar 4
    )
    # weights learned via Refinement API (flywheel axis 4)
```

**엔트리 통합:**

- `analyzeData.confluence` = `{score, contributors: [{pillar, magnitude, direction}]}`
- Verdict Inbox capture 에 confluence snapshot 저장 → outcome 학습 피드백

**Exit:**

- [ ] `engine/scoring/confluence.py` + tests
- [ ] analyze envelope 확장 — `confluence` 필드 추가
- [ ] Verdict Inbox entry 에 confluence snapshot 영속화
- [ ] Refinement API 에 weight 학습 경로 추가

## Non-Goals

- On-chain UTXO 사이클 지표 (SOPR, MVRV, NUPL) — Glassnode Advanced $39/월 구독으로 proxy (별도 work item).
- Nansen Smart Money 라벨 완전 재현 — Arkham free tier 로 커버리지 60% 만 시도.
- Options OTC / Bybit options — Deribit 단독 커버.
- Historical onchain tx 전수 ETL — 인프라 비용 큼, 비상목표.
- Multi-asset (알트코인) 확장 — Phase 1 은 BTC/ETH 만. BTCUSDT/ETHUSDT perp + BTC/ETH options.

## Facts

- Phase 1 기준으로 Venue Divergence, Liq clusters approximation, Options snapshot, Confluence Engine Phase 1 이 이미 live 다.
- `ConfluenceBanner` 와 6개 archetype renderer(A/B/C/D/E/F)는 현재 app surface에 연결되어 있다.
- Pillar 4 Netflow 와 engine-side weight learning 은 아직 미완이며 CURRENT 는 이 문서를 `Confluence Phase 2` 대기 상태로 표시한다.
- 이 work item은 app surface를 포함하지만, 미완 핵심은 scorer/weights/building blocks/ingestion 쪽 engine 책임이 더 크다.
- repo 안에는 이미 CoinMetrics, Fear & Greed, LunarCrush, Dune, DeFiLlama free clients 와 app-side `marketCapPlane` 가 존재하지만, 이번 slice 전까지 Solana/TRON/EVM user-key sources 를 하나의 canonical multichain route 로 정규화한 레이어는 없었다.
- app 쪽 `marketCapPlane` 는 존재하지만, engine fact plane 에는 아직 대응하는 `market-cap` bounded read model 이 없어 macro consumers 가 app producer 에 계속 묶여 있다.
- `/api/market/chain-intel` 는 이제 `solana`, `tron`, `evm(+chainid)` 를 canonical payload 로 내리며, TRON token lane 과 Ethereum account lane 은 live smoke 로 확인했다.
- live smoke 기준 provider coverage 는 mixed 다: TRONSCAN token lane 은 live, Etherscan V2 Ethereum account lane 은 live, Base account lane 은 free-tier blocked, Solscan lane 은 현재 사용자 key 로 401 blocked 다.
- Etherscan V2 는 공식 `chainlist` endpoint 로 supported chain registry 를 제공하므로, 수동 alias map 대신 runtime registry + static fallback 으로 chain resolution/search 를 통일할 수 있다.
- 2026-04-23 live smoke 기준 `/api/market/chains/search?q=world&family=evm` 는 `chainId=480` 을 반환했고, `/api/market/chain-intel?chain=world...` 는 더 이상 `unsupported_chain` 이 아니라 실제 World lane payload 를 반환했다.
- CoinGecko Onchain/GeckoTerminal 은 공식 `/onchain/networks`, `/onchain/networks/{network}/tokens/{address}`, `/tokens/{address}/pools`, `/pools/{pool}/trades` 경로를 제공하며, 여기서 쓰는 `network id` 는 Etherscan `chainid` 와 다르다.
- 2026-04-23 기준 curated reference sites 중 CoinGlass, Tokenomist, RootData, Arkham, MacroMicro 는 공식 API 문서가 존재하지만 인증 또는 유료 접근이 필요하고, fuckbtc.com / Airdrops.io 는 안정적인 공식 API surface 를 확인하지 못했다.
- `/api/market/reference-stack` 는 이제 curated 10개 사이트를 source order 그대로 집계하고, live fetch 가 가능한 lane 은 실제 payload 를 내려주며, key 부족 또는 API 부재 소스는 `blocked`/`reference_only` 로 명시한다.
- 이 lane 은 단순 운영자 UI 가 아니라 terminal AI / scan stack 이 공유할 canonical fact plane 이어야 하며, raw provider fan-out 은 이 레이어 뒤로 숨겨야 한다.

## Assumptions

- Phase 2 의 주 작업은 UI 신규 설계보다 engine scorer 와 flywheel weight learning 이다.
- Arkham key provision 전까지 Pillar 4 는 deferred 상태로 관리하는 편이 안전하다.

## Sequencing (6-week execution plan)

| Slice | Week | Pillar | 이유 |
|---|---|---|---|
| **W-0122-A** | W1 | Pillar 3 (Venue Divergence) | 이미 Coinalyze 데이터 있음 → 가장 빠른 승리, 독점 기능 조기 확보 |
| **W-0122-B1** | W2 | Pillar 1 Binance 단독 | 단일 거래소 liq heatmap → Coinglass 기본 기능 |
| **W-0122-B2** | W3 | Pillar 1 + Bybit + OKX | Coinglass 동급 달성 |
| **W-0122-C1** | W4 | Pillar 2 Deribit ingestion + Skew/PCR | Laevitas free tier 급 |
| **W-0122-C2** | W5 | Pillar 2 GEX + Gamma flip overlay | Laevitas 유료급 |
| **W-0122-D** | W6 | Pillar 4 Arkham + Confluence Engine | 4 pillar glue + 플라이휠 연결 |

각 slice 는 별도 branch + PR. ADR-007 WIP 규율 준수 (1 thread / 1 branch / 1 slice).

## Infrastructure Cost

| 항목 | 월 비용 |
|---|---|
| Binance WS × 3 symbols × 3 streams | $0 |
| Deribit WS × 2 symbols (BTC/ETH) | $0 |
| Bybit + OKX WS | $0 |
| Arkham Intelligence free tier | $0 |
| Coinalyze (기존) | 기존 유지 |
| CoinGecko / LunarCrush / GitHub | $0 |
| Redis storage (~500MB active keys) | $0 (Upstash free) or $10 |
| Cloud Run ingestion workers × 4 | $0 (GCP free tier) |
| **Total** | **$0 ~ $10/월** |

## Decisions

- **ChartBoard 단일 WS 오너 유지** — 모든 새 pane 은 pane-scoped DataFeed 서브클래스로 확장 (ADR-008 준수).
- **선언형 Indicator Registry** — 80+ 기존 blocks + 15 신규 blocks 를 `IndicatorDef` 메타데이터로 등록. UI 가 archetype 자동 렌더. 상세는 `docs/domains/indicator-registry.md`.
- **Confluence weights = flywheel 학습 대상** — Refinement API axis 4 확장.
- **BTC/ETH 만 Phase 1** — altcoin 확장은 Phase 2 로 분리.
- **운영자용 crypto reference sites 는 live fetcher 와 분리** — MacroMicro / fuckbtc / RootData / Tokenomist / Arkham Intel / Airdrops.io 같은 사이트는 우선 app-side reference catalog 로 관리하고, 안정 API 가 확인된 소스만 raw/live pipeline 으로 승격한다.
- **reference stack route 는 source capability 를 truth 로 노출** — 공개 API 또는 현재 런타임 key 가 있는 provider 만 `live`, 공식 API 부재/승인 대기 소스는 `blocked`/`reference_only` 로 내려 허위 가용성을 만들지 않는다.
- **X influencer metrics pack 은 W-0122 확장 범위** — 새 product surface 가 아니라, 기존 indicator stack 에 OnChain/DeFi/Sentiment family 를 편입하는 producer + registry + adapter 변경으로 처리한다.
- **기존 derivatives 지표는 재사용하고 중복 producer 는 만들지 않는다** — funding/OI/liquidation/options 는 유지, 이번 slice 는 MVRV/NUPL/TVL/social/fear-greed 같은 보강 지표만 추가한다.
- **API-key 의존 소스는 degraded provider state 로 노출** — LunarCrush/Dune 키가 없으면 실패 대신 `blocked` 상태로 내려 UI pipeline 은 shape 을 유지한다.
- **인플루언서 보고서는 숫자 payload 와 분리된 structured research layer 로 보존한다** — 2026-03~04 X 인플루언서 관찰치는 `report.metricLeaderboard / toolPackages / trendSummary` 로 묶고, 각 항목은 `indicatorId + payloadPath + provider state` 바인딩을 가진다.
- **intel-policy 는 influencer report 를 flow panel 에 흡수한다** — 새 panel 을 만들지 않고, 기존 `flow` evidence 카드 안에서 `daily stack / pipeline coverage` 형태로 소비해 decision engine 입력 경로를 유지한다.
- **새 public read-only route 는 hooks allowlist 에 함께 등록한다** — `/api/market/influencer-metrics`, `/api/terminal/intel-policy` 처럼 인증 없는 read path 는 `hooks.server.ts` `PUBLIC_API_PREFIXES` 에 포함되어야 실제 런타임 401 회귀를 피할 수 있다.
- **chain-intel 은 multichain canonical route 로 확장한다** — Solana 는 Solscan, TRON 은 TRONSCAN, EVM 은 Etherscan V2(`chainid`)를 provider 로 사용하되, 외부 payload 는 `/api/market/chain-intel` 에서만 `family + chain + chainId + entity + address + provider states + normalized summaries` 로 정규화한다.
- **사용자 제공 chain API keys 는 local-only runtime secret 으로 저장한다** — 실제 키는 `app/.env.local` 에만 저장하고, gittracked template 에는 변수명 계약만 남긴다.
- **TRON key 는 TRONSCAN 기준으로 취급한다** — 사용자 제공 UUID 키는 TronGrid 가 아니라 TRONSCAN API key 이므로 `TRONSCAN_API_KEY` 계약과 `apilist.tronscanapi.com` endpoint 로 재배선한다.
- **EVM chain snapshots 는 Etherscan V2 를 primary 로 사용한다** — account/token payload 는 `chainid` 기반 account/token/nametag endpoints 로 만들고, `getaddresstag`/`topholders` 같은 Pro-only lane 은 `blocked` or `planned` provider state 로 남긴다.
- **Etherscan V2 free-tier coverage 는 chain-dependent 로 취급한다** — Ethereum mainnet account lane 은 live 여도 Base/BSC/OP 같은 paid-tier chains 는 `blocked` provider state 로 degrade 하고, route 자체는 절대 500 으로 죽이지 않는다.
- **EVM chain resolution 은 official registry-driven 으로 전환한다** — `https://api.etherscan.io/v2/chainlist` 를 primary registry source 로 쓰고, docs 기준 static fallback snapshot 을 유지해 `/api/market/chain-intel` 해석과 별도 chain search endpoint 가 같은 canonical chain catalog 를 공유하게 만든다.
- **실제 사용 가능 여부는 docs table 보다 chainlist endpoint 를 우선한다** — supported-chains 문서와 live `chainlist` 가 어긋날 수 있으므로, query resolution/search/live routing 은 runtime `chainlist` 를 primary truth 로 보고 snapshot fallback 도 그 shape 를 따른다.
- **EVM token DEX plane 는 CoinGecko Onchain/GeckoTerminal 로 분리한다** — token identity/holders/supply 는 Etherscan V2, DEX liquidity/volume/top pools/recent trades 는 CoinGecko Onchain 으로 읽고, `chain-intel` payload 안에서 provider state 를 분리해 한 토큰의 정체성과 시장 미시구조를 함께 보여준다.
- **CoinGecko Onchain network resolution 은 별도 registry 로 처리한다** — `/onchain/networks` 가 주는 GeckoTerminal network id 를 primary 로 쓰고, Etherscan chain registry 와는 `slug/aliases/platform id/name` 기준으로 매칭한다. `chainid` 를 그대로 Onchain network 로 가정하지 않는다.
- **EVM token route 는 provider partial success 를 허용한다** — Etherscan lane 이 막혀도 CoinGecko Onchain DEX lane 이 live 면 payload 를 `partial/live` 로 반환하고, 반대로 DEX lane 이 막혀도 holders/supply/meta 는 유지한다. 둘 다 실패할 때만 blocked payload 로 내린다.
- **CoinGecko Onchain network join 은 `asset_platforms + /onchain/networks` 조합을 우선한다** — Etherscan `chainId` 를 CoinGecko asset platform `chain_identifier` 와 먼저 맞추고, 거기서 얻은 `asset_platform_id` 로 GeckoTerminal `network id` 를 해석한다. alias/name 매칭은 fallback 이다.
- **global market cap 도 단일 provider truth 를 버린다** — CoinGecko 는 하나의 source 로 강등하고, total cap / BTC dominance / stablecoin mcap 은 app-side `marketCapPlane` 이 합성한 canonical payload 를 통해서만 소비한다.
- **stablecoin mcap primary 는 DefiLlama 유지** — CoinGecko stablecoin market-cap 은 fallback 으로만 두고, SSR 는 DefiLlama stablecoin history + Binance daily close × CoinCap BTC supply 근사치를 우선 사용한다.
- **scanner macro consumers 도 marketCapPlane 으로 수렴한다** — `scanEngine` 뿐 아니라 `opportunityScanner` 와 그 downstream terminal surfaces 는 `btc dominance / stablecoin liquidity / total-cap breadth` 를 동일한 canonical macro truth 로 읽고, seed universe 는 CMC-only 가 아니라 free fallback 을 가져야 한다.
- **opportunity scan macro backdrop 은 이제 crypto-native breadth 를 포함한다** — `/api/terminal/opportunity-scan` 의 `macroBackdrop` 는 FRED-only 가 아니라 `marketCapPlane` 의 `marketCapChange24h / BTC.D change / stablecoin liquidity / confidence` 를 함께 내리고, `BTC/ETH` 온체인 스코어는 symbol별 CQ payload 를 분리해 읽는다.
- **W-0122 commit/merge 는 scoped branch 로 split 한다** — 현재 `codex/w-0139-terminal-core-loop-capture` worktree 에 unrelated W-0139/W-0143 changes 가 섞여 있으므로, W-0122 관련 파일만 dedicated branch/worktree 로 복사해 PR/merge 한다.
- **W-0122 는 terminal AI 의 fact-plane owner 다** — AI agent 와 scan/search 는 직접 CoinGecko/Dune/Etherscan/Solscan/TRONSCAN 을 부르지 않고, `/api/market/reference-stack`, `/api/market/chain-intel`, `/api/market/influencer-metrics`, `marketCapPlane` 같은 bounded read models 만 읽는다.
- **`engine/market_engine/indicator_catalog.py` 는 W-0122 소유다** — 이 파일은 `W-0148` architecture lane 이 아니라 fact-plane mainline 에서 inventory route 와 함께 가져간다.
- **market-cap cut 은 engine-preferred + app-fallback 으로 시작한다** — 현재 engine macro cache 는 `btc_dominance` 까지만 안정적으로 보장하므로, 첫 `GET /facts/market-cap` 는 partial truth 를 정직하게 내리고 `/api/market/macro-overview` 와 `/api/coingecko/global` 은 엔진 payload 가 충분하지 않을 때만 기존 app `marketCapPlane` 으로 떨어진다.
- **`/facts/reference-stack` 와 `/api/market/reference-stack` 는 아직 같은 계약이 아니다** — engine route 는 fact/provider coverage truth 이고, app public route 는 curated operator reference catalog 이다. public cutover 는 대체가 아니라 additive `factCoverage` adapter 로 시작한다.
- **consumer fact cuts stay mergeable by extraction if the working branch picks up unrelated commits** — 현재 `codex/w-0122-market-cap-fact-cut` history 에는 unrelated `W-0148` commit 이 섞여 있으므로, PR 전에는 W-0122 commits 만 clean execution branch/worktree 로 추출한다.
## Open Questions

1. **Arkham free tier rate limit** — 5min polling 이 sustainable? 필요 시 paid $$ 구독.
2. **Redis 용량** — 3 venue × 7d × 1m bucket 청산 스트림 실측 필요. overrun 시 rollup 정책.
3. **Deribit WS reconnect** — Binance DataFeed 와 동일 규율 적용 (ADR-008).
4. **Confluence weights 초기값** — heuristic vs 랜덤 → flywheel 학습에 맡김. 초기 heuristic 정책 문서 필요.

## Next Steps

1. `market-cap` fact route 와 macro consumers 를 더 묶어 `marketCapPlane` 을 app-owned producer 에서 ingress fallback 으로 강등한다.
2. merged `factCoverage` / confluence cuts를 바탕으로 다음 W-0122 consumer 를 canonical `/facts/*` contract 위로 올리되, app self-call 을 다시 열지 않는다.
3. 다음 engine slice 는 confluence scoring/read-model promotion 과 blocked provider matrix(Solscan, Etherscan paid-tier, Arkham) 정리를 한 merge unit으로 자른다.

## Related

- `docs/product/competitive-indicator-analysis-2026-04-21.md` — 경쟁 분석 근거
- `docs/domains/indicator-registry.md` — registry 도메인 모델
- `docs/decisions/ADR-008-chartboard-single-ws-ownership.md` — WS 규율
- `docs/product/flywheel-closure-design.md` — Confluence weight 학습 근거

## Exit Criteria

Phase 1 (this cycle — **3 of 4 pillars shipped**):
- [x] Pillar 3 Venue Divergence — API + UI + 3 blocks live
- [x] Pillar 1 Liq clusters — Phase-1 chart-feed approximation live
- [x] Pillar 2 Options — REST snapshot live (P/C, skew, ATM IV)
- [ ] Pillar 4 Netflow — deferred (Arkham API key)
- [x] Confluence Engine Phase 1 — scorer + aggregator + banner live, 14 tests pass
- [x] 6 archetype renderers (A/B/C/D/E/F) all wired
- [ ] analyze envelope に `confluence` 필드 추가 (Phase 2)
- [ ] engine-side scoring + Flywheel weight learning (Phase 2)

Phase 2 (future cycle):
- [ ] Pillar 1 real WS ingestion (Binance + Bybit + OKX forceOrder)
- [ ] Pillar 2 WS streaming + Greeks + GEX + gamma-flip overlay
- [ ] Pillar 4 Arkham Exchange Netflow
- [ ] 15 신규 building blocks 엔진 + tests (currently 3 of 15 shipped)
- [ ] Redis hit rate > 95%, P99 latency < 300ms
- [ ] 경쟁사 대비 스크린샷 대조: Coinglass / Laevitas / CryptoQuant

## Handoff Checklist

- active work item: `work/active/W-0122-free-indicator-stack.md`
- branch/worktree state: `codex/w-0122-market-cap-fact-cut`, clean after `e5f80a6a`
- verification status: app targeted `vitest` (`events`, `intel-policy`, `reference-stack`, `flow`, `macro-overview`, `coingecko/global`, `planeClients`) passed across the last slices; `npm --prefix app run check` = `0 errors`, pre-existing `111 warnings`.
- remaining blockers: Solscan key validity, Etherscan paid-tier chain coverage, Arkham direct API key, MacroMicro/CoinGlass/Tokenomist/RootData paid credentials, engine-side confluence scoring, flywheel weight learning, query-surface explicit scan contract, total-cap fallback design

## PR Trail

- #148 (Registry + Archetypes + Pillar 3 + Liq P1)
- #154 (Archetype B/D + venue tests)
- #156 (Real 30d rolling percentile)
- #157 (Slice F — SSR + RV Cone + Funding Flip)
- #159 (Confluence Engine Phase 1)
- #161 (Pillar 2 Options Phase 1)
- #225 (`ctx/fact` contract fill-in)
- #227 (indicator catalog alias cleanup + market-cap bridge consolidation)
- #234 (confluence direct-load legacy fallback cleanup)
- #236 (influencer metric fact coverage)
- #238 (confluence analyze direct-load)
