# 14 — Data Inventory (실제 외부 API 진실표)

**Status:** Reference · 2026-04-27 (코드 audit + 사용자 dump 보존)
**Source:** 2026-04-27 세션 — URL grep 기반 audit + Twitter 인플루언서 분석
**Replaces / fixes:** "27 fetcher" / "Velo 21 파일" false claims

---

## 0. 한 줄 결론

> **20 distinct 외부 API provider** 사용 중 (URL 기준 검증).
> Velo (유료) = **0 호출** (전부 `velocity` 변수 false positive).
> CME COT = **18 engine 파일** (미문서화 큰 투자).

---

## 1. 검증된 외부 API Provider 표 (20개)

```
=== 진짜 외부 API 호출 (URL 기준 재검증) ===
Provider          engine  app   total  비고
─────────────────────────────────────────────────────────────
Binance           11      17    28     ★ 최대 (klines/perp/liq)
CME (COT)         18       0    18     ★ 미문서화 큰 투자
CoinGecko          4       9    13     보조 가격/마켓
Fear & Greed      11
  (alternative.me) 5       6           감정 지표 (무료)
Etherscan          2       6     8     온체인 (무료)
CoinGlass          0       5     5     ★ engine 안 씀 (앱만)
DexScreener        1       2     3     DEX 페어/유동성
Coinalyze          1       2     3     파생 보조 (유료)
CryptoQuant        0       3     3     ★ engine 안 씀 (앱만)
Polymarket         0       3     3     ★ engine 안 씀 (앱만, 예측시장)
OKX                2       1     3
Bybit              1       1     2
BSCScan            1       1     2     온체인 (무료)
Glassnode          0       2     2     ★ engine 안 씀 (앱만, 유료)
Yahoo              1       1     2     주식/매크로
Santiment          0       2     2     ★ engine 안 씀 (앱만, 유료)
Deribit            0       2     2     옵션
LunarCrush         0       1     1     ★ engine 안 씀 (앱만, 소셜)
CoinDesk           0       1     1     뉴스
FRED (St. Louis)   0       1     1     매크로 (무료)
─────────────────────────────────────────────────────────────
합계: 20 distinct provider · ~110 호출 파일
Velo: 0 ★ false positive 확인 (velocity 변수 매칭)
```

---

## 2. Provider별 비용 / 라이선스

### 무료 (8)
- Binance / Bybit / OKX (public API, rate limit only)
- Fear & Greed (alternative.me)
- Etherscan / BSCScan
- FRED
- DexScreener (public)
- CoinGecko (free tier)

### 유료 / 키 필요 (8)
- Coinalyze (구독)
- CryptoQuant (구독)
- Glassnode (구독, BTC 핵심 사이클 지표)
- Santiment (구독, 소셜)
- LunarCrush (구독, 소셜 영향력)
- Deribit (API key, 옵션)
- Yahoo (rate limit)
- CoinGecko Pro (선택)

### 외부 / 크롤링 (4)
- CoinGlass (대시보드, API 일부)
- Polymarket (예측시장)
- CoinDesk (뉴스)
- CME COT (CFTC 공시)

---

## 3. 구조적 문제 (★ 발견)

### 3.1 App이 engine 우회 외부 호출
**engine에 없는데 app만 호출하는 5 provider**:
- CoinGlass (5 app 파일)
- CryptoQuant (3 app 파일)
- Polymarket (3 app 파일)
- Glassnode (2 app 파일)
- Santiment (2 app 파일)
- LunarCrush (1 app 파일)

**문제**:
- 같은 provider key가 두 번 관리됨
- engine pattern engine이 이 데이터 못 씀
- App 라우트가 외부 API 직접 호출 → 캐싱/rate-limit 불일치

**해결 (L-2 P0)**:
- 모든 외부 API → engine fetcher로 통합
- App은 engine route만 호출 (proxy)

### 3.2 CME COT 18 파일 미문서화
- engine에 18 파일 있는데 docs/data/에 한 줄도 없음
- 무엇을 분석하는지, 어떤 패턴이 쓰는지 불명
- **별도 작업**: CME COT 사용처 정본 1 페이지 (`docs/data/16_CME_COT.md` candidate)

---

## 4. Trader가 실제로 보는 지표 (Twitter 인플루언서 분석)

### 4.1 CryptoQuant 24h Most Viewed (트레이더 1순위)

