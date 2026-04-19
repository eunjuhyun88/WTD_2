# W-0109 Post-ETF 시장구조 신호 시스템

## Goal

ForeDex 분석 보고서(2025~2026)가 제시한 ETF 이후 구조적 변화 4가지를
WTD 빌딩 블록 + 패턴으로 이식한다.

**핵심 전제:** ETF 승인 이후 단일 거래소 CVD / 온체인 주소 등 기존 지표의
방향성 신뢰도가 저하됨. 대신 **교차검증 + 구조적 이탈 패턴**이 신호 기준이 됨.

## Owner

engine

## Source

ForeDex "ETF 이후 비트코인 시장구조 변화" 보고서 (저자: @mignoletkr)
핵심 관찰 4가지:
1. 온체인 활동 — 거래소 → 수탁기관 이동으로 온체인 신호 약화
2. 기술적 지표 — 파이사이클/200W MA 과열신호 둔화
3. 시장 참여자 — 고래 현물 CVD vs 가격 역행 (헤지 구조 매도)
4. OTC 유동성 — OTC 매수 유동성 감소 → 거래소 유입 증가 → 하락

---

## 보고서 방법론 분해 및 WTD 구현 가능성 평가

### M1. 고래 현물 CVD vs 가격 역행 (Spot Whale CVD Decoupling)

**원본 관찰:**
> "바이낸스 고래(100만~1000만) 현물 CVD는 지속 상승인데 가격은 하락 → 헤지 구조 매도"

**해석:**
ETF 이전: CVD 상승 = 실제 매수 압력
ETF 이후: CVD 상승 + 가격 하락 = 시장조성자가 현물 매수하면서 선물 매도 헤지
→ 표면적 CVD 신호가 방향성 오판을 유발

**WTD 구현 가능성:** ✅ 핵심 신규 블록 1개

```
신규 disqualifier: `cvd_spot_price_divergence_bear`
조건: cvd 방향 = 상승 (delta_flip_positive) AND 가격 방향 = 하락 (recent_decline)
→ 두 신호가 3봉 이상 지속 역행 시 disqualify (헤지 구조 = 실제 약세)

기존 `cvd_price_divergence`(W-0108)와 차이:
  - W-0108: 가격 신고가 + CVD 하락 → 단기 fakeout (매수세 소진)
  - W-0109: CVD 상승 + 가격 하락 지속 → 구조적 헤지 매도 (기관 분배)
```

**활용 패턴:** GOLDEN/WHALE 진입 시 disqualifier로 추가

---

### M2. 다중 거래소 분산 유입 패턴 (Multi-Exchange Coordinated Flow)

**원본 관찰:**
> "300~500 BTC 단위로 바이낸스/OKX/바이빗/비트스탬프/코인베이스에 분산 동시 유입
>  → 단일 거래소에서 감지 불가, 전체 합산 시 대규모 기관 매도 준비"

**해석:**
단일 거래소 볼륨 스파이크 = 노이즈
여러 거래소 동시 유입 + 코인베이스 프리미엄 하락 = 기관 분배 시작 신호

**WTD 구현 가능성:** ⚠️ 부분 구현 가능

```
근사 신호 조합 (기존 블록):
  - `coinbase_premium_positive` 역이용: 프리미엄 하락 = 미국 기관 수요 약화
  - `oi_exchange_divergence`: 거래소 간 OI 괴리 = 분산 포지셔닝 신호
  - `total_oi_spike` + 가격 하락 동시 발생 = 신규 매도 포지션 누적

신규 disqualifier 근사: `coinbase_premium_weak`
  조건: coinbase_premium < 0 (코베 프리미엄 음전환)
  → 기관 미국 수요 약화 = 상승 패턴 disqualify

미구현 이유: 다중 거래소 동시 유입량 집계는 피처 파이프라인 미지원
```

**활용 패턴:** 기관 분배 패턴 (`institutional-distribution-v1`)의 Phase 1 조건

---

