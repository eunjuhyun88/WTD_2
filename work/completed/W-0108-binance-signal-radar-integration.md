# W-0108 바이낸스 Signal Radar v4.0 통합

## Goal

ALPHA HUNTER V4.0 PRO (바이낸스 시그널 레이더)의 4가지 신호 유형(GOLDEN / WHALE / SQUEEZE / IMBALANCE)을
WTD 빌딩 블록 + 패턴으로 이식한다.
단순 볼륨 스파이크 감지를 넘어 다이버전스 필터 + 동적 CVD 임계값 + 3x 볼륨 교차검증을 엔진화한다.

## Owner

engine

## Scope

- 4개 신호 유형 → 빌딩 블록 / 패턴 매핑 완성
- 신규 빌딩 블록: `cvd_price_divergence`, `orderbook_imbalance_ratio`, `relative_velocity_bull`
- 신규 패턴 1개: `radar-golden-entry-v1` (3/4 필터 충족 조건)
- 기존 WHALE/SQUEEZE 패턴 신호 강화 (선택적)
- 레이어별 유닛 테스트 작성

## Non-Goals

- WebSocket 실시간 스트리밍 파이프라인 구축 — 현재 REST 기반 피처 파이프라인 유지
- aggTrade 단건 WebSocket 수집 — 외부 스트림 의존, 별도 W
- 동적 심볼 프로모션/드모션 런타임 로직 (Radar → Sniper 2-tier) — 별도 UI 작업
- RSI 계산 블록 신규 작성 — 기존 피처에 없으면 피처 파이프라인 확장 선행 필요

## Canonical Files

- `engine/building_blocks/` — 모든 빌딩 블록 정의
- `engine/patterns/library.py` — 패턴 등록
- `engine/patterns/types.py` — PatternObject / PhaseCondition
- `/Users/ej/Library/Mobile Documents/com~apple~CloudDocs/바이낸스 시그널 레이더_v4.0.html` — 원본 JS 로직
- `work/active/W-0108-binance-signal-radar-integration.md` — 이 문서

---

## Signal Radar v4.0 원본 로직 분해

### 시스템 아키텍처

```
전체 심볼 (miniTicker WebSocket)
    → [RADAR FILTER] velocity ≥ 2.5 AND vol > $30K
    → 활성 Sniper 심볼 풀 (max ~20개, TTL 3분)
        → aggTrade + depth5 WebSocket 구독
        → [4가지 신호 판정] GOLDEN / WHALE / SQUEEZE / IMBALANCE
```

### 핵심 상수 (원본값)

| 변수 | 값 | 의미 |
|---|---|---|
| `radarVelocity` | 2.5 | 심볼 진입 속도 임계값 (volRatio = vol1m/avgVol1m) |
| `goldenVelocity` | 3.0 | GOLDEN 신호 속도 임계값 |
| `radarMinVol` | $30,000 | 최소 거래량 필터 |
| `minCvdBreakout` | $15,000 | 동적 CVD 최솟값 (max(15K, avgVol×0.15)) |
| `minWhaleTick` | $20,000 | 고래 단건 감지 임계값 (max(20K, avgVol×0.05)) |
| `imbRatio` | 3.0 | OB 매수/매도 불균형 비율 |
| `sqzPct` | 0.8% | SQUEEZE 감지 가격 범위 (18봉 기준) |
| `cvdFakeoutRatio` | 0.8 | Fakeout 감지: cvd < maxCvd×0.8 |

---

## 4가지 신호 유형 분해

### 1. GOLDEN ENTRY — "3/4 필터 동시 충족"

**원본 로직:**
```js
let score = 0;
if (m.velocity >= 3.0 && m.rsi >= 55) score++;          // 필터 1: 모멘텀+RSI
if (cvd > dynCvdTarget && !fakeout) score++;              // 필터 2: CVD 돌파 + 다이버전스 없음
if (avgImbalance >= 3.0 && isPriceRising) score++;        // 필터 3: OB 불균형 + 가격 상승
if (m.velocity / btcVelocity >= 1.2) score++;             // 필터 4: BTC 대비 상대 강도
if (score >= 3) → GOLDEN 신호
```

