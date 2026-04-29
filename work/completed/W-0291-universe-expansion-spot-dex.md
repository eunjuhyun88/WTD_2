# W-0291 — 패턴 스캔 유니버스 확장 (Spot + DEX All-Cap)

> Wave: MM Hunter | Priority: P1 | Effort: M
> Charter: In-Scope — L3 Pattern Object / L4 State Machine (corpus 확장)
> Status: 🟡 Design Draft
> Created: 2026-04-29 by Agent A078
> Issue: #569

---

## Goal

현재 ~400개 Binance 선물 종목에서 **Binance Spot ~2,000종목 + DexScreener DEX 롱테일 코인**으로 패턴 스캔 유니버스를 확장해 멤코인 포함 전체 시총 대상 패턴 발굴을 가능하게 한다.

---

## 배경 / 현재 문제

### 현황

`token_universe.py`는 `_fetch_futures_tickers()` (Binance `fapi/v1/ticker/24hr`)만 호출한다.

```python
# engine/data_cache/token_universe.py (현재)
def _fetch_futures_tickers(self) -> list[dict]:
    url = "https://fapi.binance.com/fapi/v1/ticker/24hr"
    # Binance 선물만 ~400종목
```

결과:
- 선물 없는 Spot-only 코인 스캔 불가 (대부분 소형주, 밈코인 포함)
- 패턴 엔진은 `feature_calc.py`에서 perp=None 시 graceful fallback 이미 구현됨
  - `funding_rate = 0`, `oi_change = 0`, `long_short_ratio = 1` (neutral)
  - volume-based 빌딩 블록은 spot volume으로 이미 작동

### 퀀트 관점

퀀트 표준 데이터 위생 문제: 선물 코인만 보면 **survivorship bias** 발생 (선물 상장 = 이미 성공한 코인). 롱테일·초기 코인 포함이 현실적 edge 추정에 필수.

---

## Scope

### 포함

- `engine/data_cache/token_universe.py` — `_fetch_spot_tickers()` 추가, 유니버스 병합
- `engine/data_cache/token_universe.py` — `_fetch_dex_universe()` 추가 (DexScreener top pairs)
- `engine/research/backtest.py` — `universe_filter` 파라미터 (예: `"futures_only"`, `"spot_and_futures"`, `"all"`)
- `engine/data_cache/fetch_binance.py` — Spot OHLCV 이미 작동 (변경 없음)
- `engine/scanner/feature_calc.py` — perp fallback 이미 구현됨 (변경 없음)

### 파일 (예상)

| 파일 | 상태 | 변경 |
|---|---|---|
| `engine/data_cache/token_universe.py` | 수정 | `_fetch_spot_tickers()` + `_fetch_dex_universe()` + 병합 |
| `engine/research/backtest.py` | 수정 | `universe_filter: str = "futures_only"` 파라미터 추가 |
| `engine/data_cache/tests/test_token_universe.py` | 수정 | spot/dex 유니버스 검증 |

### 변경 없음

- `engine/data_cache/fetch_binance.py` (SPOT klines 이미 `api/v3/klines`)
- `engine/scanner/feature_calc.py` (perp fallback 기존 구현)
- `engine/research/validation/` (별도 W-0290)
- `engine/building_blocks/` (volume trigger 이미 spot 호환)

---

## Non-Goals

- DEX 온체인 거래 직접 실행 — Charter §Frozen
- 무한 롱테일 (1d 거래량 $10K 미만 제외)
- token_universe 외 스케줄러 변경 (별도 D-시리즈 작업)

---

## CTO 관점

### Universe 병합 전략

```python
class TokenUniverse:
    def build(
        self,
        include_futures: bool = True,    # ~400
        include_spot: bool = True,        # ~2000 (futures 제외)
        include_dex: bool = False,        # DexScreener top pairs (선택)
        min_volume_usd_24h: float = 500_000,  # 저유동성 필터
        min_market_cap_usd: float = 0,    # 0 = 필터 없음
    ) -> list[UniverseToken]:
```

**병합 시 중복 처리**:
- Futures + Spot 중복 → futures 메타 우선 (oi/funding 있으면)
- DEX + CEX 중복 → CEX 메타 우선

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| Spot-only 코인 perp 데이터 없어서 feature_calc 오류 | 저 | 중 | perp=None fallback 이미 구현 (`feature_calc.py:1277`) |
| DEX 코인 OHLCV 갭 (비유동성 구간) | 고 | 중 | min_volume_usd_24h=500K 필터 + gap_tolerance 파라미터 |
| API rate limit (Binance spot 2000+ 종목) | 중 | 저 | batch 200, sleep 0.5s between batches |
| backtest.py 유니버스 확장 시 메모리 이슈 | 중 | 중 | `universe_filter="futures_only"` 기본값 유지 |
| DexScreener pair 중복 (같은 토큰 여러 페어) | 고 | 저 | base_token 기준 deduplicate |

### Dependencies

- **선행**: 없음 (독립 작업)
- **연관**: W-0290 Phase 1 (backtest.py universe_filter 파라미터 → W-0290 Phase 2 robustness.py 활용)

### Rollback Plan

- `universe_filter="futures_only"` 기본값 → 기존 동작 완전 보존
- `token_universe.py` append-only 확장
- `backtest.py` 기존 signature 유지

---

## AI Researcher 관점

### 유니버스 분류 (cap group)

W-0290 robustness.py의 4축 분할 중 **심볼(cap group)** 축에 필요:

```python
class UniverseToken:
    symbol: str          # "BTCUSDT"
    base: str            # "BTC"
    exchange: str        # "binance_futures" | "binance_spot" | "dexscreener"
    has_perp: bool       # OI/funding 사용 가능 여부
    volume_usd_24h: float
    market_cap_usd: float | None
    cap_group: str       # "mega" | "large" | "mid" | "small" | "micro"
```

Cap group 기준 (USD 마켓캡):
- mega: >$50B (BTC, ETH)
- large: $5B~$50B
- mid: $500M~$5B
- small: $50M~$500M
- micro: <$50M (롱테일, 밈코인)

### Survivorship Bias 완화

유니버스에 현재 상장폐지/거래 정지 종목 포함이 불가능한 경우(API 제한):
→ `data_hygiene.py`의 `survivorship_flag=WARNING` 표기 (W-0290 연계)
→ 연구 보고서에 "survivorship-biased corpus" 명기 의무

### Feature Coverage per Universe Tier

| Cap Group | klines | volume | funding/OI | social | on-chain |
|---|---|---|---|---|---|
| mega (BTC/ETH) | ✅✅ | ✅✅ | ✅✅ | ✅✅ | ✅✅ |
| large/mid | ✅✅ | ✅✅ | ✅ (선물만) | ✅ | 🟡 |
| small/micro spot | ✅ | ✅ | ❌ (spot-only) | 🟡 | ❌ |
| DEX | ✅ (DexScreener) | ✅ | ❌ | ❌ | 🟡 |

→ 패턴 블록 자동 필터링: has_perp=False → OI/funding 블록 비활성화

### Failure Modes

1. **잘못된 cap group** → robustness 분할 결과 오염. 완화: CoinGecko 마켓캡 cross-check
2. **DEX 페어 불안정** (유동성 이탈, rug pull 후 잔존 심볼) → min_volume + age 필터
3. **백테스트 메모리 폭발** (2000종목 × full history) → chunk by cap_group, lazy loading

---

## Decisions

| ID | 결정 | 선택 | 거절 |
|---|---|---|---|
| D-01 | 기본 유니버스 | `futures_only` 기본값 유지, `spot_and_futures` 옵션 | `all`을 기본값으로 (메모리/속도 위험) |
| D-02 | DEX 포함 | Phase 2에서 선택적 활성화 | Phase 1에서 기본 포함 (DexScreener 데이터 품질 검증 전) |
| D-03 | Cap group 기준 | CoinGecko 마켓캡 (daily 갱신) | 실시간 (불필요한 빈번 API 호출) |
| D-04 | 최소 거래량 | `min_volume_usd_24h = 500_000` | $0 (극소형 노이즈) / $1M (너무 좁음) |

---

## Open Questions

| # | 질문 | 제안 |
|---|---|---|
| Q-01 | DexScreener top pairs 기준? | 24h volume 상위 500개, base_token USDT 페어만 |
| Q-02 | Binance spot 종목 중 이미 선물도 있는 경우 중복 처리? | futures 메타 우선, symbol 재사용 |
| Q-03 | cap_group 계산: CoinGecko API 추가 또는 기존 데이터 재사용? | 기존 `fetch_coinmarketcap.py` or CoinGecko free tier |
| Q-04 | W-0290 backtest.py 파라미터와 연계 시점? | W-0291 merged → W-0290 Phase 2 robustness.py에서 활용 |

---

## Implementation Plan

### Phase 1 (D1~D3)

| 일 | 작업 | 출력물 |
|---|---|---|
| D1 | `_fetch_spot_tickers()` 구현 + volume 필터 + cap_group | Binance spot 유니버스 (futures 제외) |
| D2 | `UniverseToken` dataclass + 병합 로직 + `has_perp` 플래그 | 통합 유니버스 빌더 |
| D3 | `backtest.py` `universe_filter` 파라미터 + 테스트 | 기존 CI 유지 + spot 옵션 |

### Phase 2 (D4~D6)

| 작업 | 모듈 |
|---|---|
| `_fetch_dex_universe()` DexScreener top 500 pairs | token_universe.py |
| CoinGecko cap_group 조회 + 캐시 | token_universe.py |
| W-0290 robustness.py cap_group 축 연동 | 별도 PR (W-0290 dep) |

---

## Exit Criteria

- [ ] AC1: `token_universe.build(include_spot=True)` 실행 시 Binance futures + spot 합산 ≥ 1,500 종목
- [ ] AC2: `has_perp=False` 종목에서 `backtest.py` 실행 시 OI/funding 블록 graceful skip (오류 없음)
- [ ] AC3: `universe_filter="futures_only"` 기본값으로 기존 CI 전체 green
- [ ] AC4: `min_volume_usd_24h` 필터 적용 후 마이크로캡 필터링 확인
- [ ] AC5: PR merged + CURRENT.md SHA 업데이트

---

## References

- `engine/data_cache/token_universe.py` — `_fetch_futures_tickers()` (수정 대상)
- `engine/scanner/feature_calc.py:1277` — perp=None fallback (재사용)
- `engine/data_cache/fetch_binance.py` — SPOT klines `api/v3/klines` (재사용)
- `engine/data_cache/fetch_dexscreener.py` — DEX prices (재사용)
- `docs/data/14_DATA_INVENTORY.md` §9 — Universe별 데이터 완전성 요구
- W-0290 Phase 2 `robustness.py` — cap_group 4축 분할 (의존)
