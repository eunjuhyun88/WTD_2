# PATTERN_ENGINE.md 설계 검증 보고서

> CTO + AI Researcher 관점 코드베이스 감사
> 작성일: 2026-04-13
> 대상: app/docs/PATTERN_ENGINE.md

---

## 요약

| 항목 | 판정 |
|------|------|
| 4-레이어 아키텍처 방향성 | ✅ 맞음 |
| Context API 사용법 | ❌ 틀림 — 수정 필요 |
| 블록 반환 타입 | ❌ 틀림 — 수정 필요 |
| feature 수 "92개" | ⚠️ 부정확 — 동적 |
| PatternObject vs 기존 ChallengeRecord | ⚠️ 충돌 — 통합 설계 필요 |
| Auto-Research "새로 만든다" | ⚠️ 이미 존재 — 진화시켜야 함 |
| State Machine | ✅ 진짜 신규 작업 |
| Result Ledger | ✅ 진짜 신규 작업 |
| User Refinement LightGBM | ⚠️ 부분 존재 — 연결만 필요 |
| 유니버스 확장 30→300 | ✅ 맞음, 신규 작업 |
| OI 히스토리 20일 제한 | ✅ 코드로 확인됨 |

---

## 1. Context API — ❌ 틀림

### 설계 문서가 쓴 것
```python
def oi_spike_with_dump(ctx: SignalContext, ...) -> bool:
    recent = ctx.df.tail(lookback_bars)
    oi_change = ctx.perp["oi_change_1h"].iloc[-1]
```

### 실제 코드 (`engine/building_blocks/context.py`)
```python
@dataclass(frozen=True)
class Context:
    klines: pd.DataFrame    # OHLCV (ctx.klines)
    features: pd.DataFrame  # 92개 computed features (ctx.features)
    symbol: str
    # ctx.perp 없음, ctx.df 없음, SignalContext 없음
```

### 실제 블록 시그니처 예시 (`oi_change.py`, `recent_decline.py`)
```python
def oi_change(ctx: Context, *, threshold: float, ...) -> pd.Series:  # bool Series
def recent_decline(ctx: Context, *, pct: float, ...) -> pd.Series
def funding_extreme(ctx: Context, *, threshold: float, ...) -> pd.Series
```

### 수정안

새 블록 5개를 만들 때 실제 API에 맞춰야 함:

```python
# 올바른 시그니처
def oi_spike_with_dump(
    ctx: Context,
    *,
    price_drop_threshold: float = 0.05,
    oi_spike_threshold: float = 0.15,
    volume_multiple: float = 2.0,
    lookback_bars: int = 3,
) -> pd.Series:  # bool Series, not bool
    """급락 + OI 급등 + 거래량 폭발 동시 발생"""
    price_change = ctx.features["price_change_1h"]  # 이미 features에 있음
    oi_change_col = ctx.features["oi_change_1h"]    # 이미 features에 있음
    vol_zscore = ctx.features["vol_zscore"]          # 이미 features에 있음

    return (
        (price_change <= -price_drop_threshold) &
        (oi_change_col >= oi_spike_threshold) &
        (vol_zscore >= volume_multiple)
    )
```

OI, 펀딩, 가격변화율 전부 이미 `ctx.features`에 있음. `ctx.perp` 필요 없음.

---

## 2. Feature 수 — ⚠️ "92개" 부정확

### 실제 코드 (`engine/scanner/feature_calc.py`)
```python
_CORE_FEATURE_COLUMNS: tuple[str, ...] = (...)   # 고정 컬럼
_REGISTRY_COLUMNS: tuple[str, ...] = (...)        # 레지스트리 확장 컬럼
FEATURE_COLUMNS = _CORE_FEATURE_COLUMNS + _REGISTRY_COLUMNS
N_FEATURES = len(FEATURE_COLUMNS)  # 동적 — 빌드마다 다를 수 있음
```

### 수정안
설계 문서에서 "92개"로 고정 표현하지 말고 "N_FEATURES개 (현재 ~X개)"로 표현. 코어 컬럼만 나열.

핵심: `oi_change_1h`, `oi_change_24h`, `funding_rate`, `price_change_1h`, `price_change_4h`, `vol_zscore` 전부 이미 feature에 있음. 새 블록을 만들 때 raw 데이터를 다시 fetch할 필요 없음.

---

## 3. PatternObject vs ChallengeRecord — ⚠️ 충돌