**dynCvdTarget** = max(15,000, avgVol × 0.15)

**Fakeout 조건:**
```js
price >= maxPrice × 0.999 AND cvd < maxCvd × 0.8
→ 가격 신고가인데 CVD가 피크 대비 20% 이상 하락 = 매수세 소진 경고
```

**WTD 매핑:**

| 필터 | 원본 | WTD 블록 현황 | 대응 전략 |
|---|---|---|---|
| 필터 1 모멘텀 | velocity ≥ 3.0 | `vol_acceleration` (≥1.8) | 임계값 3.0으로 상향 가능 |
| 필터 1 RSI | rsi ≥ 55 | ❌ 없음 | `rsi_above_midline` 신규 블록 필요 |
| 필터 2 CVD | cvd > dynCvdTarget | `delta_flip_positive` (방향만) | `cvd_momentum_threshold` 신규 블록 필요 |
| 필터 2 Fakeout | price ≥ high AND cvd < peak×0.8 | ❌ 없음 | **`cvd_price_divergence` 신규 블록** |
| 필터 3 OB 불균형 | avgImbalance ≥ 3.0 | `absorption_signal` (간접) | **`orderbook_imbalance_ratio` 신규 블록** |
| 필터 3 가격 상승 | isPriceRising | `recent_rally` | ✅ 있음 |
| 필터 4 BTC 대비 강도 | velocity/btcVelocity ≥ 1.2 | `alt_btc_accel_ratio` | ✅ 있음 (W-0097 구현) |

---

### 2. WHALE — "고래 단건 감지"

**원본 로직:**
```js
// aggTrade 스트림에서 단건 거래 감지
if (trade.m === false && tradeVal >= dynWhaleTarget) {
    // buyer-initiated (taker = buyer)
    → WHALE BUY 신호
}
dynWhaleTarget = max(20,000, avgVol × 0.05)
```

**WTD 매핑:**

| 조건 | 원본 | WTD 블록 현황 | 대응 |
|---|---|---|---|
| 단건 매수 대규모 | trade ≥ max(20K, vol×0.05) | `smart_money_accumulation` (부분) | 임계값 조정으로 활용 가능 |
| 매수자 주도 | taker = buyer | `delta_flip_positive` (방향) | ✅ 간접 커버 |
| 동적 임계값 | max(20K, avgVol×0.05) | `volume_spike` (고정 배수) | ⚠️ 동적화 필요 |

**→ 기존 `smart_money_accumulation` + `volume_spike` 조합으로 대부분 구현 가능**
**→ WHALE 패턴은 신규 보다 기존 WHALE_ACCUMULATION 패턴 강화로 처리**

---

### 3. SQUEEZE — "압축 후 CVD 선행"

**원본 로직:**
```js
// 18봉 가격 범위 체크
const priceRange = (maxPrice - minPrice) / minPrice;
if (priceRange <= 0.008) {  // 0.8% 이내
    if (cvd > dynCvdTarget * 0.5) → SQUEEZE 신호 (CVD 선행 축적)
}
```

**WTD 매핑:**

| 조건 | 원본 | WTD 블록 현황 | 대응 |
|---|---|---|---|
| 가격 압축 ≤ 0.8% (18봉) | priceRange ≤ sqzPct | `bollinger_squeeze` | ✅ 있음 (BB 기반) |
| 압축 지속 기간 | 18봉 | `sideways_compression` | ✅ 있음 |
| CVD 선행 축적 | cvd > target×0.5 | `delta_flip_positive` | ⚠️ 절대량 체크 없음 |

**→ `bollinger_squeeze` + `delta_flip_positive` 조합으로 대부분 커버**
**→ `volatility-squeeze-breakout-v1` 패턴 (W-0107)이 이 신호의 WTD 버전**

