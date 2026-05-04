# W-0415 — Pre-pump Evidence Engine (BigQuery 기반 80-signal forensics)

## Status
- Owner: TBD
- Phase: 설계 완료, 구현 대기
- Priority: P1 (W-0414 메타룰 prior data source)
- Created: 2026-05-05
- Depends on: 기존 GCP 프로젝트 (Cloud Run `wtd-2-3u7pi6ndna-uk.a.run.app`) + Supabase
- Related: W-0414 §J Bayesian bucket attribution (prior 데이터 공급)

## Goal

24h 급등 코인을 사후 분석 (forensic) 하여 **"왜 오를 수밖에 없었는지"** 객관적 증거를 추출.
조기 매수자가 보았던 신호를 10개 카테고리 ~80개로 정량화 → composite score → W-0414 메타룰 prior.

## Why

User 핵심 질문: "이게 왜 오를수밖에없는 상태였나를 분석해서 사람들은 그걸 미리사거나한단말야 그런걸 근거를 찾아야해."

- 24h 급등 (Binance Rankings: TST +73%, GIGGLE +20% 등) 은 결과 — 원인은 24~72시간 전 신호에 있다
- 단일 신호는 noise — **confluence (≥3 카테고리 동시 양성)** 가 진짜 신호
- Glassnode/Nansen 유료 ($150~$500/월) → **Google BigQuery public datasets 무료 tier 95% 커버**

## Non-Goals

- 실시간 (sub-second) 트레이딩 신호 — 6h cron 으로 충분
- L2 orderbook 재구성 (W-0414 별도)
- ML 예측 모델 학습 — 이번엔 evidence aggregation 만, prediction 은 W-0414 메타룰 담당
- 한국 거래소 (Upbit/Bithumb) on-chain — Binance/CEX flow 만 1차

## A. 10 Evidence Categories (~80 signals)

| # | 카테고리 | Signal 수 | 핵심 근거 | 데이터 소스 |
|---|----------|----------|----------|------------|
| 1 | Technical compression | 15 | BB squeeze, volatility coil, MA confluence, RSI hidden div | Binance kline (자체) |
| 2 | Volume / order flow | 10 | OBV divergence, CVD slope, taker-buy ratio, Kyle λ | Binance trade tape |
| 3 | Derivatives positioning | 12 | Funding rate cluster, OI/MCAP, long/short skew, basis | Binance/Bybit funding API |
| 4 | Volatility regime | 6 | RV/IV gap, ATR contraction, HV percentile | Binance kline |
| 5 | Microstructure | 5 | VPIN, spread compression, depth skew | Binance L2 snapshot |
| 6 | **On-chain** | 12 | Whale concentration, exchange in/outflow, CDD, MVRV, new addrs | **BigQuery** ⭐ |
| 7 | Tokenomics | 6 | Unlock schedule, vesting cliff, supply velocity | CoinGecko + 자체 |
| 8 | Catalyst | 6 | Listing rumor, partnership leak, mainnet date | News API + Twitter |
| 9 | Attention | 5 | Twitter mention velocity, Google Trends, TG members | LunarCrush 무료 + 자체 |
| 10 | Macro / sector | 8 | BTC dominance, sector rotation, DXY, ETH/BTC | Binance + FRED |

**Total**: ~80 signals, 가중평균 + confluence multiplier (≥3 카테고리 ≥70 → 1.1x~1.2x bonus)

## B. BigQuery Architecture (자체 indexer 불필요)

### B.1 사용 dataset (모두 무료 public)

| Dataset | 커버 |
|---------|------|
| `bigquery-public-data.crypto_ethereum.*` | ETH + 모든 ERC20 (15분 latency) |
| `bigquery-public-data.crypto_bitcoin.*` | BTC |
| `goog_blockchain_polygon_mainnet_us.*` | Polygon |
| `goog_blockchain_arbitrum_one_us.*` | Arbitrum |
| `goog_blockchain_optimism_mainnet_us.*` | Optimism |
| `goog_blockchain_base_mainnet_us.*` | Base |
| `goog_blockchain_bsc_mainnet_us.*` | BSC |