### 이미 존재하는 것 (`engine/challenge/`)

```
challenge/
  types.py           ← ChallengeRecord, PatternInput, Snap, ScanMatch
  historical_matcher.py  ← 4전략 매칭 (FeatureOutlier, Cosine, LightGBM, DTW)
  pattern_refiner.py     ← 전략 경쟁, 최적 전략 선택
```

**기존 아키텍처:**
```
PatternInput (1-5 snaps)
  → extract feature vectors
  → 4 strategies 경쟁 (win_rate × expectancy)
  → ChallengeRecord 저장 (feature vector + threshold)
  → 실시간 유사도 스캔
```

**설계 문서의 새 아키텍처:**
```
PatternObject (phase sequence)
  → 각 phase 조건 정의 (block 묶음)
  → StateMachine이 종목별 phase 추적
  → Phase 전환 시 알림
```

### 충돌 지점

두 아키텍처는 병렬로 존재할 수 있지만 설계 문서가 이를 명시하지 않아 혼란 발생.

| 구분 | 기존 ChallengeRecord | 신규 PatternObject |
|------|---------------------|-------------------|
| 방식 | feature vector 유사도 | rule-based phase 시퀀스 |
| 장점 | 알려지지 않은 패턴 발견 가능 | 명시적 조건, 해석 가능 |
| 단점 | 왜 매칭됐는지 설명 어려움 | 미리 정의 못 한 패턴 놓침 |
| 입력 | 유저 snap (1-5개) | 개발자 정의 phase 조건 |

### 수정안 — 두 레이어를 명시적으로 통합

```
PatternObject (새, phase-based)       ChallengeRecord (기존, vector-based)
        │                                       │
        │ Phase 전환 이벤트                       │ 유사 종목 발견
        └──────────────┬─────────────────────────┘
                       │
                  StateMachine
                  (PatternObject phase 체크 우선,
                   ChallengeRecord 유사도로 보완)
```

**구체적 통합:**
- TRADOOR 패턴처럼 명확히 정의된 것 → PatternObject (새 레이어)
- 유저가 snap으로 올린 것 → ChallengeRecord (기존)
- StateMachine은 둘 다 구독 가능

---

## 4. Auto-Research — ⚠️ 이미 존재

### 이미 존재하는 것
```
engine/autoresearch_ml.py        ← LightGBM 기반 ML 자동 리서치
engine/autoresearch_real_data.py ← 실데이터로 building block 조합 그리드서치
```

### 설계 문서가 틀린 점
"새로 만든다"로 기술했지만 사실 진화시켜야 함.

기존 autoresearch는:
- 단일 심볼 분석
- 백테스트 중심
- 이벤트 트리거(급등/급락 감지) 없음

**추가해야 할 것:**
- 전 종목 ±10% 이벤트 감지 트리거
- 이벤트 전후 데이터 자동 수집
- `ResearchNote` 저장 구조
- LLM 분석 연결 (선택)

---

## 5. User Refinement — ⚠️ 부분 존재

### 이미 존재하는 것
```
engine/scoring/trainer.py        ← LightGBM 학습 (walk-forward CV 포함)
engine/scoring/scorer.py         ← LGBMScorer (save/load)
engine/train_lgbm.py             ← 학습 진입점
```

### 설계 문서가 놓친 것
퍼유저 재학습 인프라의 80%가 이미 있음. 필요한 것:
1. user_id를 model path에 연결 (`lgbm_{user_id}_{symbol}.pkl`)
2. 유저 피드백(valid/invalid)을 label로 변환
3. 피드백 N개 임계값 도달 시 재학습 트리거

---

## 6. 진짜 신규 작업 확인

### StateMachine ✅ 없음 — 만들어야 함
```
engine/patterns/ 디렉토리 자체가 없음
PatternStateMachine 클래스 없음
Phase 전환 추적 없음
```

### Result Ledger ✅ 없음 — 만들어야 함
```
PatternOutcome 타입 없음
결과 DB 없음
성과 통계 없음
```

### 동적 유니버스 ✅ 없음 — 만들어야 함
```
engine/universe/binance_30.py → 30개 하드코딩
동적 fetch 없음 (engine/universe/dynamic.py 없음)
```

### 새 블록 5개 ✅ 없음 — 만들어야 함
- `oi_spike_with_dump`
- `higher_lows_sequence`
- `funding_flip`
- `oi_hold_after_spike`
- `sideways_compression`

