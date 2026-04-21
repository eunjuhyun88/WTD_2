# Competitive Indicator Analysis — 2026-04-21

## Purpose

트레이딩 터미널 시장에서 **우리가 어디에 있고**, **어디에 틈이 있고**, **무엇을 free tier 로 건설해야 하는가** 를 CTO 관점에서 정리한다. 본 문서는 `work/active/W-0122-free-indicator-stack.md` 의 입력이다.

## TL;DR

1. 단일 지표 경쟁에서는 **Glassnode / CryptoQuant / Laevitas 를 이길 수 없다** — 그들은 인프라에 수년 투자했다.
2. 그러나 **지표 합성 (confluence) + 우리 80개 building blocks + flywheel outcome 학습** 의 교차점에서는 우리가 독점적이다.
3. 무료 API 만으로 **$400/월 premium stack 의 70-80% 커버리지** 를 확보할 수 있다. 필요한 것은 단지 집계 인프라이다.
4. **4개 무료 데이터 기둥 (Four Free Pillars)** 이 목표:
   - Pillar 1 — Multi-Venue Liquidation Intelligence (Coinglass 대체)
   - Pillar 2 — Deribit Options Regime (Laevitas 대체)
   - Pillar 3 — Venue Divergence Radar (**업계 독점**)
   - Pillar 4 — Exchange Netflow via Arkham (CryptoQuant 대체)

## Part 1 — 경쟁사 시그니처 지표 (요금 순)

| 서비스 | 가격대 (월) | 시그니처 지표 | 알파의 원천 | 우리 격차 |
|---|---|---|---|---|
| **Glassnode** | $39 ~ $799 | SOPR, MVRV Z-score, NUPL, LTH/STH supply, Realized Cap | Bitcoin UTXO 전수 파싱 | ❌ 구축 불가 (인프라) |
| **CryptoQuant** | $29 ~ $899 | Exchange Netflow, Miner Reserve, Coinbase Premium Gap, Stablecoin Supply Ratio | 거래소/마이너 지갑 라벨링 | 🟡 Coinbase Premium 이미 있음, Netflow 는 Arkham 대체 가능 |
| **Nansen** | $150 ~ $1,800 | Smart Money labels, Token God Mode, Wallet Profiler | 3M+ 월렛 수동 라벨 | 🟡 `smart_money_accumulation` 있음, 라벨 커버리지 열세 |
| **Laevitas / Velo** | $99 ~ $699 | Options Skew, GEX, Realized vol cone, Basis curve | Deribit/CME 실시간 집계 | ✅ Deribit WS 무료, 자체 구축 가능 |
| **Material Indicators** | $20 ~ $500 | FireCharts (depth heatmap), Whale Trades by size | Binance L2 depth 저장·정규화 | 🟡 depth stream 무료, 집계 인프라 필요 |
| **Coinglass** | $29 ~ $99 | Liquidation Heatmap, Option Max Pain, Long/Short Ratio | 다거래소 집계 | ✅ forceOrder WS 무료, 자체 구축 가능 |
| **IntoTheBlock** | $10 ~ $100 | In/Out of Money addresses, Large Tx alerts | onchain address cost-basis | ❌ 인프라 비용 큼 |
| **Santiment** | $49 ~ $499 | Dev Activity, Social Volume, Whale Holdings | GitHub + NLP 파이프라인 | 🟡 GitHub/LunarCrush free 로 대체 가능 |
| **Skew / Deribit DVOL** | free ~ $$ | DVOL index, P/C ratio, Term structure | Deribit 독점 시장 | ✅ Deribit 공식 API 무료 |
| **Arkham** | free + premium | Entity graph, Fund flow | onchain entity 수동 라벨 | ✅ free tier 사용 가능 |

## Part 2 — 지표별 알파 기여도 Top 20

### Tier 1 — 실거래 알파, 자체 구축 ROI 높음