### B.2 Free tier 적합성

- 1TB query/month 무료 (이후 $5/TB)
- 24h result cache (동일 query 재실행 무료)
- Top 500 토큰 × 6 카테고리 SQL × 6h cron = 월 24~150GB scan 추정 → **무료 tier 내**

### B.3 Pipeline

```
BigQuery (raw) → engine/onchain/bq_client.py (6 SQL) → Supabase onchain_metrics_daily (cache, ~5GB/year)
                                                    → /api/onchain/* (read)
                                                    → /patterns evidence panel
                                                    → W-0414 prior data source
```

## C. 6 핵심 SQL Query (Phase 1)

| # | Query | 출력 |
|---|-------|------|
| C1 | Whale concentration (Top 10 holders %) | `whale_pct_top10` |
| C2 | Exchange in/outflow (24h, 7d) | `cex_inflow_usd`, `cex_outflow_usd`, `net_flow_usd` |
| C3 | Coin Days Destroyed (CDD) | `cdd_24h`, `cdd_7d_zscore` |
| C4 | MVRV ratio (proxy via on-chain age) | `mvrv_proxy` |
| C5 | Smart money PnL leaderboard (6m) | `smart_money_addrs[]`, `smart_money_buy_score` |
| C6 | New address growth (24h, 7d) | `new_addrs_24h`, `growth_pct` |

## D. Decisions (12)

| # | 항목 | 옵션 | 권장 | 상태 |
|---|------|------|------|------|
| D1 | 데이터 layer | (a) 자체 RPC indexer (b) Glassnode (c) **BigQuery public** | **(c)** | ✅ |
| D2 | Cron 주기 | (a) 1h (b) **6h** (c) 24h | **(b)** | ✅ |
| D3 | 토큰 universe | (a) Top 100 (b) **Top 500** (c) 전체 | **(b)** | ✅ |
| D4 | Smart money 정의 | (a) Nansen 라벨 ($) (b) **자체 PnL leaderboard** (c) 미사용 | **(b)** | ✅ |
| D5 | Composite score 가중치 | (a) 균등 (b) 카테고리별 prior (c) **W-0414 Bayesian posterior** | **(c)** | ✅ |
| D6 | Confluence 정의 | (a) ≥2 카테고리 (b) **≥3 카테고리 ≥70** (c) ≥5 | **(b)** | ✅ |
| D7 | Cache TTL | (a) 1h (b) **6h** (c) 24h | **(b)** | Cron 주기와 일치 |
| D8 | Catalyst 데이터 | (a) Twitter API ($100/월) (b) **CryptoPanic 무료** (c) 미수집 | **(b)** | 1차 |
| D9 | Attention 데이터 | (a) LunarCrush Pro (b) **무료 tier + Google Trends** (c) 미수집 | **(b)** | |
| D10 | Backfill 기간 | (a) 30d (b) **90d** (c) 1y | **(b)** | W-0414 prior 학습용 |
| D11 | Failure 정책 | (a) skip silently (b) **stale cache + alert** (c) hard fail | **(b)** | |
| D12 | UI surface | (a) /patterns inline (b) **/patterns/forensic 탭** (c) modal only | **(b)** | |

## E. PR 분할 (5 PR)

| PR | 범위 | LOC 추정 |
|----|------|---------|
| PR1 | BQ client + 6 SQL + Supabase migration `onchain_metrics_daily` | ~600 |
| PR2 | Vercel Cron 6h + backfill script (90d) | ~300 |
| PR3 | Composite scoring + W-0414 bucket prior wiring | ~400 |
| PR4 | `/api/onchain/{token}` + `/api/forensic/{token}` endpoints | ~300 |
| PR5 | `/patterns/forensic/[token]` UI + 10-category evidence panel | ~700 |

## F. AC (Exit Criteria)