### M3. OTC 매수 유동성 약화 프록시 (OTC Buy Liquidity Exhaustion Proxy)

**원본 관찰:**
> "OTC 매수 유동성 감소 → 기관 보유 BTC 거래소 재유입 → 매도 압력 증가
>  지난해 Q2부터 관찰됨"

**해석:**
OTC 유동성은 직접 측정 불가 (비공개 장외 거래)
하지만 코인베이스 프리미엄, 거래소 넷플로우, 파생 OI 변화로 프록시 가능

**WTD 구현 가능성:** ⚠️ 프록시 3개 조합

```
프록시 신호 세트:
  1. `coinbase_premium_positive` 하락 → 기관 현물 매수 수요 약화
  2. `smart_money_accumulation` 약화 → OKX 온체인 매집 감소
  3. `oi_change` 음수 전환 → 기존 포지션 청산 시작

신규 확인 패턴 `otc_liquidity_proxy`:
  required_any: [
    [coinbase_premium_negative → 역으로 사용],
    [smart_money_accumulation 역전 감지],
    [oi_change with recent_decline],
  ]
  → 2/3 충족 시 OTC 유동성 약화 신호
```

**활용 패턴:** SHORT 패턴 (`institutional-distribution-v1`)의 Phase 2 진입 조건

---

### M4. 장기보유자 공급 이동 속도 (LTH Distribution Rate)

**원본 관찰:**
> "ETF 이후 LTH 공급 감소가 더 점진적 — 여러 단계에 걸쳐 분산됨
>  MVRV, 파이사이클 극단 신호 약화"

**해석:**
단기 LTH 급감 = 없음. 대신 "점진적이고 분산된 분배"가 특징
→ 단일 지표로 고점 판단 불가 → 복합 신호 필요

**WTD 구현 가능성:** ❌ 외부 API 필요

```
필요 데이터: Glassnode LTH Supply, MVRV-Z score
현재 파이프라인: 없음
프록시 불가 (충분한 근사 없음)

→ W-0110 (외부 온체인 API 통합) 예정으로 이관
```

---

### M5. 사이클 지표 보완 복합 신호 (Cycle Indicator Enhancement)

**원본 관찰:**
> "파이사이클/200W MA 단독으로는 더 이상 고점 신호 생성 어려움
>  → 여러 지표의 동시 약화를 복합 감지해야 함"

**해석:**
단일 지표 → 복합 지표로 패러다임 전환 필요
WTD 엔진이 이미 채택한 방향 (PhaseCondition 다중 required_any_groups)과 일치

**WTD 구현 가능성:** ✅ 기존 구조 활용

```
기존 아키텍처로 대응:
  - `required_any_groups` + `threshold=0.75` (3/4 필터)
  - `extreme_volatility` disqualifier로 과열 제외
  - `funding_extreme` + `oi_spike_with_dump` 복합 = 고점 near 신호

→ 신규 블록 불필요, 패턴 설계로 해결
```

---

## 신규 패턴 설계: `institutional-distribution-v1`

ETF 이후 기관 분배 패턴 — SHORT direction

```python
PatternObject(
    slug="institutional-distribution-v1",
    direction="short",
    phases=[
        PhaseCondition(
            name="CVD_DECOUPLING",     # M1: CVD 상승 + 가격 하락
            required_blocks=["recent_decline"],
            required_any_groups=[
                ["delta_flip_positive", "cvd_spot_price_divergence_bear"],  # CVD-가격 역행
                ["oi_expansion_confirm", "recent_decline"],  # OI 증가 + 가격 하락 = 신규 매도
            ],
            threshold=0.5,
            disqualifiers=["higher_lows_sequence"],  # 저점 상승 중이면 제외
        ),
        PhaseCondition(
            name="LIQUIDITY_WEAKENING",  # M2+M3: OTC/기관 수요 약화
            required_blocks=[],
            required_any_groups=[
                ["oi_exchange_divergence"],          # 거래소간 OI 괴리 (분산 유입)
                ["oi_spike_with_dump"],              # OI 급증 + 가격 덤프
                ["total_oi_spike", "recent_decline"],# 전체 OI 증가 + 하락
            ],
            threshold=0.33,  # 3개 중 1개
            soft_blocks=["funding_extreme"],
        ),
        PhaseCondition(
            name="SHORT_ENTRY",          # 캔들 진입 확인
            required_blocks=[],
            required_any_groups=[
                ["bearish_engulfing"],
                ["long_upper_wick"],
                ["volume_surge_bear"],
            ],
            threshold=0.33,
            disqualifiers=["bollinger_squeeze"],  # 압축 중이면 진입 금지
        ),
    ],
)
```

