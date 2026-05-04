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