---

### 4. IMBALANCE — "OB 매수 쏠림"

**원본 로직:**
```js
const avgImbalance = recentImbalances.avg();  // bidVol/askVol 이동평균
if (avgImbalance >= 3.0 && isPriceRising) → IMBALANCE 신호
// bidVol = Σ bid[i].qty × bid[i].price (매수벽 달러량)
// askVol = Σ ask[i].qty × ask[i].price (매도벽 달러량)
```

**WTD 매핑:**

| 조건 | 원본 | WTD 블록 현황 | 대응 |
|---|---|---|---|
| bid/ask 달러 비율 ≥ 3.0 | avgImbalance ≥ 3.0 | ❌ 없음 | **`orderbook_imbalance_ratio` 신규** |
| 가격 상승 | isPriceRising | `recent_rally` | ✅ 있음 |
| OB 데이터 소스 | depth5 WebSocket | REST `/depth?limit=5` | ✅ 이미 수집 중 |

---

## 신규 빌딩 블록 설계

### 1. `cvd_price_divergence` (disqualifiers/)

**목적:** 가격이 신고가인데 CVD가 피크에서 하락 → fakeout 경고 (제외 조건)

```python
def cvd_price_divergence(
    ctx: Context,
    *,
    price_lookback: int = 20,   # 신고가 체크 윈도우 (봉)
    cvd_drop_ratio: float = 0.8, # CVD가 피크 대비 이 비율 아래면 divergence
) -> pd.Series:
    """Return True (disqualify) when price is at recent high but CVD is declining.

    Signal Radar Fakeout: price >= maxPrice*0.999 AND cvd < maxCvd*0.8
    """
    price = ctx.klines["close"].reindex(ctx.features.index)
    cvd = ctx.features["cvd_cumulative"]  # 또는 대리 지표

    price_at_high = price >= price.rolling(price_lookback).max() * 0.999
    cvd_peak = cvd.rolling(price_lookback).max()
    cvd_declining = cvd < cvd_peak * cvd_drop_ratio

    return (price_at_high & cvd_declining).fillna(False)
```

**필요 피처:** `cvd_cumulative` (누적 CVD) — 현재 `delta_flip_positive`는 방향만, 누적량 없음

---

### 2. `orderbook_imbalance_ratio` (confirmations/)

**목적:** OB 매수벽 달러량 / 매도벽 달러량 비율 임계값 초과

```python
def orderbook_imbalance_ratio(
    ctx: Context,
    *,
    min_ratio: float = 3.0,     # bid/ask 달러 비율 (Signal Radar: 3.0)
    smoothing: int = 3,          # 이동평균 봉 수
) -> pd.Series:
    """Return True when buy-side order book dollar volume significantly exceeds sell-side.

    Data: ctx.features["ob_bid_usd"] / ctx.features["ob_ask_usd"]
    Source: Binance /depth?limit=5 (already collected per W-0107 assumptions)
    """
    bid = ctx.features["ob_bid_usd"]
    ask = ctx.features["ob_ask_usd"]
    ratio = (bid / ask.replace(0, float("nan"))).fillna(1.0)
    smooth_ratio = ratio.rolling(smoothing, min_periods=1).mean()
    return (smooth_ratio >= min_ratio).fillna(False).astype(bool)
```

**필요 피처:** `ob_bid_usd`, `ob_ask_usd` — 현재 피처 파이프라인에 없음 (L4 분석과 동일 gap)

---

### 3. `relative_velocity_bull` (confirmations/)

**목적:** 해당 심볼의 볼륨 가속도가 BTC 대비 유의미하게 높음

```python
def relative_velocity_bull(
    ctx: Context,
    *,
    min_ratio: float = 1.2,   # 심볼 속도 / BTC 속도 ≥ 1.2 (Signal Radar 기준)
) -> pd.Series:
    """Return True when this symbol's rolling velocity exceeds BTC's by min_ratio.

    Wraps alt_btc_accel_ratio feature (W-0097).
    """
    ratio = ctx.features["alt_btc_accel_ratio"]
    return (ratio >= min_ratio).fillna(False).astype(bool)
```