| # | 지표 | 소스 | 왜 알파 | 제작 비용 | 우리 상태 |
|---|---|---|---|---|---|
| 1 | **Exchange Netflow** | Arkham free | 거래소 입금 → 매도 압력 선행 | 2-3일 | ❌ 누락 |
| 2 | **SOPR** | Glassnode | 매도자 평균 수익률 → 손절 항복 감지 | 불가 | 🟡 Glassnode $39/월로 proxy |
| 3 | **Coinbase Premium Gap** | CryptoQuant | 미국 기관 매수세 | 1일 | ✅ `coinbase_premium_*` blocks |
| 4 | **Stablecoin Supply Ratio** | CoinGecko/DefiLlama free | 대기 자금 지표 | 1일 | ❌ 누락 |
| 5 | **Smart Money 주소 플로우** | Nansen / Arkham free | 실적 좋은 월렛 포지션 | 1주 | 🟡 부분 구축 |
| 6 | **Options GEX** | Deribit free | MM 감마 포지션 = 가격 자석 | 3-5일 | ❌ 누락 |
| 7 | **Funding Arbitrage Spread** | Coinalyze | 거래소 간 레버리지 쏠림 | 1일 (데이터 있음) | 🟡 데이터만 있음, divergence detector 없음 |
| 8 | **Liquidation Heatmap** (price×time) | Binance/Bybit/OKX forceOrder WS | 청산 자석 구간 시각화 | 5-7일 | ❌ 누락 |
| 9 | **L2 Depth Heatmap** (FireCharts) | Binance depth@100ms WS | 벽/spoofing 실시간 | 1-2주 | ❌ 누락 |
| 10 | **CVD by Order Size** | Binance aggTrades WS | 고래 vs 소매 divergence | 1-2주 | ❌ 누락 |

### Tier 2 — 맥락 지표, 단독으론 약하지만 조합 시 가치

| # | 지표 | 소스 | 제작 |
|---|---|---|---|
| 11 | MVRV Z-score | Glassnode | $39/월 구독 |
| 12 | Puell Multiple | CryptoQuant | $39/월 구독 |
| 13 | LTH/STH Supply | Glassnode | 구독 |
| 14 | NUPL | Glassnode | 구독 |
| 15 | **Options Skew (25d P/C)** | Deribit free | 자체 구축 (Pillar 2) |
| 16 | **Put/Call Ratio** | Deribit free | 자체 구축 (Pillar 2) |
| 17 | Realized Volatility Cone | 자체 (klines) | 1일 |
| 18 | Dev Activity (GitHub) | GitHub API free | 1일 |
| 19 | Social Dominance | LunarCrush free | 2일 |
| 20 | Exchange Whale Ratio | CryptoQuant | Arkham 대체 가능 |

## Part 3 — 우리 현재 자산

### ✅ 이미 확보 (경쟁사 매칭)

