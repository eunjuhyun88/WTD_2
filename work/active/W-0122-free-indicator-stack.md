# W-0122 — Free Indicator Stack (4 Pillars + Confluence Engine)

## Status

`IN-FLIGHT — Phase 1 shipped, 6 of 7 confluence contributions live` — 2026-04-22

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

## Goal

무료 API 만으로 **$400/월 premium stack ($39 Glassnode + $99 Laevitas + $29 Coinglass + $150 Nansen) 의 70-80% 커버리지** 를 달성하고, 우리 80+ building blocks 및 flywheel 과 결합해 **경쟁사가 살 수 없는 독점 confluence** 를 생산한다.

## Owner

engine

## Canonical Files

- `work/active/W-0122-free-indicator-stack.md`
- `work/active/CURRENT.md`
- `docs/product/competitive-indicator-analysis-2026-04-21.md`
- `docs/domains/indicator-registry.md`
- `app/src/lib/indicators/adapter.ts`
- `app/src/routes/api/confluence/current/+server.ts`
- `engine/blocks/`

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

## Open Questions

1. **Arkham free tier rate limit** — 5min polling 이 sustainable? 필요 시 paid $$ 구독.
2. **Redis 용량** — 3 venue × 7d × 1m bucket 청산 스트림 실측 필요. overrun 시 rollup 정책.
3. **Deribit WS reconnect** — Binance DataFeed 와 동일 규율 적용 (ADR-008).
4. **Confluence weights 초기값** — heuristic vs 랜덤 → flywheel 학습에 맡김. 초기 heuristic 정책 문서 필요.

## Next Steps

1. Confluence Phase 2 범위를 `engine scorer + flywheel weights + capture snapshot persistence` 로 좁혀 별도 구현 lane 을 연다.
2. Arkham/API-key 의존성이 풀리기 전까지는 Pillar 4 를 backlog 로 유지하고 Phase 2 검증 입력을 scorer 측으로 집중한다.
3. 남은 building blocks 와 options/liquidation real-time ingestion 을 다음 wave 기준으로 다시 쪼갠다.

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
- branch/worktree state: CURRENT 기준 `IN-PROGRESS`; follow-up branch는 Phase 2 slice 별로 별도 생성
- verification status: shipped slices are recorded in `## Status` / `## PR Trail`; Phase 2 verification is still pending
- remaining blockers: Arkham key, engine-side confluence scoring, flywheel weight learning

## PR Trail

- #148 (Registry + Archetypes + Pillar 3 + Liq P1)
- #154 (Archetype B/D + venue tests)
- #156 (Real 30d rolling percentile)
- #157 (Slice F — SSR + RV Cone + Funding Flip)
- #159 (Confluence Engine Phase 1)
- #161 (Pillar 2 Options Phase 1)
