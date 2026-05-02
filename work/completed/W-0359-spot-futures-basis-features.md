# W-0359 — Spot-Futures Basis & Cross-Exchange Divergence Features

> Wave: 5 | Priority: P1 | Effort: S
> Charter: In-Scope (L5 Search 가속)
> Status: 🟡 Design Draft
> Issue: #786
> Created: 2026-05-01
> Depends-on: W-0358 (#785)

## Goal
W-0358 데이터를 활용해 Spot-Futures basis, Coinbase premium, Kimchi premium,
cross-exchange volume divergence를 scanner feature로 노출.

## Scope
- 포함:
  - `engine/scanner/feature_calc.py` — 신규 6 features 계산 함수
  - `engine/research/pattern_scan/scanner.py` — `_inject_cross_exchange()` 추가
  - 신규 features (top-20 symbols 한정):
    1. `spot_futures_basis_pct` = (perp_close - spot_close) / spot_close
    2. `spot_futures_basis_zscore` = 30d rolling z-score
    3. `coinbase_premium_pct` = (Coinbase_BTC - Binance_BTC) / Binance_BTC (BTC/ETH only)
    4. `kimchi_premium_pct` = (Upbit_KRW_in_USD - Binance_USD) / Binance_USD (BTC/ETH only)
    5. `xchg_volume_concentration_hhi` = HHI(binance, okx, bybit) spot volume
    6. `xchg_price_dispersion` = stddev of close across 3 spot venues
- API: 없음

## Non-Goals
- Building blocks 신설 (별도 W)
- UI 노출 (별도 W)
- Tier 2/3 cross-exchange features (top-20만)

## CTO 관점

### Risk Matrix
| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| W-0358 데이터 부재 시 features 전부 NaN | 높음 | High | `has_ohlcv` 체크 후 graceful NaN |
| 1957 tests 회귀 | 낮음 | Medium | 신규 column만 추가, 기존 미변경 |
| Lookahead leak | 낮음 | **Critical** | `shift(1)` 전면 적용 |

### Dependencies
- W-0358 Tier 1 완료 필수
- Upbit KRW → USD 환율 데이터 필요

### Rollback
- `_inject_cross_exchange` 단일 함수 격리, 1줄 호출. 주석 처리로 즉시 비활성화.

### Canonical Files
- `engine/scanner/feature_calc.py`
- `engine/research/pattern_scan/scanner.py`

## AI Researcher 관점

### Data Impact
- top-20 × 6 features × 8760h ≈ 1M new feature cells
- BTC basis: 365일 평균 ±0.3%, 99th percentile 2.5%
- Coinbase premium: BTC 평균 0%, ±0.5%, 극단 -2~+3%
- Kimchi premium: BTC 평균 +2%, 극단 +20%

### Statistical Validation
- basis_zscore > 2 이벤트: 24h 후 |return| std ≥ baseline × 1.2 (event-study)
- Lookahead-free: shift(1) 검증 테스트

### Failure Modes
- Coinbase 1h slot 거래량 0 → NaN 보존 (ffill 금지)
- Kimchi premium FX rate 필요 → fetch_macro.py USDKRW 확인
- Candle 마감 시각 미세 차이 → W-0358 adapter 정규화 전제

## Decisions
- **D-0001**: HHI 분모 = top-3 거래소 (Binance/OKX/Bybit) 고정
- **D-0002**: Kimchi premium FX = fetch_macro.py USDKRW daily → 1h ffill

## Open Questions
- [ ] [Q-0001] fetch_macro.py에 USDKRW 환율 있는가? 없으면 본 W 추가
- [ ] [Q-0002] top-20 universe 동결: rolling vs 고정?

## Implementation Plan
1. `_inject_cross_exchange(features, symbol)` 작성 — 6 features + shift(1) (0.5d)
2. scanner.py wire (0.5d)
3. Tests: 정확성 + top-21+ NaN + lookahead 검증 (0.5d)

## Exit Criteria
- [ ] AC1: 6 features 노출, 신규 12 tests green
- [ ] AC2: top-20 NaN ≤ 1%, top-21+ = 100%
- [ ] AC3: lookahead-free 검증 pass (`assert_no_lookahead`)
- [ ] AC4: BTC basis 30일 평균 ∈ [-0.5%, +1.5%], 99th |basis| ≤ 5%
- [ ] AC5: cross-exchange price stddev BTC 30일 ≤ 0.05%
- [ ] AC6: basis_zscore > 2 이벤트 24h |ret| std ≥ baseline × 1.2

## Owner
engine

## Facts
- `_inject_multi_exchange` (MEXC/Bitget live)는 이미 scanner.py에 존재
- feature_calc.py:1850에 venue OI (binance/bybit/okx) 이미 있음
- Coinbase premium write/read ParquetStore에 있음
- Upbit write/read ParquetStore에 있음

## Assumptions
- W-0358 Tier 1 데이터 ingestion 완료됨
- Upbit KRW → USD 환율 fetch_macro.py에서 가능