**필요 피처:** `alt_btc_accel_ratio` — ✅ W-0097에서 구현됨

---

## 신규 패턴 설계

### `radar-golden-entry-v1` (3/4 필터 방식)

```python
PatternObject(
    slug="radar-golden-entry-v1",
    direction="long",
    phases=[
        PhaseCondition(
            name="RADAR_CONFIRM",  # 볼륨+속도 기본 조건
            required_blocks=["volume_surge_bull"],  # vol_acceleration ≥ 2.5 상당
            soft_blocks=["recent_rally"],
        ),
        PhaseCondition(
            name="SIGNAL_CLUSTER",  # 3/4 필터 (required_any_groups 활용)
            required_blocks=[],
            required_any_groups=[
                # 필터 1: 모멘텀
                ["volume_surge_bull"],
                # 필터 2: CVD (fakeout 없음)
                ["delta_flip_positive", "absorption_signal"],
                # 필터 3: OB 불균형 + 가격 상승
                ["orderbook_imbalance_ratio", "recent_rally"],
                # 필터 4: BTC 대비 상대강도
                ["relative_velocity_bull"],
            ],
            # 4개 중 3개 충족 → Phase Gate threshold=0.75
            threshold=0.75,
            soft_blocks=[],
        ),
        PhaseCondition(
            name="ENTRY",
            required_blocks=["bollinger_expansion"],
            soft_blocks=["higher_lows_sequence"],
        ),
    ],
)
```

> **참고:** `required_any_groups`는 각 그룹에서 1개 이상 충족 시 해당 필터 통과.
> 4개 그룹 중 3개 이상(threshold=0.75) 통과 시 SIGNAL_CLUSTER 완료.

---

## 전체 빌딩 블록 조합 목록

Signal Radar 4개 신호별로 조합 가능한 기존 블록 전체 매핑.
`✅ 직접` = 그대로 사용 / `⚠️ 간접` = 파라미터 조정 or 근사 / `❌ 신규` = 구현 필요

---

### TRIGGERS (가격/볼륨 이벤트 트리거)

| 블록 | 파라미터 | GOLDEN | WHALE | SQUEEZE | IMBALANCE | 비고 |
|---|---|---|---|---|---|---|
| `volume_spike` | factor=3.0, window=20 | ✅ 직접 (필터1 velocity 대리) | ✅ 직접 | ⚠️ 간접 | ⚠️ 간접 | 단일봉 기준 |
| `volume_spike_down` | factor=3.0, window=20 | — | — | ⚠️ SHORT용 | — | 매도 압력 |
| `breakout_above_high` | lookback=20 | ✅ 직접 (GOLDEN 가격 상승) | — | ✅ SQUEEZE 탈출 | ✅ 직접 | 7/30일 고가 돌파 |
| `breakout_volume_confirm` | — | ✅ 직접 | ✅ 직접 | ✅ SQUEEZE 탈출 확인 | — | 볼륨 동반 돌파 |
| `breakout_from_pullback_range` | — | ⚠️ 간접 | — | ⚠️ 간접 | — | 풀백 후 돌파 |
| `consolidation_then_breakout` | — | ⚠️ 간접 | — | ✅ 직접 | — | 압축 후 돌파 |
| `recent_rally` | lookback=5, min_pct=0.01 | ✅ 직접 (필터3 isPriceRising) | — | — | ✅ 직접 (isPriceRising) | 단기 상승 확인 |
| `recent_decline` | lookback=5, min_pct=0.01 | — (SHORT 전환 시) | — | — | — | SHORT 패턴용 |
| `gap_up` | min_gap_pct=0.005 | ⚠️ 간접 | — | — | — | 갭 상승 |
| `gap_down` | min_gap_pct=0.005 | — | — | — | — | SHORT 패턴용 |