---

## 신규 빌딩 블록 설계

### `cvd_spot_price_divergence_bear` (disqualifiers/)

**M1에서 도출 — CVD 방향 vs 가격 방향 지속 역행**

```python
def cvd_spot_price_divergence_bear(
    ctx: Context,
    *,
    lookback: int = 3,          # 역행 지속 최소 봉 수
    min_price_drop: float = 0.005,  # 가격 하락 최소 폭 (0.5%)
) -> pd.Series:
    """Disqualify when CVD direction is bullish but price is declining — institutional hedge signal.

    ETF 이후 패턴: 시장조성자 현물 매수 + 선물 공매도 헤지
    → CVD는 오르지만 가격은 내려가는 역행 구조
    → 표면적 CVD 신호를 믿으면 안 됨 → disqualify

    차이 vs cvd_price_divergence (W-0108):
      - W-0108: 가격 신고가 + CVD 하락 (단기 fakeout, 매수세 소진)
      - W-0109: CVD 상승 + 가격 하락 지속 (구조적 헤지, 기관 분배)
    """
    close = ctx.klines["close"].reindex(ctx.features.index)
    cvd = ctx.features.get("cvd_cumulative", ctx.features.get("delta_cvd"))

    if cvd is None:
        # 대리: delta_flip_positive 방향 신호로 근사
        cvd_bull = ctx.features["delta_flip_positive_raw"] if "delta_flip_positive_raw" in ctx.features else pd.Series(False, index=ctx.features.index)
    else:
        cvd_rising = cvd.diff(lookback) > 0
        cvd_bull = cvd_rising

    price_falling = close.pct_change(lookback) < -min_price_drop

    divergence = cvd_bull & price_falling
    sustained = divergence.rolling(lookback, min_periods=lookback).min().astype(bool)
    return sustained.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
```

---

### `coinbase_premium_weak` (disqualifiers/)

**M2+M3에서 도출 — 코베 프리미엄 음전환 = 기관 미국 수요 약화**

```python
def coinbase_premium_weak(
    ctx: Context,
    *,
    threshold: float = 0.0,     # 0% 아래 = 미국 기관 수요 약화
    lookback: int = 3,
) -> pd.Series:
    """Disqualify when Coinbase premium turns negative — institutional US demand weakening.

    반대 사용: coinbase_premium_positive 블록이 positive → confirm
    이 블록은 negative → disqualify (기관 분배 구조)
    """
    prem = ctx.features["coinbase_premium"]
    below = prem < threshold
    sustained = below.rolling(lookback, min_periods=1).min().astype(bool)
    return sustained.fillna(False).reindex(ctx.features.index, fill_value=False).astype(bool)
```

---

## WTD 기존 블록 활용 매핑

### 보고서 방법론 → WTD 블록 완전 매핑