| AC | 검증 |
|----|------|
| AC1 | 6 SQL 정확도: 알려진 whale concentration (e.g. PEPE top10 = 35±5%) 와 ±10% 일치 |
| AC2 | BQ scan 비용 < $25/월 (free tier 초과 시 alert) |
| AC3 | 24h 급등 Top 20 코인 backtest: composite ≥70 → ≥60% precision (90d window) |
| AC4 | Cron 6h 안정성: 30d 연속 운영 시 fail rate < 5% |
| AC5 | `/patterns/forensic/[token]` LCP < 2.5s (Supabase cache hit) |
| AC6 | W-0414 메타룰 bucket prior 입력 정합 (smart_money_buy_score → bayesian update) |
| AC7 | Confluence detection: backtest 30d 동안 ≥3 카테고리 ≥70 발생 코인 list 와 실제 +20% 이상 24h 급등 코인 overlap ≥40% |

## G. 위험

| Risk | 완화 |
|------|------|
| BigQuery 1TB free tier 초과 | partition pruning + clustering, query monitor + alert at 80% |
| Public dataset 15분 지연 | acceptable (forensic, not real-time); 실시간 필요 시 별도 RPC fallback |
| Smart money PnL leaderboard 정확도 | W-0414 Bayesian update 로 drift 보정; 90d 재학습 |
| Catalyst noise (CryptoPanic spam) | source whitelist (Tier-1 outlets) + dedup |
| L2 chain indexing gap | Polygon/Arbitrum/Optimism/Base/BSC 모두 google_blockchain dataset 존재 — 격차 미미 |

## M. Implementation Cookbook (구체적 "어떻게 찾는가")

각 signal 의 데이터 소스 + 계산식 + 임계값 + 사전 신호 (pre-pump leading indicator) 를 명시.
모든 SQL 은 `block_timestamp` partition 필터 필수 (BQ 비용 90% 절감).

### M.1 Technical Compression (15) — 자체 Binance kline

| Signal | 계산식 | Pre-pump 임계 |
|--------|--------|---------------|
| BB squeeze | `(BB_upper - BB_lower) / SMA20 < 6m percentile 10` | 압축 5+ 캔들 지속 |
| Keltner squeeze | `BB ⊂ Keltner` (TTM Squeeze) | active 3+ 캔들 |
| Volatility coil | `ATR_14 / ATR_50 < 0.6` | 7일 연속 |
| MA confluence | EMA20/50/100/200 spread `< 2% of price` | cluster 3+ MA |
| RSI hidden bull div | price HL + RSI LL (uptrend pullback) | 1d/4h timeframe |
| MACD compression | hist abs `< 0.5% of price` for 5+ bars | crossover 임박 |
| Wyckoff accumulation | spring + test on declining vol | volume profile valley |
| Fibonacci confluence | 0.618 / 0.5 / 0.382 ±0.5% 겹침 | static + dynamic level |
| Volume profile POC test | price retest POC on low vol | reaction wick |
| Range contraction (NR7) | 7일 중 최저 range | breakout 통계 65% |
| Ichimoku Kumo twist | 미래 cloud flip up | 5+ days lookahead |
| Heikin Ashi flat | doji body 3+ consecutive | trend reset |
| ADX < 20 | trend exhaustion | DI+/- crossover 임박 |
| Donchian midline test | midline support hold | breakout setup |
| Pivot S1/R1 reclaim | session pivot reclaim with vol | intraday |

### M.2 Volume / Order Flow (10) — Binance trade tape

| Signal | 계산식 |
|--------|--------|
| OBV bull div | OBV HH while price LL |
| CVD slope | cumulative `(buy_vol - sell_vol)`, slope > 0 on consolidation |
| Taker buy ratio | `taker_buy / total > 0.55` rolling 4h |
| Kyle's λ | `\|Δprice\| / signed_volume`, low λ = high liquidity / smart accumulation |
| Volume z-score | `(vol - μ_30d) / σ_30d > 2` on no-news |
| Iceberg detection | repeated same-size limits at level (L2 snapshots) |
| Absorption | large taker hits but price stationary |
| Dark pool proxy | (CEX vs total reported volume) gap |
| Buy/sell delta divergence | delta vs price divergence |
| VWAP reversion | price < VWAP - 1σ then reclaim |