| 순위 | 지표 | 우리 커버 |
|---|---|---|
| 1 | Exchange Reserve | 🟡 partial |
| 2 | Exchange Netflow | ✅ BUILT |
| 3 | Exchange Whale Ratio | 🟡 partial |
| 4 | Funding Rates | ✅✅ STRONG (78 engine + 41 app) |
| 5 | MVRV Z-Score / Ratio | ✅✅ STRONG (7 engine + 28 app) |
| 6 | SOPR (LTH-SOPR) | ✅✅ STRONG (1 engine + 14 app) |
| 7 | NUPL | ✅✅ STRONG (1 engine + 23 app) |
| 8 | Active Addresses | ✅ BUILT |
| 9 | Coinbase Premium Index | ✅✅ STRONG (17 engine + 5 app) |
| 10 | Miner Outflow / Revenue | 🟡 partial |
| 11 | Stablecoin Supply Ratio (SSR) | ✅ BUILT |
| 12 | NVT Ratio | 🟡 partial |

### 4.2 Glassnode 핵심 (사이클 분석가 필수)

| 지표 | 우리 커버 | 비고 |
|---|---|---|
| SOPR & Realized P/L Ratio | 🟡 partial | Glassnode 핵심 사이클 |
| NUPL & MVRV | ✅✅ STRONG | 시장 과열/저평가 |
| Realized Price / Cost Basis | ✅ BUILT | Glassnode 가격 모델 |
| HODL Waves | 🟡 partial | UTXO age |
| STH Cost Basis (Short-Term Holder) | 🟡 partial | ★ 가격 자석 |
| Active Entities | 🟡 partial | |
| Percent of Supply in Profit | 🟡 partial | |
| Accumulation Trend Score (ATS) | ❌ MISSING | |

### 4.3 Messari 펀더멘털 (프로젝트 분석)

| 지표 | 우리 커버 | 비고 |
|---|---|---|
| TVL (Total Value Locked) | ✅ BUILT | Messari + DefiLlama |
| DEX Volume / Market Cap | ✅✅ STRONG | |
| Active Addresses + Tx Fees | ✅ BUILT | |
| Token Unlocks / Fundraising | 🟡 partial | |
| Revenue & Fees (P/S Ratio) | ❌ MISSING | |
| Social & Mindshare Signals | ✅ BUILT | |

### 4.4 Dune Analytics (DEX 트레이더)

| 지표 | 우리 커버 | 비고 |
|---|---|---|
| DEX Swap Volume | ✅✅ STRONG | |
| Unique Swappers / Active Traders | 🟡 partial | wash trade 거름 |
| Fees Generated | 🟡 partial | |
| Volume/TVL Ratio | ❌ MISSING | DEX 효율성 |
| Top Token Pairs | 🟡 partial | |
| Liquidity Depth / Slippage | ✅ BUILT | |

### 4.5 DefiLlama (TVL 비교)

| 지표 | 우리 커버 |
|---|---|
| TVL & Chain Rankings | ✅ BUILT |
| DEX Volume (24h/7d/30d) | ✅✅ STRONG |
| Fees & Revenue | 🟡 partial |
| Perps Volume | ✅ BUILT |
| Stablecoins Mcap & Yields | 🟡 partial |
| Bridge Volume / DEX vs CEX | 🟡 partial |

### 4.6 Coinglass (Derivatives)

| 지표 | 우리 커버 |
|---|---|
| Funding Rate | ✅✅ STRONG |
| Open Interest | ✅✅ STRONG (84 engine + 32 app) |
| Long/Short Ratio | ✅✅ STRONG (63 engine + 27 app) |
| Liquidation Heatmap | ✅✅ STRONG (20 engine + 65 app) |

### 4.7 보조 (TradingView 통합)

| 지표 | 우리 커버 |
|---|---|
| RSI (14) | ✅✅ STRONG (13 engine + 16 app) |
| 50/200 EMA, Golden/Death Cross | ✅✅ STRONG |
| MACD | ✅✅ STRONG |
| OBV | ✅ BUILT |
| Volume Profile / ATR | ✅✅ STRONG |
| Supertrend | ✅ BUILT |
| Bollinger Bands | ✅✅ STRONG |
| VWAP | ✅✅ STRONG |
| CVD (cumulative volume delta) | ✅✅ STRONG (19 engine + 50 app) |

---

## 5. Twitter 인플루언서 Top 추천 패키지

### "I check every day" — 인플루언서 공통 추천

```
Glassnode  → MVRV / NUPL / SOPR / HODL Waves / Realized Price / STH Cost Basis
CryptoQuant → Exchange Flow / Funding Rates / Whale Ratio
DefiLlama + Dune → TVL / DEX Volume / Velocity / Unique Swappers
Coinglass  → Funding Rate / OI / Liquidation
Nansen / Arkham → 스마트머니 / 고래 추적
```

### 실전 5종 조합 (시장 80% 커버)
1. Exchange Flow + MVRV/NUPL + Funding Rate
2. TVL + DEX Volume + Volume/TVL
3. Realized Price + STH Cost Basis
4. ETF Inflows + Institutional Flows
5. Fear & Greed + Social Sentiment