---

### CONFIRMATIONS (진입 조건 강화)

| 블록 | 파라미터 | GOLDEN | WHALE | SQUEEZE | IMBALANCE | 비고 |
|---|---|---|---|---|---|---|
| `vol_acceleration` (via `volume_surge_bull`) | surge_factor=1.8 | ✅ 직접 (필터1 velocity≥2.5 → factor 조정) | ✅ 직접 | ⚠️ 간접 | ⚠️ 간접 | W-0107 신규 |
| `volume_surge_bear` | surge_factor=1.8 | — | — | — | ❌ SHORT용 | W-0107 신규 |
| `delta_flip_positive` | — | ✅ 직접 (필터2 CVD 방향) | ✅ 직접 | ✅ 직접 (CVD 축적) | ✅ 직접 | CVD 매수 전환 |
| `absorption_signal` | — | ✅ 직접 (필터2 CVD 보조) | ✅ 직접 | ✅ 직접 | ✅ 직접 | 매도 물량 흡수 |
| `smart_money_accumulation` | threshold | ⚠️ 간접 | ✅ 직접 (WHALE 핵심) | ⚠️ 간접 | ⚠️ 간접 | OKX 온체인 기반 |
| `alt_btc_accel_ratio` | min_ratio=1.2, window=20 | ✅ 직접 (필터4 velocity/btc≥1.2) | ✅ 직접 | ⚠️ 간접 | ✅ 직접 | W-0097 구현 |
| `bollinger_squeeze` | lookback=50, threshold=0.35 | — | — | ✅ 직접 (18봉 범위≤0.8%) | — | BB 수축 감지 |
| `bollinger_expansion` | — | ✅ 직접 (ENTRY 확인) | — | ✅ SQUEEZE 탈출 후 | — | BB 확장 = 돌파 |
| `sideways_compression` | min_bars=10 | ⚠️ 간접 | — | ✅ 직접 | ⚠️ 간접 | 횡보 압축 |
| `higher_lows_sequence` | lookback=5, count=3 | ✅ 직접 (ENTRY 후 추세 확인) | ✅ 직접 | ✅ SQUEEZE 후 | — | 상승 저점 구조 |
| `funding_extreme` | threshold=0.01, direction="positive" | ⚠️ 간접 | — | ⚠️ 간접 | — | FR 과열 = L2 |
| `funding_flip` | — | ⚠️ 간접 | — | — | — | FR 전환 |
| `positive_funding_bias` | — | ⚠️ 간접 | — | — | — | FR 양수 지속 |
| `liq_zone_squeeze_setup` | threshold_fr=0.0005, threshold_oi=0.03 | ✅ 직접 (롱과밀 구조) | — | ✅ 직접 | ⚠️ 간접 | W-0107 신규 |
| `oi_change` | window, threshold | ⚠️ 간접 | ✅ 직접 (OI 증가 = 신규매수) | ⚠️ 간접 | ⚠️ 간접 | OI 증감률 |
| `oi_expansion_confirm` | — | ✅ 직접 | ✅ 직접 | ⚠️ 간접 | ⚠️ 간접 | 신규 포지션 확인 |
| `oi_spike_with_dump` | — | — | ⚠️ 반대 신호 체크 | — | — | 청산 덤프 |
| `oi_hold_after_spike` | — | ✅ 직접 | ✅ 직접 | ⚠️ 간접 | — | 스파이크 후 유지 |
| `total_oi_spike` | — | ⚠️ 간접 | ✅ 직접 | — | — | 전체 OI 급증 |
| `oi_exchange_divergence` | — | ⚠️ 간접 | ✅ 직접 | — | — | 거래소간 OI 괴리 |
| `ls_ratio_recovery` | — | ✅ 직접 (롱/숏 비율 정상화) | ✅ 직접 | ⚠️ 간접 | — | L/S ratio |
| `cvd_state_eq` | state="BULL" | ✅ 직접 (CVD 상태 확인) | ✅ 직접 | ✅ 직접 | ✅ 직접 | CVD 상태 이진 |
| `coinbase_premium_positive` | — | ✅ 직접 (미국 매수 수요) | ✅ 직접 | ⚠️ 간접 | ⚠️ 간접 | 코베 프리미엄 |
| `reclaim_after_dump` | — | ⚠️ 간접 | ⚠️ 간접 | ⚠️ 간접 | — | 덤프 후 회복 |
| `post_dump_compression` | — | ⚠️ 간접 | — | ✅ 직접 | — | 덤프 후 횡보 |
| `volume_dryup` | threshold=0.5, window=3 | — | — | ✅ 직접 (SQUEEZE 내 거래량 감소) | — | 거래량 소멸 |
| `range_break_retest` | — | ⚠️ 간접 | — | ✅ 직접 | ⚠️ 간접 | 돌파 후 리테스트 |
| `golden_cross` | fast=50, slow=200 | ⚠️ 간접 | — | ⚠️ 간접 | — | MA 골든크로스 |
| `dead_cross` | — | — | — | — | — | SHORT 패턴용 |
| `ema_pullback` | ema_period=20 | ⚠️ 간접 | — | ⚠️ 간접 | — | EMA 눌림 |
| `fib_retracement` | — | ⚠️ 간접 | — | ⚠️ 간접 | — | 피보나치 되돌림 |