### M.3 Derivatives Positioning (12) — Binance/Bybit funding API

| Signal | 임계 |
|--------|------|
| Funding negative cluster | 8h funding < -0.01% for 3+ periods (shorts crowded) |
| Funding spike | abs(funding) > 99th percentile |
| OI / MCAP | OI/MCAP > 0.1 (high leverage, squeeze risk) |
| OI 24h Δ | OI ↑20% while price flat (positioning build) |
| Long/short ratio skew | top trader L/S < 0.7 (contrarian bull) |
| Basis (perp - spot) | basis < 0 with spot bid (backwardation = bullish) |
| Liquidation map cluster | $X above price = magnet for squeeze |
| Open Interest weighted funding | OI-weighted funding < -0.005% |
| Term structure | quarterly futures contango steepening |
| Options put/call ratio | P/C > 1.2 (bearish crowded → contra) |
| Options skew | 25Δ put IV - 25Δ call IV elevated → reversal |
| Gamma exposure | dealer short gamma below price = sqz fuel |

### M.4 Volatility Regime (6)

| Signal | 계산 |
|--------|------|
| RV/IV gap | realized vol < implied vol → vol-of-vol expansion 임박 |
| ATR contraction | ATR_14 / 90d percentile < 20 |
| HV percentile | 30d HV < 6m percentile 10 |
| Vol risk premium | IV - RV mean-reverts; extreme = signal |
| Skew normalization | risk reversal → 0 from negative |
| Vol cone | current IV vs historical IV cone |

### M.5 Microstructure (5) — Binance L2 snapshot 수집

| Signal | 계산 |
|--------|------|
| VPIN | `\|buy - sell\| / total` rolling buckets, > 0.4 = toxic flow |
| Spread compression | bid-ask / mid < 6m percentile 10 |
| Depth skew | (bid_depth_1% - ask_depth_1%) / total > 0.3 |
| Order book imbalance | top 10 levels imbalance > 0.5 |
| Quote stuffing | `cancel_rate / new_order_rate > 5` (manipulation) |

### M.6 On-chain (12) — BigQuery ⭐

#### C1. Whale concentration (Top 10 holders %)
```sql
WITH latest_balances AS (
  SELECT address, SUM(CAST(value AS NUMERIC) *
    CASE WHEN to_address = address THEN 1 ELSE -1 END) AS balance
  FROM `bigquery-public-data.crypto_ethereum.token_transfers`
  WHERE token_address = @token
    AND block_timestamp BETWEEN TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
                            AND CURRENT_TIMESTAMP()
  GROUP BY address
)
SELECT SUM(balance) / (SELECT SUM(balance) FROM latest_balances) AS top10_pct
FROM (SELECT balance FROM latest_balances ORDER BY balance DESC LIMIT 10);
```
**Pre-pump**: top10_pct ↑ 5%p over 7d on flat price = accumulation.

#### C2. Exchange in/outflow
```sql
-- Pre-loaded CEX wallet list (Etherscan tags)
WITH cex_addrs AS (SELECT address FROM `project.lookup.cex_wallets`)
SELECT
  SUM(CASE WHEN to_address IN (SELECT * FROM cex_addrs) THEN value END) AS inflow,
  SUM(CASE WHEN from_address IN (SELECT * FROM cex_addrs) THEN value END) AS outflow
FROM `bigquery-public-data.crypto_ethereum.token_transfers`
WHERE token_address = @token
  AND block_timestamp BETWEEN @start AND @end;
```
**Pre-pump**: net outflow > 7d avg × 2 (supply shock).

#### C3. CDD (BTC)
```sql
SELECT SUM(value * DATE_DIFF(spent_date, created_date, DAY)) AS cdd
FROM `bigquery-public-data.crypto_bitcoin.outputs`
WHERE spent_date BETWEEN @start AND @end;
```
**Pre-pump**: CDD z-score < -1 (long-term holders not selling).

#### C4. MVRV proxy
```sql
-- Cost basis = avg price at last balance change
-- Market value = current price × balance
SELECT (market_cap - realized_cap) / realized_cap AS mvrv
FROM token_aggregates WHERE token = @token;
```
**Pre-pump**: MVRV < 1 (undervalued vs cost basis).

