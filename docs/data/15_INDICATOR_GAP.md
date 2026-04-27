# 15 — Indicator Gap & Roadmap (D-A ~ D-G)

**Status:** Reference · 2026-04-27 (코드 audit + 사용자 dump 보존)
**Source:** 2026-04-27 세션 — 35 인디케이터 audit + Glassnode/CryptoQuant 시그니처 분석
**Scope:** Wave 2.5 진입 전 데이터 보강 plan

---

## 0. 한 줄 결론

> **데이터 수집 능력 = 충분 (86%). 진짜 갭 = 7개 인디케이터 + fragmentation.**
>
> 부족한 7개는 add-on이지 blocker는 아님 — **이번 PR의 capture pipe fix가 진짜 돌아가면**, 우리는 이미 대부분의 인플루언서 지표로 패턴을 발견할 수 있다.

---

## 1. 35 핵심 인디케이터 커버리지 (audit 결과)

| 분류 | 상태 | 개수 | 비율 |
|---|---|---|---|
| ✅✅ STRONG (10+ 파일) | 강함 | 14 | 40% |
| ✅ BUILT (3-10 파일) | 됨 | 8 | 23% |
| 🟡 partial (1-3 파일) | 약함 | 11 | 31% |
| ❌ MISSING | 없음 | 2 | 6% |

---

## 2. ✅✅ STRONG (14개 — 진짜 잘 수집)

### Derivatives (4)
- **Funding Rate** (78 engine + 41 app)
- **Open Interest** (84 engine + 32 app)
- **Long/Short Ratio** (63 engine + 27 app)
- **Liquidation** (20 engine + 65 app)

### TA — Technical Analysis (7)
- **RSI** (13 + 16)
- **EMA** (4 + 13)
- **MACD** (2 + 12)
- **CVD** (19 + 50)
- **VWAP** (8 + 11)
- **Bollinger** (20 + 13)
- **ATR** (18 + 28)

### On-chain (3)
- **MVRV** (7 + 28)
- **NUPL** (1 + 23)
- **SOPR** (1 + 14)
- **Coinbase Premium** (17 + 5)

### Sentiment (1)
- **Fear & Greed** (17 + 24)

### DEX (1)
- **DEX Volume** (7 + 6)

→ 가장 잘 만든 영역 = Derivatives + TA. 트레이더 기본 다 됨.

---

## 3. ✅ BUILT but 약함 (8개)

| 인디케이터 | engine | app | 강화 권장 |
|---|---|---|---|
| Realized Price | 1 | 5 | M (Glassnode 가격 모델) |
| Active Address | 3 | 5 | S (이미 있음, 강화만) |
| Exchange Flow | 2 | 6 | M (실시간 alert 강화) |
| SSR (Stablecoin Supply Ratio) | 1 | 3 | S |
| OBV | 3 | 4 | XS |
| Supertrend | 7 | 1 | S |
| TVL | 1 | 6 | S |
| Social Volume | 3 | 7 | M |

→ 코드는 있는데 5-10 파일 정도. **강화 가능**.

---

## 4. 🟡 PARTIAL — 1-3 파일만 (실제 갭)

| 인디케이터 | 현재 | 트레이더 중요도 | 보강 ID |
|---|---|---|---|
| **Exchange Reserve** | engine:1, app:1 | ⭐⭐⭐⭐⭐ (CryptoQuant 1위) | **D-B** |
| **Whale Ratio** | engine:1, app:2 | ⭐⭐⭐⭐ | D-X1 |
| **Miner Outflow** | engine:1, app:1 | ⭐⭐⭐⭐ | D-X2 |
| **NVT Ratio** | engine:0, app:1 | ⭐⭐⭐ | D-X3 |
| **HODL Waves** | engine:1, app:1 | ⭐⭐⭐⭐ (Glassnode 핵심) | **D-C** |
| **Network Growth** | engine:0, app:1 | ⭐⭐⭐⭐ | **D-E** |
| **STH Cost Basis** | engine:1, app:1 | ⭐⭐⭐⭐⭐ (가격 모델) | **D-A** |
| **Unique Swappers** | engine:1, app:1 | ⭐⭐⭐⭐ (DEX 핵심) | D-X4 |
| **Token Unlock** | engine:1, app:1 | ⭐⭐⭐⭐ | D-X5 |
| **ETF Flow** | engine:0, app:1 | ⭐⭐⭐⭐⭐ (2026 기관) | **D-D** |
| **Realized P&L Ratio** | 0/0 | ⭐⭐⭐⭐ | **D-F** |