---

### ENTRIES (최종 진입 캔들 패턴)

| 블록 | 파라미터 | GOLDEN | WHALE | SQUEEZE | IMBALANCE | 비고 |
|---|---|---|---|---|---|---|
| `bullish_engulfing` | — | ✅ 직접 | ✅ 직접 | ✅ 직접 | ✅ 직접 | 강세 삼킴 |
| `long_lower_wick` | min_ratio=2.0 | ✅ 직접 | ✅ 직접 | ✅ 직접 | ✅ 직접 | 긴 아래 꼬리 |
| `support_bounce` | — | ✅ 직접 | ✅ 직접 | ⚠️ 간접 | ✅ 직접 | 지지선 반등 |
| `rsi_threshold` | period=14, threshold=55, above=True | ✅ **직접 (필터1 RSI≥55)** | ✅ 직접 | ⚠️ 간접 | ⚠️ 간접 | ← 이미 존재! |
| `rsi_bullish_divergence` | — | ✅ 직접 | ✅ 직접 | ✅ 직접 | — | RSI 강세 다이버전스 |
| `rsi_bearish_divergence` | — | — | — | — | — | SHORT 패턴용 |
| `bearish_engulfing` | — | — | — | — | — | SHORT 패턴용 |
| `long_upper_wick` | — | — | — | — | — | SHORT 패턴용 |

---

### DISQUALIFIERS (제외 조건)

| 블록 | 파라미터 | GOLDEN | WHALE | SQUEEZE | IMBALANCE | 비고 |
|---|---|---|---|---|---|---|
| `extreme_volatility` | threshold=2.0 | ✅ 직접 (과도한 변동성 제외) | ✅ 직접 | ✅ 직접 | ✅ 직접 | ATR 과열 제외 |
| `extended_from_ma` | ma_period=20, max_pct=0.05 | ✅ 직접 (MA 과이탈 제외) | — | — | ✅ 직접 | 과매수 제외 |
| `volume_below_average` | threshold=0.5, window=20 | ✅ 직접 | ✅ 직접 | — | ✅ 직접 | 저거래량 제외 |

---

### W-0107/W-0108 신규 블록