#### C5. Smart money PnL leaderboard
```sql
WITH wallet_trades AS (
  SELECT t.from_address AS wallet, t.token_address,
         t.value, p.price_usd, t.block_timestamp,
         CASE WHEN t.from_address = wallet THEN 'sell' ELSE 'buy' END AS side
  FROM `bigquery-public-data.crypto_ethereum.token_transfers` t
  JOIN `project.prices.daily` p
    ON t.token_address = p.token AND DATE(t.block_timestamp) = p.date
  WHERE block_timestamp >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 180 DAY)
),
pnl AS (
  SELECT wallet,
    SUM(CASE WHEN side='sell' THEN value*price_usd ELSE -value*price_usd END) AS realized
  FROM wallet_trades GROUP BY wallet
)
SELECT wallet, realized,
       PERCENT_RANK() OVER (ORDER BY realized) AS rank
FROM pnl
QUALIFY rank > 0.99;  -- top 1%
```
**Pre-pump**: target token 의 24h 매수자 중 smart money overlap > 20%.

#### C6. New address growth
```sql
SELECT COUNT(DISTINCT to_address) AS new_addrs
FROM `bigquery-public-data.crypto_ethereum.token_transfers`
WHERE token_address = @token
  AND to_address NOT IN (
    SELECT DISTINCT to_address
    FROM `bigquery-public-data.crypto_ethereum.token_transfers`
    WHERE token_address = @token AND block_timestamp < @start
  )
  AND block_timestamp BETWEEN @start AND @end;
```
**Pre-pump**: new_addrs 24h 성장률 > 7d avg × 1.5.

#### Additional 6 (구현 후순위)
- C7. HODL waves (BTC UTXO age distribution)
- C8. SOPR (spent output profit ratio)
- C9. Stablecoin supply ratio (USDT/USDC inflow to CEX)
- C10. Bridge net flow (L1 ↔ L2)
- C11. DEX/CEX volume ratio
- C12. Active address velocity

### M.7 Tokenomics (6)

| Signal | 소스 | 계산 |
|--------|------|------|
| Unlock cliff (≤30d) | TokenUnlocks.app 무료 + on-chain vesting contracts | 30일 내 unlock < 5% supply 면 ✓ |
| Vesting velocity | 컨트랙트 Transfer 이벤트 | 잔여 vest 양 |
| Supply velocity | tx volume / supply | 회전율 가속 |
| Burn rate | burn address 누적 수신 | deflationary pressure |
| Inflation rate | mint/issuance 이벤트 | 신규 발행 속도 |
| Treasury ratio | DAO multisig holdings / total | governance overhang |

### M.8 Catalyst (6) — CryptoPanic 무료 + 자체 keyword filter

| Signal | 검출 |
|--------|------|
| Listing rumor (Tier-1 CEX) | "Coinbase listing", "Binance listing" keyword + source whitelist |
| Partnership leak | "partnership", "integration" + named entity |
| Mainnet/upgrade date | github release notes scrape + roadmap |
| Token economic change | governance forum post (Snapshot/Tally API) |
| Funding round | Crunchbase + The Block scrape |
| Regulatory decision | SEC/MAS/FSA filing scrape |

### M.9 Attention (5) — 무료 tier

| Signal | 소스 |
|--------|------|
| Twitter mention velocity | LunarCrush 무료 + Twitter API basic |
| Google Trends spike | Google Trends API (pytrends) |
| Telegram member growth | TG official bot member count |
| Discord active users | scrape if public |
| GitHub commit velocity | gh API (already accessible) |

### M.10 Macro / Sector (8)

| Signal | 소스 |
|--------|------|
| BTC dominance | Binance kline + market cap aggregator |
| ETH/BTC ratio | Binance |
| Sector rotation index | DefiLlama TVL by category |
| DXY (USD index) | FRED API 무료 |
| 10y treasury yield | FRED |
| Fed funds rate | FRED |
| Stablecoin total supply | DefiLlama 무료 |
| BTC/SPX correlation | rolling 30d corr |