---

## 5. ❌ MISSING (2개)

- **Volume per TVL Ratio** (DEX 효율성)
- **Realized PnL Ratio** (Glassnode cycle 지표)

---

## 6. CTO 진단 (정직)

### 좋은 소식
- 데이터 수집 능력 = 충분 (86%)
- Derivatives + TA 영역 압도적
- 인플루언서 STRONG 지표 14개 다 됨

### 나쁜 소식
1. **상위 인플루언서 5개 중요 지표가 PARTIAL or MISSING**:
   - Exchange Reserve (CryptoQuant 1위)
   - STH Cost Basis (Glassnode 가격 모델)
   - ETF Flow (2026 기관 자금)
   - HODL Waves (Glassnode 사이클)
   - Realized P&L Ratio (Glassnode cycle)

2. **Glassnode/CryptoQuant 시그니처 지표 약함** — 무료로 다 가져올 수 있는데도 1-2 파일만 존재

3. **"수집"과 "활용" 차이** — 100개 파일이 funding_rate를 만지지만 패턴 엔진은 1개만 쓰고 있을 수 있음 (별도 audit 필요)

---

## 7. 즉시 보강 후보 (D-A ~ D-G)

### Wave 2.5 진입 전 P0
Glassnode/CryptoQuant 무료로 만들 수 있는 것 우선.

| ID | 인디케이터 | 출처 (무료) | 분량 | 트레이더 중요도 | 우선 |
|---|---|---|---|---|---|
| **D-A** | STH Cost Basis | Glassnode 무료 + 직접 계산 (UTXO age) | M | ⭐⭐⭐⭐⭐ | **#1** |
| **D-B** | Exchange Reserve (full history) | Binance/OKX/Coinbase API | M | ⭐⭐⭐⭐⭐ | **#2** |
| **D-C** | HODL Waves | 직접 계산 (UTXO age binning) | L | ⭐⭐⭐⭐ | #3 |
| **D-D** | ETF Flow | BlackRock/Grayscale 공시 (Bloomberg API or scraping) | S | ⭐⭐⭐⭐⭐ | **#4** |
| **D-E** | Network Growth | 새 주소 일별 집계 (BSCScan/Etherscan) | S | ⭐⭐⭐⭐ | #5 |
| **D-F** | Realized P&L Ratio | UTXO realized cap 계산 | M | ⭐⭐⭐⭐ | #6 |
| **D-G** | Volume per TVL Ratio | (DEX_Vol / TVL) 단순 계산 | XS | ⭐⭐⭐ | #7 |

### Phase 3 (옵션)
- **D-X1** Whale Ratio — Arkham/Nansen 통합
- **D-X2** Miner Outflow — CoinMetrics 무료 tier
- **D-X3** NVT Ratio — 직접 계산
- **D-X4** Unique Swappers — DexScreener + Etherscan 통합
- **D-X5** Token Unlock — token.unlocks.app or Messari

---

## 8. D-A: STH Cost Basis (★ #1 우선)

### 정의
Short-Term Holder Cost Basis — 155일 미만 보유자들의 평균 매입 가격.

### 왜 핵심
- Glassnode 가격 모델 ★
- 가격이 STH Cost Basis를 자석처럼 끌어당김
- 인플루언서 (@KongBTC, @glassnode) 매주 인용

### 구현 방안 (무료)
```python
# 옵션 1: Glassnode 무료 tier API
# GET https://api.glassnode.com/v1/metrics/indicators/sth_cost_basis
#   ?api_key=... (무료 tier 한도)

# 옵션 2: 직접 계산 (UTXO + 155일 기준)
def calc_sth_cost_basis(utxo_set, current_block_time):
    sth_utxos = [u for u in utxo_set
                 if (current_block_time - u.created_block_time) < 155 * 86400]
    total_value = sum(u.value for u in sth_utxos)
    total_cost = sum(u.value * u.created_price for u in sth_utxos)
    return total_cost / total_value
```

### 저장
- `raw_glassnode_metrics` 또는 `feature_windows.sth_cost_basis_usd`
- TTL: 무한 (cycle 분석용)

### 예상 분량
- fetcher: 80줄
- materialization: 30줄
- feature 등록: 10줄
- 테스트: 60줄
- **총 ~200줄, 1일**

---

## 9. D-B: Exchange Reserve Full History (★ #2 우선)

### 정의
거래소 cold/hot wallet의 BTC 잔고 history.

