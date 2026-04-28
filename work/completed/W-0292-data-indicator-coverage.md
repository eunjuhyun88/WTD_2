# W-0292 — 데이터 인디케이터 커버리지 86%→95% (D-A~D-G + D-infra)

> Wave: MM Hunter | Priority: P1 | Effort: L
> Charter: In-Scope — L3~L5 (Pattern Object 신호 품질 + 연구 인프라)
> Status: 🟡 Design Draft
> Created: 2026-04-29 by Agent A078
> Issue: #570

---

## Goal

현재 86% (35개 중 30개) 인디케이터 커버리지를 **95%+** 로 높여 트레이더 인플루언서 상위 지표를 퀀트 패턴 엔진에서 신호 소스로 쓸 수 있게 한다.

구체적으로: **7개 신규 fetcher + 1개 인프라 통합**을 통해 PARTIAL/MISSING 상태인 Exchange Reserve, STH Cost Basis, HODL Waves, ETF Flow, Network Growth, Realized P&L Ratio, Volume/TVL Ratio를 engine에서 수집·feature화한다.

---

## 배경

2026-04-27 코드 audit (`docs/data/14_DATA_INVENTORY.md`):
- 전체 35개 핵심 인디케이터 중 86% 커버 (30개)
- ❌ 완전 누락: 2개 (Volume/TVL Ratio, Realized P&L Ratio)
- 🟡 PARTIAL (1~3 파일만): 11개

핵심 갭: 인플루언서 1~5위 지표 중 4개가 partial or missing.

| 순위 | 지표 | 현재 | D-ID |
|---|---|---|---|
| CQ-1 | Exchange Reserve | 🟡 partial | D-B |
| CQ-5 | MVRV Z-Score | ✅ STRONG | — |
| GL-1 | STH Cost Basis | 🟡 partial | D-A |
| GL-5 | HODL Waves | 🟡 partial | D-C |
| 2026 트렌드 | ETF Flow | 🟡 partial | D-D |
| DEX | Volume/TVL Ratio | ❌ MISSING | D-G |
| Cycle | Realized P&L Ratio | ❌ MISSING | D-F |
| 인프라 | App→Engine bypass | ⚠️ 구조 문제 | D-infra |

---

## Scope

### 포함 — 7개 신규 fetcher

| D-ID | 인디케이터 | 파일 | 출처 | 분량 | 우선 |
|---|---|---|---|---|---|
| **D-G** | Volume/TVL Ratio | `engine/features/` 계산 | (DEX_Vol / TVL 단순) | XS 30줄 | P0 |
| **D-E** | Network Growth Rate | `fetch_etherscan.py` 확장 | Etherscan/BSCScan (무료) | S 80줄 | P1 |
| **D-D** | ETF Flow | `fetch_etf_flow.py` (신규) | SEC EDGAR / Bloomberg | S 150줄 | P1 |
| **D-A** | STH Cost Basis | `fetch_glassnode.py` (신규) | Glassnode free tier | M 200줄 | P1 |
| **D-B** | Exchange Reserve | `fetch_exchange_reserve.py` (신규) | Binance/OKX wallet + Etherscan | M 300줄 | P1 |
| **D-C** | HODL Waves | `fetch_glassnode.py` 확장 | Glassnode UTXO age bins | L 400줄 | P2 |
| **D-F** | Realized P&L Ratio | `fetch_glassnode.py` 확장 | UTXO realized cap | M 200줄 | P2 |

### 포함 — D-infra (App→Engine Provider Bypass 통합)

> 기존 Issue #397

6개 provider가 app에서만 직접 호출 중 → engine fetcher로 수렴:
- CoinGlass (5 app 파일)
- CryptoQuant (3 app 파일)
- Polymarket (3 app 파일)
- Glassnode (2 app 파일)
- Santiment (2 app 파일)
- LunarCrush (1 app 파일)

### 파일 (예상)