| 방법론 | 관찰 신호 | WTD 블록 | 구현 상태 |
|---|---|---|---|
| **M1** CVD 역행 | CVD↑ + 가격↓ 지속 | `cvd_spot_price_divergence_bear` | ❌ 신규 |
| **M1** OI 역행 | OI↑ + 가격↓ | `oi_spike_with_dump` | ✅ 있음 |
| **M1** OI 신규 누적 | OI 계속 증가 | `oi_expansion_confirm` | ✅ 있음 |
| **M2** 거래소간 괴리 | 다중 거래소 분산 | `oi_exchange_divergence` | ✅ 있음 |
| **M2** 전체 OI 급증 | 전 거래소 OI 급등 | `total_oi_spike` | ✅ 있음 |
| **M3** 코베 프리미엄 약화 | CBP 음전환 | `coinbase_premium_weak` | ❌ 신규 |
| **M3** 스마트머니 약화 | 온체인 매집 감소 | `smart_money_accumulation` 역이용 | ⚠️ 역용 필요 |
| **M3** FR 과열 유지 | FR 극단 지속 | `funding_extreme` | ✅ 있음 |
| **M3** FR 방향 | FR 양수 지속 | `positive_funding_bias` | ✅ 있음 |
| **M4** LTH 공급 이동 | LTH → STH 전환 | ❌ 외부 API | W-0110 이관 |
| **M5** 복합 사이클 | 다중 지표 동시 약화 | PhaseCondition 구조 자체 | ✅ 아키텍처 대응 |
| **M5** 저점 상승 붕괴 | higher_lows 실패 | `higher_lows_sequence` 역이용 | ⚠️ disqualifier 역용 |
| — | 진입 캔들 (SHORT) | `bearish_engulfing`, `long_upper_wick` | ✅ 있음 |
| — | 볼륨 방향 (SHORT) | `volume_surge_bear` | ✅ W-0107 |
| — | MA 이탈 과도 | `extended_from_ma` | ✅ 있음 (disqualifier) |
| — | ATR 과열 | `extreme_volatility` | ✅ 있음 (disqualifier) |

---

## 기존 블록 활용 가능 BUT 미구현 (역이용 패턴)

### `smart_money_accumulation` → 역이용 disqualifier

현재: `smart_money_accumulation` = OKX 매집 신호 → confirm 블록
역이용: 이 블록이 False인 구간 = 스마트머니 없는 상승 = 의심 구간
→ `not_smart_money` disqualifier 개념

```python
# PhaseCondition에서 disqualifiers 리스트에 추가 시
# disqualifiers=["smart_money_accumulation"]  ← 블록이 True면 disqualify
# 반대로: required_blocks=["smart_money_accumulation"]이 없으면 soft_block으로 경고
```

> **참고:** 현재 PhaseCondition은 disqualifier = True 시 해당 페이즈 실패.
> `smart_money_accumulation`이 True = 매집 중 → disqualify 로직 반전이 되므로,
> 실제 구현 시 `smart_money_not_accumulating` 역방향 블록 신규 작성 필요.

---

## 구현 우선순위

### Slice 1 — 높은 임팩트, 기존 피처 활용

1. **`cvd_spot_price_divergence_bear`** disqualifier
   - `delta_flip_positive` + `recent_decline` 조합으로 근사 구현 가능
   - 선결: `cvd_cumulative` 피처 유무 확인 (없으면 근사)

2. **`coinbase_premium_weak`** disqualifier
   - `coinbase_premium` 피처 기존 존재 확인 필요
   - 단순 임계값 반전 로직

3. **`institutional-distribution-v1`** 패턴 등록
   - 위 2개 블록 + 기존 블록만으로 구성 가능

### Slice 2 — 피처 파이프라인 확장 필요

4. `cvd_cumulative` 피처 파이프라인 추가
   - aggTrade 누적 → 분당 CVD 집계
5. `coinbase_premium` raw 피처 확인 → 없으면 Coinbase API 추가

### Slice 3 — 외부 API (W-0110 이관)

6. Glassnode LTH Supply / MVRV-Z (유료 API)
7. 다중 거래소 동시 넷플로우 집계

---

---

## ⚠️ 기존 블록 수치 오류 / 재보정 필요 목록

ETF 이후 시장구조 변화로 인해 **기존 블록의 기본값(default)이 이미 잘못된 수치**를 사용 중.
이 섹션은 보고서 분석 기반으로 각 블록별 문제를 문서화한다.