| 블록 | 카테고리 | GOLDEN | WHALE | SQUEEZE | IMBALANCE | 상태 |
|---|---|---|---|---|---|---|
| `atr_ultra_low` | confirmations | ✅ 직접 (압축 국면) | — | ✅ 직접 | — | ✅ 구현됨 |
| `volume_surge_bull` | confirmations | ✅ 직접 (필터1 velocity) | ✅ 직접 | ✅ 직접 | ✅ 직접 | ✅ 구현됨 |
| `volume_surge_bear` | confirmations | — | — | — | — | ✅ 구현됨 (SHORT용) |
| `liq_zone_squeeze_setup` | confirmations | ✅ 직접 | — | ✅ 직접 | — | ✅ 구현됨 |
| `relative_velocity_bull` | confirmations | ✅ 직접 (필터4) | ✅ 직접 | — | ✅ 직접 | ❌ 신규 필요 |
| `cvd_price_divergence` | disqualifiers | ✅ **핵심 (Fakeout 필터2)** | — | ⚠️ 간접 | — | ❌ 신규 필요 |
| `orderbook_imbalance_ratio` | confirmations | ✅ **직접 (필터3)** | — | — | ✅ **핵심** | ❌ 신규 필요 |

---

### GOLDEN 신호 필터별 블록 조합 요약

```
필터 1 (velocity ≥ 3.0 AND RSI ≥ 55):
  required_any: [volume_surge_bull(surge_factor=2.5), rsi_threshold(threshold=55)]

필터 2 (CVD 돌파 AND NOT fakeout):
  required: [delta_flip_positive]
  soft: [absorption_signal, cvd_state_eq(state="BULL")]
  disqualifier: [cvd_price_divergence]  ← Slice 2

필터 3 (OB 불균형 ≥ 3.0 AND 가격 상승):
  required_any: [orderbook_imbalance_ratio(min_ratio=3.0), recent_rally]  ← Slice 2
  Slice 1 대리: [absorption_signal, recent_rally]

필터 4 (velocity / btcVelocity ≥ 1.2):
  required: [relative_velocity_bull(min_ratio=1.2)]  ← Slice 1 신규
  Slice 1 대리: [alt_btc_accel_ratio(min_ratio=1.2)]
```

---

## 구현 순서 (Priority)

### Slice 1 — 즉시 (이번 세션)

1. **`relative_velocity_bull`** 블록 작성 (alt_btc_accel_ratio 래퍼, 30분)
2. **`radar-golden-entry-v1`** 패턴 등록 (기존 블록만으로 구성 가능한 버전 먼저)
   - 필터 1: `volume_surge_bull` (surge_factor=2.5)
   - 필터 2: `delta_flip_positive`
   - 필터 3: `recent_rally` (OB 블록 없을 때 대리)
   - 필터 4: `relative_velocity_bull`
3. 유닛 테스트 + 전체 테스트 통과

### Slice 2 — 다음 세션

1. **`cvd_price_divergence`** disqualifier 블록
   - 선결: `cvd_cumulative` 피처 확인 or 근사 지표 사용
2. **`orderbook_imbalance_ratio`** 블록
   - 선결: `ob_bid_usd` / `ob_ask_usd` 피처 파이프라인 확인
3. `radar-golden-entry-v1` 패턴 업데이트 (신규 블록으로 필터 정확도 향상)

### Slice 3 — 별도 W

- 실시간 aggTrade 단건 WebSocket → WHALE 단건 감지 파이프라인
- Radar → Sniper 2-tier 런타임 프로모션 로직 (UI 연동)
- RSI 피처 추가 (필터 1 완전 구현용)

---

## WTD 기존 블록 커버리지 요약