- **Coinbase Premium** (T1 #3)
- **Funding per-exchange** (T1 #7) — Coinalyze
- **OI per-exchange** — `oi_exchange_divergence` block
- **Smart money accumulation** — `smart_money_accumulation.py`
- **CVD / Delta flip**
- **Funding flip**
- **COT (CFTC)** — 경쟁사 **누구도** 이걸 제공하지 않음, 정부 데이터 고유 자산
- **Whale accumulation** (WHALE pattern)

### 🕳 큰 구멍

- **Exchange Netflow** (T1 #1) — P0
- **Stablecoin Supply Ratio** (T1 #4) — P0
- **Liquidation Heatmap** (T1 #8) — P1
- **Options GEX / Skew / P/C** (T1 #6, T2 #15-16) — P1
- **L2 Depth Heatmap** (T1 #9) — P2
- **CVD stratified by size** (T1 #10) — P2
- **SOPR / MVRV cycle metrics** (T2 #11-14) — 구독 or skip

## Part 4 — 무료 대체 레시피

### R1 — Exchange Netflow (CryptoQuant 대체)

- Arkham Intelligence API free tier: 거래소 엔티티별 inflow/outflow 시계열 가능
- 대체 정확도: CryptoQuant 대비 약 90%

### R2 — Liquidation Heatmap (Coinglass 대체)

- Binance `!forceOrder@arr` + Bybit `liquidation.BTCUSDT` + OKX `liquidation-orders` WS
- 서버: `(price_bucket, time_bucket, side, venue)` 집계, Redis 7d rolling
- 시각화: LWC HistogramSeries + color intensity
- 대체 정확도: 3-venue 합치면 Coinglass 동급

### R3 — Options GEX / Skew (Laevitas 대체)

- Deribit WS — BTC/ETH full chain, IV 제공
- 서버: BSM 기반 Greeks → GEX = Σ(OI × gamma × spot²) / 100
- 추가 지표: 25d skew (IV_25put − IV_25call), P/C ratio, DVOL
- 대체 정확도: Laevitas 와 **동일 원천** → 동급

### R4 — Smart Money (Nansen 대체)

- Arkham free + Etherscan free + custom 성능 가중 월렛 리스트
- 대체 정확도: ~60% (라벨 커버리지 열세)

### R5 — L2 Depth Heatmap (Material 대체)

- Binance `depth@100ms`
- 서버: 5-level price-bucket snapshot Redis 7d rolling
- 벽 감지: stdev > threshold per price level
- 대체 정확도: 단일 거래소 한정 시 Material FireCharts 와 동급

### R6 — SOPR / MVRV (Glassnode 대체 불가)

- UTXO 전수 파싱 필요. Bitcoin full node + 수개월 ETL.
- **대안:** Glassnode Studio free tier iframe 임베드 또는 Advanced 구독 $39/월.

## Part 5 — 전략 판단

### 자체 구축 (인프라만, $0)

- Liquidation Heatmap
- Options Regime (Deribit)
- L2 Depth Heatmap
- CVD by size
- Exchange Netflow (via Arkham)

### 무료 API 집계 ($0)

- Stablecoin Supply Ratio
- Put/Call Ratio
- Social Volume (LunarCrush)
- Dev Activity (GitHub)

### 저렴 유료 구독 ($39/월)

- Glassnode Advanced — SOPR, MVRV, NUPL 등 사이클 지표 API proxy

### 비싼 후순위

- Nansen ($150+) — 1년 후 사용자 증가 시 재검토

### 포기

- Puell Multiple, NUPL, HODL waves 등 대부분의 사이클 지표 — 단타 터미널엔 오버킬

## Part 6 — 우리만의 독점 무기 (돈으로 살 수 없는 것)

1. **Venue Divergence Radar (Pillar 3)** — 거래소 간 OI/funding/CVD divergence 를 우리 building block 엔진이 실시간 감지. **경쟁사 누구도 안 함** (그들은 거래소별 raw 데이터만 제공).
2. **Confluence Engine** — 80+ building blocks × 4 Pillars × flywheel 학습 가중치. 경쟁사는 대시보드이지 엔진이 아니다.
3. **CFTC COT 주간 레이어** — Laevitas/Velo 도 안 주는 정부 데이터. 기관 포지셔닝 고유 시그널.
4. **Flywheel Outcome 학습** — Verdict Inbox + Refinement API 로 지표 가중치가 자가학습. 경쟁사 상품은 정적이다.

## Part 7 — 경쟁사 대비 위치 요약

| 상대 | 우리 우위 | 우리 열세 |
|---|---|---|
| Coinglass | + Options + Venue Divergence + Pattern Engine + COT | — |
| Laevitas | + Liq + Spot Netflow + COT + Pattern Engine | 일부 고급 옵션 지표 |
| CryptoQuant | + Options + Liq + Deep Venue + 계산 유연성 | 온체인 사이클 depth |
| Glassnode | 거래 타이밍 전방위 우위 | 온체인 사이클 지표 ($39 proxy 권장) |
| Nansen | 거래 타이밍 맥락 | Smart Money 라벨 커버리지 |

## Part 8 — 구축 우선순위 (6주 로드맵 요약)

자세한 시퀀싱은 `work/active/W-0122-free-indicator-stack.md` 참조.

| Week | Pillar | 목표 |
|---|---|---|
| W1 | **Pillar 3** Venue Divergence Radar | 이미 있는 데이터 활용, 1주 내 완성, **독점 기능 조기 확보** |
| W2-3 | **Pillar 1** Multi-Venue Liq Heatmap | Coinglass 동급 |
| W4-5 | **Pillar 2** Deribit Options Module | Laevitas 무료급 → 유료급 |
| W6 | **Pillar 4** + Confluence Engine | Arkham 통합 + 4 pillar glue |

## References

- `work/active/W-0122-free-indicator-stack.md` — 실행 work item
- `docs/domains/indicator-registry.md` — indicator 선언형 registry 도메인 모델
- `docs/decisions/ADR-008-chartboard-single-ws-ownership.md` — WS 규율