---

### 1. `funding_extreme` — threshold=0.0010 (10bps) **→ 낮춰야 함**

```
현재값: threshold=0.0010 (10 bps = 0.1%)
문제:
  - 설계 당시 기준: 리테일 주도 시장, FR 피크 50~100+ bps 도달
  - ETF 이후: 기관이 현물+선물 동시 포지션으로 FR 아비트라지 → FR 극단값 억제
  - 10bps가 이제는 "극단"이 아닌 "보통 이상" 수준
  - → 동일한 10bps에서 과거보다 False Positive 비율 증가

권장 조정:
  - threshold=0.0005~0.0008 (5~8bps)로 낮춤 → 더 조기 감지
  - 또는 direction="short_overheat" 활용 시 -0.0003 수준

관련 패턴: FFR (funding-flip-reversal-v1), GOLDEN 필터
```

---

### 2. `absorption_signal` — price_move_threshold=0.005 (0.5%) **→ 낮춰야 함**

```
현재값: price_move_threshold=0.005 (0.5%)
문제:
  - 설계 당시: 고래 매수 = 즉각적인 가격 임팩트 0.5%+ 발생
  - ETF 이후: 300~500 BTC 분산 실행 → 단위당 가격 임팩트 감소
  - 동일한 매집 볼륨이지만 가격 움직임은 0.2~0.3% 수준으로 압축
  - → 기존 0.5% 기준에서 실제 흡수 신호를 다수 놓침 (False Negative)

권장 조정:
  - price_move_threshold=0.002~0.003 (0.2~0.3%)로 낮춤
  - cvd_buy_threshold=0.55 → 0.58로 높임 (매수 강도 더 엄격하게)

관련 패턴: VAR (volume-absorption-reversal-v1), WHALE_ACCUMULATION
```

---

### 3. `delta_flip_positive` — 단독 사용 시 신뢰도 저하 **→ 교차검증 필수**

```
현재값: window=6, flip_from_below=0.45, flip_to_at_least=0.55 (추정)
문제:
  - 설계 당시: taker-buy ratio 상승 = 실제 시장 매수 압력
  - ETF 이후: 시장조성자가 현물 매수 + 선물 공매도 헤지 동시 실행
    → taker-buy ratio (현물 거래소)는 상승, 선물 OI는 하락
    → 겉보기 CVD 강세 신호가 실제 약세 포지션의 헤지일 수 있음
  - → 단독 required_block으로 사용 시 M1 역행 패턴에서 오신호

권장 조정:
  - required_blocks에서 → soft_blocks 또는 required_any_groups로 격하
  - 항상 `recent_rally` 또는 `higher_lows_sequence`와 반드시 교차검증
  - `cvd_spot_price_divergence_bear` disqualifier 추가 필수 (W-0109 신규)

관련 패턴: VAR, GOLDEN(필터2), alpha-confluence-v1
```

---

### 4. `oi_change` — threshold=0.10 (10%) **→ 방향 해석 재검토**

```
현재값: threshold=0.10 (10%), direction="increase"
문제:
  - 설계 당시: OI 증가 = 신규 롱 포지션 = 강세 신호
  - ETF 이후:
    (a) 기관 매도 헤지 시 선물 OI 증가 (숏 포지션 신규)
    (b) OI 증가 + 가격 하락 = 기관 숏 누적 (강세 아님)
  - direction="increase" 자체가 이제 양방향 해석 필요

권장 조정:
  - OI 증가 단독 사용 금지 → 반드시 `recent_rally` 또는 `recent_decline`과 조합
  - OI 증가 + 가격 하락 → `oi_spike_with_dump` 사용 (이미 있음, 이 블록 활용)
  - OI 증가 + 가격 상승 = 신규 롱 (강세) → `oi_expansion_confirm` 사용
  - threshold=0.05~0.08로 낮춤 (ETF 이후 OI 규모 커져서 10% 변동이 더 빈번)

관련 패턴: 모든 패턴 ENTRY 페이즈에서 `oi_change` 단독 사용 금지
```