---

## 7. 설계 문서 수정 사항 요약

### 즉시 수정이 필요한 것

**§6 새 블록 시그니처 전체 수정:**

```python
# WRONG (설계 문서)
def oi_spike_with_dump(ctx: SignalContext, ...) -> bool:
    recent = ctx.df.tail(lookback_bars)
    oi_change = ctx.perp["oi_change_1h"].iloc[-1]

# CORRECT
def oi_spike_with_dump(ctx: Context, ...) -> pd.Series:
    price_change = ctx.features["price_change_1h"]
    oi_chg = ctx.features["oi_change_1h"]
    vol_z = ctx.features["vol_zscore"]
    return (price_change <= -threshold) & (oi_chg >= oi_thr) & (vol_z >= vol_mul)
```

**§0 아키텍처 다이어그램에 기존 레이어 추가:**
```
기존 레이어 (이미 있음):
  challenge/     → ChallengeRecord (vector-based)
  autoresearch_* → ML 리서치
  scoring/       → LightGBM trainer/scorer

신규 레이어 (만들어야 함):
  patterns/      → PatternObject + StateMachine
  ledger/        → Result Ledger
  universe/      → dynamic.py
```

**§9 로드맵 수정:**

| 항목 | 원래 추정 | 실제 |
|------|-----------|------|
| challenge 타입 | 새로 만들기 | 이미 있음, 확장만 |
| autoresearch | 새로 만들기 | 진화시키기 |
| LightGBM 리파인먼트 | 새로 만들기 | 연결만 |
| StateMachine | 새로 만들기 | ✅ 그대로 |
| Result Ledger | 새로 만들기 | ✅ 그대로 |
| 동적 유니버스 | 새로 만들기 | ✅ 그대로 |
| 새 블록 5개 | 새로 만들기 | ✅ 그대로 |

---

## 8. 검증된 최종 작업 목록

### Sprint 1 — 기반 정리 (1주)
```
[ ] Context API 맞게 새 블록 5개 작성
    (ctx.features 사용, pd.Series 반환)
[ ] engine/universe/dynamic.py
    (바이낸스 USDT-M 전 종목 동적 로딩)
[ ] ChartBoard.svelte (lightweight-charts)
    (캔들 + SMA + RSI/OI 서브패널)
```

### Sprint 2 — 신규 레이어 (2주)
```
[ ] engine/patterns/types.py
    (PatternObject, PhaseCondition — ChallengeRecord와 병행)
[ ] engine/patterns/state_machine.py
    (PatternStateMachine — 종목별 phase 추적)
[ ] TRADOOR_OI_REVERSAL 패턴 정의
[ ] ACCUMULATION 진입 시 알림 연결
```

### Sprint 3 — Result Ledger (1주)
```
[ ] engine/ledger/types.py (PatternOutcome)
[ ] SQLite or JSON 결과 저장
[ ] PatternStats 집계
[ ] LedgerView UI
```

### Sprint 4 — 기존 레이어 통합 (1주)
```
[ ] autoresearch에 이벤트 트리거 추가
    (±10% 감지 → 자동 분석)
[ ] ChallengeRecord와 PatternObject 통합 인터페이스
[ ] user_id → LightGBM per-user 파이프라인 연결
```

---

## 결론

**설계 방향은 옳다.**

4-레이어 아키텍처, TRADOOR 패턴 phase 분해, State Machine + Result Ledger 조합은 맞는 방향이고 해자를 만들 수 있는 구조다.

**코드베이스를 과소평가했다.**

challenge/*, autoresearch_*, scoring/* 가 이미 존재한다.
신규 작업 범위는 설계 문서가 추정한 것보다 작다 — 특히 리파인먼트와 autoresearch는 거의 다 있다.

**실제로 없는 것은 3가지다:**

1. `engine/patterns/` — StateMachine (진짜 새 작업)
2. `engine/ledger/` — Result Ledger (진짜 새 작업)
3. `engine/universe/dynamic.py` — 동적 유니버스 (작은 작업)

**그리고 앱 레이어가 엔진과 연결이 안 돼 있다.** 이게 지금 가장 큰 문제다.

---

*이 문서는 PATTERN_ENGINE.md의 검증 보고서입니다.*
*설계 문서 자체는 위 수정사항을 반영해 업데이트해야 합니다.*