---

## 6. 2026 X 인플루언서 트렌드

### 가장 많이 언급된 5개 (3~4월 X 포스트 분석)
1. **Active Addresses** — ETH ATH + BTC 8년 저점 동시 등장으로 급증
2. **Exchange Outflow** — "$3B BTC withdrawn" 같은 대형 이벤트 즉시 바이럴
3. **Realized Price / STH Cost Basis** — Glassnode 가격 모델이 TA보다 더 자주 인용
4. **TVL** — DeFi 채택도 + 이벤트 영향력
5. **Network Growth Rate** + **Whale Transactions** — 새롭게 Top 4 진입

### 인플루언서 핵심 메시지
- 가격은 거짓말, 데이터는 진실
- 온체인 > TA (RSI/EMA 같은 전통 TA는 보조)
- 데이터 우선주의
- 실사용 중심 (TVL/Volume/Unique User 증가 = 진짜 모멘텀)
- 레버리지 과열 감지 (Funding + OI 조합)

### 대표 인플루언서 (참고)
- @glassnode (공식)
- @cryptorover
- @coinbureau
- @ecxx_Official
- @BSCNews
- @ChainGainIO
- @KongBTC
- @AxelAdlerJr
- @Washigorira
- @MaxCrypto
- @MarcosBTCreal

---

## 7. App 47 카테고리 (현실)

```
agents, analyze, auth, captures, chart, cogochi, coinalyze,
coingecko, confluence, copy-trading, cycles, doctrine, engine,
etherscan, exchange, facts, feargreed, gmx, lab, live-signals,
macro, market, memory, notifications, observability, onchain,
patterns, pine, pnl, polymarket, portfolio, positions, predictions,
preferences, profile, progression, quick-trades, refinement,
runtime, search, senti, signals, terminal, ui-state, wallet,
wizard, yahoo
```

**총 47 top-level subdirs, ~180 +server.ts 파일.**

→ 25+ 카테고리가 데이터 관련 (engine 우회 직접 호출 다수).

---

## 8. 신규 데이터 소스 추가 5-step Playbook

새 provider (예: Glassnode를 engine으로 통합) 추가 시:

### Step 1. Fetcher 작성
```python
# engine/data_cache/fetch_glassnode.py
def fetch_glassnode_metric(metric: str, asset: str, ...) -> pd.DataFrame:
    # API key 환경변수, rate limit guard, retry
```

### Step 2. raw_store schema
```sql
ALTER TABLE raw_glassnode_metrics ...
```

### Step 3. Feature 등록
```python
# engine/features/materialization_store.py
# feature_windows에 컬럼 추가
```

### Step 4. Block 작성 (선택)
```python
# engine/building_blocks/confirmations/glassnode_*.py
```

### Step 5. Scheduler 등록
```python
# engine/scanner/scheduler.py
SCHEDULER.add_job(fetch_glassnode_job, "interval", minutes=...)
```

---

## 9. Data Quality / Degraded Mode

### Universe별 데이터 완전성 요구
- **BTC/ETH**: 27/27 fetcher (full)
- **top 100 alts**: 18/27 (no on-chain detail)
- **long-tail**: 8/27 (klines + OI only)

### Fetcher 실패 시 어떤 패턴 비활성
- Binance 다운 → 모든 패턴 비활성
- Coinalyze 다운 → liquidation 패턴만 비활성
- Glassnode 미사용 → cycle 패턴 weak (수동 hold)

---

## 10. 한 줄 결론

**우리는 20 provider × ~110 파일로 데이터 잘 수집한다.**

진짜 갭:
1. App이 engine 우회 외부 호출 (5 provider 분산) → 통합 필요
2. CME COT 18 파일 미문서화 → 정본 1 페이지 필요
3. Glassnode 시그니처 지표 (HODL Waves / STH Cost Basis) PARTIAL → 강화 필요 (D-A, D-C)

→ [15_INDICATOR_GAP.md](15_INDICATOR_GAP.md) 참고.

---

## 11. 출처 / 관련

- 사용자 원문: Twitter 인플루언서 분석 (2026-04-27 세션)
- 코드 audit: `bash /tmp/audit.sh` (URL 기준 grep)
- [15_INDICATOR_GAP.md](15_INDICATOR_GAP.md) — 86% 커버리지 + D-A~G 우선 보강
- [00_PIPELINE.md](00_PIPELINE.md) §2 — System Fetch Pipeline
- [04_CTO_REALITY.md](04_CTO_REALITY.md) — 설계 vs 실제

---

*v1.0 · 2026-04-27 · 사용자 dump + 코드 audit 보존*