---

### 5. `ls_ratio_recovery` — recovery_threshold=0.03 (3%) **→ 신뢰도 저하, soft 강등**

```
현재값: lookback=8, recovery_threshold=0.03 (3%)
문제:
  - 설계 당시: 리테일 L/S ratio = 시장 심리 반영
  - ETF 이후: 기관 OTC 포지션은 L/S ratio에 잡히지 않음
    → 리테일 L/S ratio가 전체 시장 방향보다 리테일 심리만 반영
  - recovery_threshold=3%: ETF 이전 리테일 주도 기준값, 현재 리테일 비중 감소로 신호 민감도 하락

권장 조정:
  - required_blocks → soft_blocks으로 격하 (확인 보조 신호로만)
  - 단독 진입 조건으로 절대 사용 금지
  - lookback=12~16으로 늘려 더 지속적인 회복만 감지

관련 패턴: WHALE_ACCUMULATION, FFR
```

---

### 6. `oi_exchange_divergence` — conc_threshold=0.75 **→ 높여야 할 가능성**

```
현재값: mode="low_concentration", conc_threshold=0.75, oi_spike_threshold=0.03
문제:
  - 설계 당시: 특정 거래소가 75%+ OI 점유 = "집중" (비정상)
  - ETF 이후: 기관이 의도적으로 여러 거래소에 분산 → 50~60% 집중도가 "정상"
  - → 0.75 기준이 너무 높아서 "low_concentration=정상" 신호가 과하게 발생
  - mode="low_concentration" 신호 의미가 약화됨 (이제는 당연한 상태)

권장 조정:
  - conc_threshold=0.60~0.65로 낮춤
  - 또는 mode="high_concentration" 역으로 사용 (단일 거래소 집중 = 이상 신호)
  - oi_spike_threshold=0.05로 높임 (노이즈 감소)

관련 패턴: institutional-distribution-v1 Phase 2
```

---

### 7. `total_oi_spike` — threshold=0.05 (5%) **→ 높여야 함**

```
현재값: threshold=0.05 (5%), window="1h"
문제:
  - 설계 당시: 전체 OI 5% 1시간 변화 = 유의미한 급증
  - ETF 이후: 전체 파생 시장 규모가 크게 성장 → 5% 변동이 더 빈번해짐
  - → False Positive 증가 (과거엔 극단, 지금은 흔함)

권장 조정:
  - 1h threshold=0.08~0.10 (8~10%)로 높임
  - 또는 window="24h" + threshold=0.15~0.20으로 장기 기준 사용

관련 패턴: institutional-distribution-v1, WHALE 패턴
```

---

### 8. `coinbase_premium_positive` — min_norm=0.5 (z-score) **→ 재보정 검토**

```
현재값: min_norm=0.5 (z-score 0.5 이상 = 양수 프리미엄)
문제:
  - ETF 이후: 코인베이스를 통한 ETF 차익거래(arb) 증가
    → 코인베이스 프리미엄이 ETF 차익거래 흐름에 더 민감해짐
  - 기관 ETF 유입 시 코베 프리미엄 반응이 과거 리테일 구매력 신호와 다름
  - z-score 0.5 기준이 ETF 차익 노이즈를 걸러내기엔 너무 낮음

권장 조정:
  - min_norm=0.8~1.0으로 높임 (더 극단적인 프리미엄만 신호로)
  - 또는 10분 MA 적용하여 단기 차익 스파이크 필터링

관련 패턴: GOLDEN(필터2 보조), institutional-distribution-v1 disqualifier
```

---

### 재보정 우선순위 요약