| Signal Radar 구성요소 | WTD 현황 | 상태 |
|---|---|---|
| 볼륨 가속도 (velocity) | `vol_acceleration` | ✅ 있음 |
| 방향성 볼륨 (bull 확인) | `volume_surge_bull` | ✅ W-0107 구현 |
| CVD 방향 전환 | `delta_flip_positive` | ✅ 있음 |
| 가격 상승 확인 | `recent_rally` | ✅ 있음 |
| BTC 대비 상대강도 | `alt_btc_accel_ratio` | ✅ W-0097 구현 |
| BB 압축 (SQUEEZE) | `bollinger_squeeze` | ✅ 있음 |
| 횡보 압축 | `sideways_compression` | ✅ 있음 |
| 고래 누적 (WHALE 간접) | `smart_money_accumulation` | ✅ 있음 |
| 흡수 패턴 | `absorption_signal` | ✅ 있음 |
| **CVD-Price Divergence** | ❌ 없음 | **신규 필요** |
| **OB 불균형 비율** | ❌ 없음 | **신규 필요** |
| **상대 속도 래퍼** | ❌ 직접 블록 없음 | **신규 (간단)** |
| RSI ≥ 55 | ❌ 없음 | 피처 파이프라인 선행 필요 |
| aggTrade 단건 감지 | ❌ 스트리밍 필요 | Slice 3 |

---

## Facts

- Signal Radar v4.0 원본 파일: 615줄 JavaScript (바이낸스 시그널 레이더_v4.0.html)
- GOLDEN 신호: 4개 필터 중 3개 이상 충족 (score ≥ 3)
- SQUEEZE: 18봉 가격 범위 ≤ 0.8% AND CVD > dynCvdTarget×0.5
- WHALE: aggTrade 단건 ≥ max($20K, avgVol×5%) AND buyer-initiated
- IMBALANCE: avgImbalance (bid$/ask$ rolling mean) ≥ 3.0 AND 가격 상승
- `alt_btc_accel_ratio` 피처: W-0097에서 구현됨 (현재 사용 가능)
- Binance `/depth?limit=5` REST: 이미 수집 중으로 가정 (W-0107 L4 분석과 동일)
- 현재 969 tests passing (W-0107 커밋 후)

## Assumptions

- `alt_btc_accel_ratio`가 velocity/btcVelocity 개념과 동일하게 작동 (W-0097 구현 기준)
- Binance OB depth REST 이미 수집 → `ob_bid_usd`/`ob_ask_usd` 피처 파이프라인 추가만 하면 됨
- RSI 없이 필터 1을 `volume_surge_bull`(surge_factor=2.5)로 대리 가능 (Slice 1에서 임시)
- CVD 누적량(`cvd_cumulative`) 없으면 `delta_flip_positive` 방향 신호로 우선 대리

## Open Questions

- `cvd_cumulative` 피처가 현재 파이프라인에 있는가? 없다면 `absorption_signal`로 대리 가능한가?
- `required_any_groups`에서 4개 그룹 중 3개 충족 threshold 구현이 현재 PhaseCondition 지원하는가?
  → 현재 `threshold` 파라미터 확인 필요 (`engine/patterns/types.py`)

## Next Steps

1. `relative_velocity_bull` 블록 작성 (Slice 1 즉시)
2. `radar-golden-entry-v1` 패턴 Slice 1 버전 등록 + 테스트
3. `cvd_cumulative` 피처 존재 여부 확인 → Slice 2 설계 확정
4. PhaseCondition `threshold` 파라미터 지원 여부 확인

## Exit Criteria

- Slice 1: `radar-golden-entry-v1` 등록 + 테스트 통과 + 백테스트 신호 수 50~2000
- Slice 2: `cvd_price_divergence` + `orderbook_imbalance_ratio` 블록 + 패턴 강화
- Slice 3: 실시간 스트리밍 파이프라인 (별도 W)

## Handoff Checklist

- Signal Radar v4.0 전체 JS 분석 완료 (원본: 바이낸스 시그널 레이더_v4.0.html, 615줄)
- 4가지 신호 유형 모두 분해: GOLDEN/WHALE/SQUEEZE/IMBALANCE
- 기존 WTD 블록 커버리지 확인: 9개 ✅, 3개 신규 필요
- Slice 1: `relative_velocity_bull` + `radar-golden-entry-v1` (기존 블록 기반)
- 외부 스트리밍(aggTrade/depth WebSocket)은 Slice 3으로 분리