| 파일 | 상태 | D-ID |
|---|---|---|
| `engine/data_cache/fetch_glassnode.py` | 신규 | D-A, D-C, D-F |
| `engine/data_cache/fetch_exchange_reserve.py` | 신규 | D-B |
| `engine/data_cache/fetch_etf_flow.py` | 신규 | D-D |
| `engine/data_cache/fetch_etherscan.py` | 수정 | D-E |
| `engine/features/dex_ratios.py` | 신규 | D-G |
| `engine/scanner/scheduler.py` | 수정 | 신규 fetcher 등록 |
| `engine/scanner/feature_calc.py` | 수정 | 신규 feature 컬럼 등록 |
| `app/src/routes/api/*/+server.ts` (6개) | 수정 | D-infra bypass → engine route |

---

## Non-Goals

- 유료 Glassnode 구독 티어 사용 (무료 tier + 직접 계산만)
- 실시간 on-chain 스트리밍
- Nansen / Arkham 스마트머니 추적 (별도 Phase C 후보)
- GPU 온체인 분석

---

## CTO 관점

### Phase 실행 순서

**Phase 1 — XS/S 즉시 가능 (D1~D3)**

D-G (Volume/TVL, 30줄), D-E (Network Growth, 80줄), D-D (ETF Flow, 150줄)

이 3개는 무료 API + 단순 계산 → 이번 sprint에 처리 가능.

**Phase 2 — M 규모 Glassnode 통합 (D4~D7)**

D-A (STH Cost Basis) → D-B (Exchange Reserve)
→ fetch_glassnode.py 단일 파일에 여러 metric 통합.

**Phase 3 — L 규모 (D8~D12)**

D-C (HODL Waves, UTXO age 계산 복잡), D-F (Realized P&L)

**Phase 4 — D-infra (D13~D20)**