| 블록 | 현재값 | 권장값 | 방향 | 임팩트 |
|---|---|---|---|---|
| `funding_extreme` | 10bps | 5~8bps | ↓ 낮춤 | 높음 — FFR/GOLDEN 핵심 |
| `absorption_signal` price_move | 0.5% | 0.2~0.3% | ↓ 낮춤 | 높음 — VAR 핵심 |
| `delta_flip_positive` | required | soft 강등 | 용도 변경 | 높음 — 전 패턴 영향 |
| `oi_change` direction | 단독 사용 | 교차필수 | 용도 변경 | 높음 — 전 패턴 영향 |
| `ls_ratio_recovery` | required | soft 강등 | 용도 변경 | 중간 |
| `oi_exchange_divergence` | conc=0.75 | conc=0.60~0.65 | ↓ 낮춤 | 중간 |
| `total_oi_spike` | 5% | 8~10% | ↑ 높임 | 중간 |
| `coinbase_premium_positive` | z=0.5 | z=0.8~1.0 | ↑ 높임 | 낮음 |

> **구현 전략:** 기본값 변경 대신 각 패턴 정의에서 명시적으로 파라미터를 override.
> 블록 기본값은 범용성을 위해 보존, 패턴별로 post-ETF 수치를 명시.

---

## Facts

- ForeDex 보고서: ETF 이후 4가지 구조 변화 문서화 (온체인/기술적/시장참여자/OTC)
- M1 CVD 역행: 바이낸스 고래(100만~1000만) 현물 CVD 상승 + 가격 하락 동시 발생
- M2 분산 유입: 300~500 BTC 단위 분할, 바이낸스/OKX/바이빗/비트스탬프/코인베이스 동시
- M3 OTC: Q2부터 매수 유동성 감소 → 기관 보유분 거래소 재유입 확인
- M4 LTH: ETF 이후 LTH→STH 전환 더 점진적 (이전 대비 속도 1/3 수준)
- `coinbase_premium_positive` 블록: 이미 존재 (engine/building_blocks/confirmations/)
- `oi_exchange_divergence`, `total_oi_spike`: 이미 존재
- `bearish_engulfing`, `long_upper_wick`: 이미 존재 (entries/)

## Assumptions

- `coinbase_premium` raw 피처가 기존 파이프라인에 존재 (coinbase_premium_positive 블록이 사용 중이므로)
- `delta_flip_positive`로 CVD 방향 근사 가능 — 단, 누적량은 없음
- `oi_spike_with_dump`가 M1 CVD 역행의 가장 가까운 기존 블록 대리

## Open Questions

- `coinbase_premium` 피처 원시값 접근 가능한가 (분 단위? 시간 단위?)
- CVD 누적값(`cvd_cumulative`) 피처 파이프라인에 없다면 어떤 근사 사용?
- `institutional-distribution-v1` 백테스트: 신호 수 예상치? (기관 이벤트 = 희소할 것)

## Next Steps

1. `coinbase_premium` 피처 존재 여부 확인 (`engine/features/` 또는 `engine/data_cache/`)
2. `cvd_spot_price_divergence_bear` + `coinbase_premium_weak` 블록 Slice 1 구현
3. `institutional-distribution-v1` 패턴 등록 + 백테스트 (신호 희소 예상 → SPARSE 가능)
4. W-0110 설계: Glassnode LTH/MVRV 외부 API 통합

## Exit Criteria

- Slice 1: `institutional-distribution-v1` 등록 + 969+ tests pass
- Slice 2: `cvd_cumulative` 피처 확보 + 블록 정확도 향상
- Slice 3: W-0110 완료 (LTH/MVRV)

## Handoff Checklist

- ForeDex 보고서 방법론 5개(M1~M5) 전체 분해 완료
- WTD 기존 블록 커버리지: M1~M3 = 기존 블록으로 70% 구현 가능
- 신규 블록 2개: `cvd_spot_price_divergence_bear` + `coinbase_premium_weak`
- 신규 패턴 1개: `institutional-distribution-v1` (SHORT direction)
- M4(LTH)/M5 일부는 외부 API 또는 아키텍처 내 해결 → W-0110 이관