### M.11 Composite Scoring

```python
def composite_score(signals: dict[str, float]) -> tuple[float, float]:
    """Returns (raw_score, adjusted_score) ∈ [0, 100]."""
    cat_scores = {cat: weighted_avg(sigs) for cat, sigs in signals.items()}
    raw = sum(cat_scores.values()) / 10  # 10 categories

    # W-0414 Bayesian posterior weights (per category)
    weights = bayesian_bucket_posterior()
    weighted = sum(cat_scores[c] * weights[c] for c in cat_scores)

    # Confluence bonus
    high_cats = sum(1 for s in cat_scores.values() if s >= 70)
    multiplier = 1.0
    if high_cats >= 3: multiplier = 1.1
    if high_cats >= 5: multiplier = 1.2

    return raw, min(weighted * multiplier, 100)
```

### M.12 Backtest 검증 protocol

1. 24h gainer Top 50 list (지난 90일 매일) 추출 → label = 1
2. 동일 기간 random sample (시총 매칭) → label = 0
3. T-24h 시점에 80 signal 계산 → composite score
4. ROC AUC + precision@top-K 측정
5. AC7 검증: confluence ≥3 카테고리 ≥70 → 실제 +20% 24h pump precision ≥40%

---

## H. References

- BigQuery public crypto: https://console.cloud.google.com/marketplace/product/bigquery-public-data/crypto-ethereum
- Google Cloud blockchain datasets: https://cloud.google.com/blog/products/data-analytics/expanding-blockchain-data-access
- Kyle (1985) "Continuous Auctions and Insider Trading"
- Easley, López de Prado, O'Hara (2012) "Flow Toxicity and Liquidity in a High-frequency World" (VPIN)
- MacKinlay (1997) "Event Studies in Economics and Finance"
- Cont (2014) "The Price Impact of Order Book Events"
- W-0414 §J Bayesian bucket attribution

## I. 다음 단계

1. GCP 프로젝트에서 BigQuery API enable + service account 생성 → Cloud Run 동일 SA 재사용
2. PR1 시작 — `engine/onchain/bq_client.py` 6 SQL 1주
3. PR2 backfill 90d → Supabase
4. PR3 W-0414 wiring → 메타룰 prior
5. PR4 + PR5 UI 노출

---

## Goal
위 §Goal 본문 참조.

## Owner
위 §Status Owner 필드 참조.

## Scope
위 §A 카테고리 + §C SQL + §E PR 본문 참조.

## Non-Goals
위 §Non-Goals 본문 참조.

## Canonical Files
- `engine/onchain/bq_client.py` (신규)
- `engine/onchain/composite.py` (신규)
- `app/supabase/migrations/NNN_onchain_metrics_daily.sql` (신규)
- `app/src/routes/api/onchain/[token]/+server.ts` (신규)
- `app/src/routes/patterns/forensic/[token]/+page.svelte` (신규)
- `engine/meta/bucket_prior.py` (W-0414 wiring)

## Facts
위 §A 카테고리 표 + §B BigQuery 본문 참조 (실측 free tier 한도, public dataset 커버리지).

## Assumptions
- 기존 GCP 프로젝트 (Cloud Run wtd-2-3u7pi6ndna-uk.a.run.app) BigQuery API enable 가능
- Supabase 5GB/year 신규 테이블 추가 가능
- W-0414 메타룰 PR 머지 후 wiring (PR3 의존)

## Open Questions
위 §D Decisions 중 D8/D9 (paid 대안 vs free tier) 재확인 시점.

## Decisions
위 §D 12 결정표 참조.

## Next Steps
위 §I 본문 참조.

## Exit Criteria
위 §F AC1~AC7 본문 참조.

## Handoff Checklist
- [ ] BigQuery API enabled + SA key Vercel env 등록
- [ ] PR1~PR5 전부 머지
- [ ] AC1~AC7 검증 로그 첨부
- [ ] CURRENT.md main SHA 갱신
- [ ] 본 work item archive 이동