App bypass 6개 provider → engine route 이관.
가장 큰 리스크: app 라우트 변경으로 기존 UI 깨질 수 있음.

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Glassnode 무료 tier rate limit (10req/min) | 고 | 중 | cache TTL 24h, retry backoff |
| ETF Flow: SEC EDGAR HTML 파싱 불안정 | 중 | 저 | fallback: CoinGlass app이미 있음 (#397) |
| D-infra app 라우트 이관 중 UI 버그 | 중 | 고 | feature flag + 단계적 이관 |
| HODL Waves UTXO 계산 = BTC only | 고 | 중 | BTC only 명시, ETH 이후 확장 |
| Exchange Reserve wallet 주소 stale | 중 | 중 | 알려진 주소 목록 + 주기적 검증 |

### Dependencies

- D-A/D-C/D-F: Glassnode API key 환경변수 `GLASSNODE_API_KEY` 필요
- D-B: 거래소 known wallet 주소 목록 (BSCScan/Etherscan, public)
- D-infra: W-0291 이후 (유니버스 확장 후 bypass 통합)
- D-G: `fetch_dexscreener.py` 이미 존재 → TVL 데이터 재사용

### Rollback Plan

- 모든 신규 fetcher는 독립 파일 (기존 코드 건드리지 않음)
- feature_calc.py 신규 컬럼 추가: `.get(col, 0)` fallback으로 기존 패턴 영향 없음
- D-infra: app 라우트 이관은 병렬 운영 (engine proxy + 기존 직접 호출) 후 교체

---

## AI Researcher 관점

### D-A: STH Cost Basis (단기 보유자 매입가 = 가격 자석)

```python
# fetch_glassnode.py
GLASSNODE_BASE = "https://api.glassnode.com/v1/metrics"

def fetch_sth_cost_basis(
    asset: str = "BTC",
    since: datetime | None = None,
    api_key: str | None = None,
) -> pd.DataFrame:
    """Short-Term Holder Cost Basis (155일 미만 UTXO 평균 매입가).
    무료 tier: daily resolution, 1년 history.
    """
    url = f"{GLASSNODE_BASE}/indicators/sth_cost_basis"
    ...
    # columns: timestamp (UTC), sth_cost_basis_usd
```

Feature: `feature_windows.sth_cost_basis_usd` + `sth_premium_pct = (price - sth_cost) / sth_cost`

### D-B: Exchange Reserve (거래소 잔고 = 매도 압력)

```python
# fetch_exchange_reserve.py
KNOWN_EXCHANGE_WALLETS = {
    "binance": {
        "BTC": ["1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s", ...],
        "ETH": ["0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", ...],
    },
    "okx": {...},
    "coinbase": {...},
}

def fetch_exchange_reserve_btc(date: date) -> dict[str, float]:
    """Returns {exchange: reserve_btc} snapshot."""
    ...
```

Feature: `feature_windows.exchange_reserve_btc_total`, `exchange_reserve_delta_7d`

### D-D: ETF Flow (기관 자금 유입/유출)

```python
# fetch_etf_flow.py
ETF_TICKERS = {
    "IBIT": "BlackRock",
    "FBTC": "Fidelity",
    "GBTC": "Grayscale",
    "ARKB": "ARK/21Shares",
}

def fetch_btc_etf_flow_daily(since: date | None = None) -> pd.DataFrame:
    """BTC ETF daily AUM 변화 → proxy for flow."""
    # SEC EDGAR N-CEN filings 또는 issuer IR pages
    ...
    # columns: date, ticker, issuer, flow_usd, aum_usd, btc_equivalent
```

### D-G: Volume/TVL Ratio (DEX 효율성 = 즉시 계산 가능)

```python
# engine/features/dex_ratios.py
def calc_volume_tvl_ratio(
    dex_volume_usd_24h: float,
    tvl_usd: float,
) -> float | None:
    if tvl_usd and tvl_usd > 0:
        return dex_volume_usd_24h / tvl_usd
    return None
```

이미 `fetch_dexscreener.py`에서 `dex_volume_h24`, `dex_liquidity_usd` 수집 중 → 단순 ratio만 추가.

### Feature Impact on Pattern Engine

신규 features가 패턴 블록에 미치는 영향:

| Feature | 적용 가능 패턴 | 신규 블록 필요? |
|---|---|---|
| sth_cost_basis_usd | OI reversal, accumulation | `STHCostBasisProximity` (M) |
| exchange_reserve_delta_7d | whale movement | `ExchangeNetflow` 확장 (S) |
| etf_flow_usd_7d | macro sentiment | `ETFFlowConfirmation` (S) |
| volume_tvl_ratio | DEX momentum | `DEXEfficiencyCheck` (XS) |
| network_growth_daily | adoption momentum | `NetworkGrowthSignal` (S) |

---

## D-infra 상세 (App→Engine Provider Bypass)

### 현재 구조 (문제)

```
User → App Route → CryptoQuant API (direct)
User → App Route → Glassnode API (direct)
...
```

패턴 엔진은 이 데이터를 쓸 수 없음. API key 이중 관리.

### 목표 구조

```
User → App Route → Engine Route → Provider
Pattern Engine → Engine Fetcher → Provider
```

### 이관 순서 (리스크 낮은 순)

1. CoinGlass → engine/data_cache/fetch_coinglass.py (신규)
2. Glassnode → fetch_glassnode.py (D-A와 함께)
3. Santiment → fetch_social.py 확장
4. LunarCrush → fetch_social.py 확장
5. CryptoQuant → fetch_cryptoquant.py (유료 API key 필요)
6. Polymarket → fetch_polymarket.py (예측시장, 최저 우선)

---

## Decisions

| ID | 결정 | 선택 | 거절 |
|---|---|---|---|
| D-01 | Glassnode API | 무료 tier (daily, 1년 history) | 유료 구독 (비용 미정) |
| D-02 | ETF Flow 출처 | SEC EDGAR + issuer scraping | Bloomberg Terminal (비용) |
| D-03 | HODL Waves scope | BTC only Phase 3 | BTC+ETH 동시 (UTXO 구조 다름) |
| D-04 | D-infra 이관 방식 | 병렬 운영 → feature flag → 교체 | 즉시 교체 (UI 버그 위험) |
| D-05 | D-G 구현 | 즉시 계산 (30줄) — 별도 fetcher 불필요 | 별도 fetcher (불필요한 복잡도) |

---

## Open Questions

| # | 질문 | 제안 |
|---|---|---|
| Q-01 | Glassnode API key 환경변수 이름? | `GLASSNODE_API_KEY` (.env.example 추가) |
| Q-02 | Exchange wallet 주소 관리: hardcode vs DB? | hardcode + version comment (변경 거의 없음) |
| Q-03 | D-D ETF Flow: 기관이 없는 BTC bear market 시 데이터 없으면? | `etf_flow_usd = 0` (neutral), graceful None |
| Q-04 | D-infra: app 라우트 이관 테스트 전략? | Jest snapshot test before/after |
| Q-05 | Realized P&L Ratio (D-F) Phase 3 vs Phase 2? | Phase 3 유지 (UTXO 계산 복잡도) |

---

## Implementation Plan

### Phase 1 (D1~D3) — 즉시 가능 (무료 + 단순)

| 일 | 작업 | D-ID | 분량 |
|---|---|---|---|
| D1 | `engine/features/dex_ratios.py` + feature_calc 등록 | D-G | 30줄 |
| D2 | `fetch_etherscan.py` 신규 주소 일별 집계 확장 | D-E | 80줄 |
| D3 | `fetch_etf_flow.py` SEC EDGAR BTC ETF 일별 flow | D-D | 150줄 |

### Phase 2 (D4~D7) — Glassnode 통합 (유료키 필요 시 스킵 가능)

| 일 | 작업 | D-ID | 분량 |
|---|---|---|---|
| D4 | `fetch_glassnode.py` base + STH Cost Basis | D-A | 200줄 |
| D5 | `fetch_exchange_reserve.py` known wallet | D-B | 300줄 |
| D6 | feature_calc.py 신규 컬럼 + scheduler 등록 | D-A,B | 100줄 |
| D7 | 신규 building block 2개 (STH proximity, Exchange Netflow) | — | 200줄 |

### Phase 3 (D8~D12) — 복잡 지표

| 작업 | D-ID |
|---|---|
| HODL Waves (UTXO age bins, BTC only) | D-C |
| Realized P&L Ratio | D-F |

### Phase 4 (D13~D20) — D-infra

| 작업 |
|---|
| App→Engine bypass 이관 6 provider (단계적) |

---

## Exit Criteria

### Phase 1 (즉시 가능)

- [ ] AC1: `volume_tvl_ratio` feature_windows 컬럼 추가, pytest green
- [ ] AC2: `network_growth_daily_eth` 일별 신규 주소 수집 동작 확인 (최근 7d)
- [ ] AC3: `etf_btc_flow_usd_7d` 최근 30일 데이터 수집 확인
- [ ] AC4: 기존 CI green (feature_calc 기존 패턴 영향 없음)

### Phase 2 (Glassnode)

- [ ] AC5: `sth_cost_basis_usd` 1년 history 수집 + `feature_windows` 저장
- [ ] AC6: `exchange_reserve_btc_total` 일별 snapshot 수집
- [ ] AC7: CI green

### Phase 3

- [ ] AC8: HODL Waves 6 bins (0~1d, 1~7d, 7d~1m, 1m~3m, 3m~6m, 6m+) 수집
- [ ] AC9: Realized P&L Ratio 계산 + feature 등록

### Phase 4 (D-infra)

- [ ] AC10: 6개 provider app 직접 호출 → engine route proxy 100% 이관
- [ ] AC11: app CI green (UI 기능 regression 없음)

전체 완료:
- [ ] AC12: 35개 인디케이터 커버리지 ≥ 95% (33/35)
- [ ] PR merged + CURRENT.md SHA 업데이트

---

## References

- `docs/data/14_DATA_INVENTORY.md` — 20 provider audit + 현황
- `docs/data/15_INDICATOR_GAP.md` — D-A~D-G 상세 구현 가이드
- D-A GitHub Issue: #401
- D-B GitHub Issue: #402
- D-D GitHub Issue: #398
- D-E GitHub Issue: #403
- D-G GitHub Issue: #400
- D-infra GitHub Issue: #397
- López de Prado (2018) §3 — survivorship bias in universe selection