### 왜 핵심
- CryptoQuant 24h Most Viewed **1위**
- 매도 압력 직관적 판단
- "$3B BTC withdrawn" 같은 이벤트 감지

### 구현 방안 (무료)
```python
# 옵션 1: Binance/OKX/Coinbase 공식 wallet 주소 + Etherscan/BSCScan
EXCHANGE_WALLETS = {
    "binance": ["0x..."],
    "okx": ["0x..."],
    "coinbase": ["0x..."],
}

def calc_exchange_reserve(asset: str, exchange: str) -> float:
    wallets = EXCHANGE_WALLETS[exchange]
    return sum(get_balance(w, asset) for w in wallets)

# 옵션 2: CryptoQuant 무료 tier (limited history)
```

### 저장
- `raw_exchange_reserves` (asset × exchange × timestamp)
- daily snapshot

### 예상 분량
- fetcher: 120줄
- wallet 주소 정리: 50줄
- materialization: 40줄
- 테스트: 80줄
- **총 ~300줄, 2일**

---

## 10. D-C ~ D-G (간략)

### D-C HODL Waves
- 직접 계산 (UTXO age 0~1d, 1~7d, 7d~1m, 1m~3m, ...)
- ~400줄, 3일

### D-D ETF Flow
- BlackRock IBIT / Fidelity FBTC / Grayscale GBTC 공시 scraping
- 또는 SEC EDGAR API
- ~150줄, 1일

### D-E Network Growth
- BSCScan/Etherscan에서 일별 신규 주소 집계
- ~80줄, 0.5일

### D-F Realized P&L Ratio
- (Realized Profit + Realized Loss) / Realized Cap
- ~200줄, 1일

### D-G Volume per TVL Ratio
- DEX Volume / TVL 단순 계산
- ~30줄, 0.5일

---

## 11. 8 BUILT 강화 plan (D-X 시리즈)

| ID | 인디케이터 | 강화 내용 | 분량 |
|---|---|---|---|
| D-X1 | Whale Ratio | Arkham + Nansen 통합 | M |
| D-X2 | Miner Outflow | 채굴 풀 wallet 주소 + 일별 outflow | M |
| D-X3 | NVT Ratio | (Market Cap / 24h Tx Volume) 직접 계산 | S |
| D-X4 | Unique Swappers | DexScreener + Etherscan 통합 | M |
| D-X5 | Token Unlock | token.unlocks.app or Messari schedule | S |

---

## 12. 예상 총 분량

| 항목 | 분량 |
|---|---|
| D-A ~ D-G (7 신규) | ~1300줄, 7~10일 |
| D-X1 ~ D-X5 (5 강화) | ~600줄, 4~5일 |
| Documentation 갱신 | ~200줄, 1일 |
| **총** | **~2100줄, 12~16일** |

---

## 13. CTO 권고 순서

### 즉시 (이번 milestone)
**아무것도 안 해도 됨** — 86% 커버리지로 verdict 200건 누적 가능.

### Wave 2.5 진입 전 (선택)
1. **D-D ETF Flow** (S, 1일) — 가장 시급한 매크로 indicator
2. **D-G Volume per TVL** (XS, 반나절) — 즉시 가능

### Wave 2.5 직후
3. **D-A STH Cost Basis** (M, 1일)
4. **D-B Exchange Reserve** (M, 2일)
5. **D-E Network Growth** (S, 반나절)

### Phase B (verdict 50+)
6. D-C HODL Waves
7. D-F Realized P&L Ratio

### Phase C (옵션)
8. D-X 시리즈 5개

---

## 14. 한 줄 결론

> 데이터 = 충분. 패턴 엔진이 활용 못 하는 게 진짜 갭.

PR #374 capture pipe fix → verdict 누적 시작 → 그 다음 D-A/D-B/D-D 우선 보강.

---

## 15. 출처 / 관련

- 사용자 원문: 2026-04-27 세션 (Twitter 인플루언서 분석 + audit 결과)
- 코드 audit: `bash /tmp/audit.sh`
- [14_DATA_INVENTORY.md](14_DATA_INVENTORY.md) — 20 provider × URL audit
- [00_PIPELINE.md](00_PIPELINE.md) §2 — System Fetch Pipeline
- [11_AI_ROLES.md](11_AI_ROLES.md) §4 — Signal vocabulary가 인디케이터 사용처

---

*v1.0 · 2026-04-27 · 사용자 dump + 코드 audit 보존*
