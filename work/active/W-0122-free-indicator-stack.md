# W-0122 — Free Indicator Stack (4 Pillars + Confluence Engine)

## Status

`DESIGN` — 2026-04-21

## Goal

무료 API 만으로 **$400/월 premium stack ($39 Glassnode + $99 Laevitas + $29 Coinglass + $150 Nansen) 의 70-80% 커버리지** 를 달성하고, 우리 80+ building blocks 및 flywheel 과 결합해 **경쟁사가 살 수 없는 독점 confluence** 를 생산한다.

## Owner

engine + app (cross-cutting)

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

## Related

- `docs/product/competitive-indicator-analysis-2026-04-21.md` — 경쟁 분석 근거
- `docs/domains/indicator-registry.md` — registry 도메인 모델
- `docs/decisions/ADR-008-chartboard-single-ws-ownership.md` — WS 규율
- `docs/product/flywheel-closure-design.md` — Confluence weight 학습 근거

## Exit Criteria

- [ ] 4 pillar 모두 production 라이브 (ingestion + API + UI pane)
- [ ] 15 신규 building blocks 엔진 + tests
- [ ] Confluence Engine 구현 + Verdict Inbox 연결
- [ ] analyze envelope 에 `confluence` 필드 추가
- [ ] 대시보드 성능: Redis hit rate > 95%, P99 latency < 300ms
- [ ] 경쟁사 대비 검증: Coinglass liq heatmap, Laevitas skew, CryptoQuant netflow 가 우리 UI 에서 **동등 이상** 표현되는지 스크린샷 대조
