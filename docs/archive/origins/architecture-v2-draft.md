# WTD v2 — Master Architecture Document (DRAFT)

**Status**: DRAFT — 기존 architecture.md 를 대체하는 리디자인 후보
**Date**: 2026-04-12
**Authors**: ej + Claude (CTO + AI researcher + Quant hats)
**기반**: architecture.md (v1) + 2026-04-12 제품 비전 재정립 세션
**변경 사유**: 제품 방향 재정의 — "규칙 기반 패턴 매칭" → "예시 기반 패턴 학습 + 유사도 스캔"

---

## §0 Executive summary

### v1 과 v2 의 차이 (한 줄)

| | v1 (기존) | v2 (리디자인) |
|---|---|---|
| **핵심 루프** | 규칙 정의 → 백테스트 → 배포 | **예시 등록 → 유사 검색 → 학습 → 스캔 → 피드백** |
| **유저 입력** | program.md (정적 규칙) | 패턴 예시 (차트 복기, 자연어 쿼리) |
| **LLM 역할** | LoRA 로 신호 설명 | 자연어 쿼리 파싱 + 결과 설명 |
| **판단** | hand-crafted match.py | LightGBM (같은 입력 = 같은 출력) |
| **학습** | 없음 (수동 튜닝) | 자동 피드백 루프 (트레이딩 결과 → 재학습) |
| **데이터** | OHLCV만 (OI/CVD placeholder) | OHLCV + OI + CVD + 펀딩비 + Net Longs/Shorts |

### 현재 상태 (한 줄)

> **D8-D16 인프라 (feature_calc, LightGBM, backtest, walk-forward) 완성.
> OI/CVD 데이터 + 유사도 검색 + 이벤트 트리거가 빠진 상태.**

---

## §1 Vision

### 1.1 한 줄

> **트레이더의 패턴 감각을 1000개 코인에서 24/7 자동으로 찾아주고, 쓸수록 더 잘 찾는 AI 스캐너.**

### 1.2 사용자

> 수년간 차트에서 축적한 패턴 인식으로 매매하지만, 수천 개 알트를 수동 스캔할 수 없는 크립토 트레이더.

구체 예시 (2026-04-12):

**TRADOOR 복기**: "급락(-40%) + OI 급등 → 아치 패턴 → 두 번째 급락 + OI 급등 → 15분봉 우상향 시 눌림 진입 → 50-100% 빔"

**TRUMP 분석**: "뉴스 촉매 + CVD 상승 (현물 고래 매집) + Net Longs+Shorts 동시 상승 + OI 역대 최대 → 눌림 진입"

이건 코드로 번역할 수 있는 퀀트 전략이 아니다. **수년간의 스크린 타임이 만든 다단계 패턴 인식**이다.

### 1.3 Before vs After

**Before** (현재):
```
매일 아침 → Coinalyze/CoinGlass 열기 → TradingView 수십 개 클릭 →
눈으로 OI/CVD/차트 구조 확인 → 하루 1-2개 발견 (대부분 놓침) →
발견해도 매매 복기는 텔레그램/노트에 텍스트로만 기록
```

**After** (WTD 완성 후):
```
[패턴 등록]
"급락 + OI 급등이면 반등 확률 높아" → 시스템이 이해

[24/7 자동]
1000개 코인 실시간 스캔 →
"🔥 PTB 지금 트리거: -15%, OI +40%, 과거 유사 287건 중 69% 반등" →
트레이더가 차트 한 번 보고 판단

[학습]
트레이딩 결과 피드백 →
"funding_positive 있으면 승률 85%, 없으면 45%" 발견 →
모델 자동 개선 → 더 잘 찾음
```

### 1.4 핵심 루프 (제품의 심장)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│   ① 유저가 패턴 예시 등록                            │
│      (차트 복기, 자연어 쿼리, 타임스탬프)              │
│                         ↓                           │
│   ② 그 시점의 feature snapshot 추출                  │
│      (OHLCV + OI + CVD + 펀딩비 + 구조)              │
│                         ↓                           │
│   ③ 전체 히스토리에서 유사 snapshot 검색              │
│      "30코인 × 6년에서 이 조건 287건 발견"            │
│                         ↓                           │
│   ④ 결과 라벨링: 287건 중 떡상한 비율?               │
│      "198건이 7일 내 +30% = 69%"                     │
│                         ↓                           │
│   ⑤ LightGBM 학습                                   │
│      어떤 feature 조합이 떡상을 예측하나               │
│                         ↓                           │
│   ⑥ 실시간 스캔 + 알림                               │
│      "지금 이 조건인 코인 3개 있음"                    │
│                         ↓                           │
│   ⑦ 유저 트레이딩 → 결과 피드백                      │
│      맞았으면 weight 강화, 틀렸으면 조정               │
│                         ↓                           │
│   ⑧ 모델 개선 → ①로 돌아감                           │
│      "삼각수렴 돌파 후 사면 승률 78%" 발견             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 1.5 Anti-goals

- **LLM이 판단하지 않는다**. LLM은 파싱과 설명만. 같은 BTC 차트를 100번 보여줘도 LLM은 100번 다른 답을 할 수 있다. LightGBM은 100번 같은 답을 한다.
- **Signal marketplace 가 아니다**. 유저 패턴은 유저 소유. 시스템이 파는 건 알파가 아니라 **눈의 확장**.
- **Autotrader 가 아니다**. 알림만 보낸다. 주문 실행 없음. 판단은 트레이더가 한다.
- **규칙 빌더가 아니다**. "RSI < 30이면 알림" 같은 단순 조건이 아니라, **다단계 패턴의 유사도 기반 검색**.

### 1.6 성공 기준

1. **본인 사용**: 1주일 동안 알림 받으면서 실제 트레이딩에 도움이 됨
2. **패턴 검증**: 유사도 검색 결과의 승률이 50%를 유의미하게 상회 (p < 0.05)
3. **학습 루프**: 피드백 1달 후 모델 승률이 초기보다 향상

---

## §2 Architecture — 5 Layer System

### 2.1 레이어 구조 (v2)

```
┌──────────────────────────────────────────────────────────────────┐
│  L5 — Learning (코드 + ML)                                       │
│    trade_log → feature weight 조정 → LightGBM 재학습              │
│    Hill Climbing + adaptive retraining. LLM 없음.                 │
└──────────────────────────────────────────────────────────────────┘
                                ↑ 피드백
┌──────────────────────────────────────────────────────────────────┐
│  L4 — Execution (코드)                                            │
│    실시간 스캔 + 이벤트 감지 + 알림 (텔레그램/디스코드)              │
│    freqtrade 엔진 또는 자체 cron. LLM 없음.                       │
│    P(win) ≥ threshold 이면 알림. threshold 는 코드가 자름.         │
└──────────────────────────────────────────────────────────────────┘
                                ↑ 스코어
┌──────────────────────────────────────────────────────────────────┐
│  L3 — Language (LLM)                                              │
│    역할 1: 자연어 쿼리 파싱                                        │
│      "bb_squeeze + oi_up + funding_positive" → 구조화된 조건       │
│    역할 2: 결과 설명                                               │
│      "CVD 다이버전스 + 펀딩비 양전환. P(win) 63%"                   │
│    역할 3: 유저 패턴 복기 → feature snapshot 매핑                   │
│    ★ 판단하지 않음. 번역만 함.                                     │
└──────────────────────────────────────────────────────────────────┘
                                ↑ 구조화된 조건
┌──────────────────────────────────────────────────────────────────┐
│  L2 — Scoring (ML)                                                │
│    LightGBM: feature vector → P(win)                              │
│    동일 입력 = 동일 출력. 재현 가능. 백테스트 의미 있음.             │
│    유사도 검색: cosine similarity / KNN on feature space           │
└──────────────────────────────────────────────────────────────────┘
                                ↑ feature vector
┌──────────────────────────────────────────────────────────────────┐
│  L1 — Scan (코드)                                                 │
│    OHLCV + OI + CVD + 펀딩비 + Net Longs/Shorts → feature vector  │
│    이벤트 감지: "이 코인 4시간 내 -10% 급락" 트리거                 │
│    멀티 타임프레임: 15m / 1h / 4h / 1d                              │
│    if문과 계산식. LLM 없음.                                        │
└──────────────────────────────────────────────────────────────────┘
                                ↑ raw data
┌──────────────────────────────────────────────────────────────────┐
│  L0 — Data                                                        │
│    Binance API (OHLCV) + CoinGlass API (OI, CVD, 펀딩비, Longs)   │
│    오프라인 캐시 + 실시간 스트림                                    │
│    30 심볼 → 300 → 1000 (단계적 확장)                              │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 v1 → v2 매핑 (기존 코드 재사용)

| v1 (6-layer) | v2 (5-layer) | 기존 코드 | 변경 사항 |
|---|---|---|---|
| Layer 0 Data | L0 Data | `data_cache/` ✅ | CoinGlass API 추가, 멀티 TF |
| Layer 1 Features | L1 Scan | `feature_calc.py` ✅ | OI/CVD placeholder → 실제 데이터, 이벤트 감지 추가 |
| Layer 2 Signal | L2 Scoring | LightGBM ✅ | 유사도 검색 엔진 추가 |
| Layer 3 Regime | L2 에 흡수 | `regime.py` ✅ | feature 로 편입 |
| Layer 4 Execution | L4 Execution | `simulator.py` ✅ (백테스트) | 실시간 스캔 + 알림 추가 |
| Layer 5 Measurement | L2 + L5 | `metrics.py` ✅ | 그대로 사용 |
| Layer 6 LoRA | L3 Language | 미구현 | 자연어 파싱 + 설명 (LoRA 또는 API) |

### 2.3 End-to-end 데이터 플로우 (v2)

```
[통합 파이프라인 — 입력이 뭐든 같은 흐름]

유저 입력 (어떤 형태든):
  "TRADOOR 2024-11-22"                    ← 타임스탬프만
  "급락 후 반등"                           ← 느낌만
  "급락 -10% + OI급등 + funding 음전환"    ← 구체적 조건
  "삼각수렴 돌파 후 매수"                  ← 차트 구조 설명
  "bb_squeeze + oi_up + 4h"               ← 쿼리 문법
  "저번에 수익난 그 패턴"                  ← 과거 트레이드 참조
  "find alts with 1d squeeze"             ← 스캔 요청
       │
       ▼
  ① 입력 해석 → feature space 변환
     단일 스냅 → feature vector 1개
     멀티 스냅 → features + deltas + timing = 확장 벡터
     자연어 → L3 파싱 → 구조화된 조건
     조건식 → 직접 매핑
       │
       ▼
  ② Pattern Refinement (여러 Strategy 경쟁)
     Strategy 1: Feature Outlier (z-score)    → 승률 69%, 287건
     Strategy 2: Cosine Similarity            → 승률 64%, 450건
     Strategy 3: LightGBM Importance          → 승률 74%, 92건
     Strategy 4: Shape Match (DTW)            → 승률 58%, 120건
     ...추가 가능
       │
       ▼
  ③ 결과 제시 (유저가 선택)
     "방법 A: 급락+OI 조합, 287건 69% — 보수적"
     "방법 B: funding+oi 핵심, 92건 74% — 공격적"
     "방법 C: 차트 모양 유사, 120건 58% — 참고용"
       │
       ▼
  ④ 선택한 패턴으로:
     → LightGBM 학습
     → 실시간 스캔 등록 (1000코인 × 1시간)
     → 조건 매칭 시 알림
       │
       ▼
  ⑤ 유저 트레이딩 → 결과 피드백
       │
       ▼
  ⑥ 모델 개선 → 스캔 정확도 향상 → ①로 돌아감

[실시간 스캔 모드 — 등록된 패턴 기반]

1000개 코인 × 1시간마다
       │
       ▼
  L1: feature snapshot 계산 (OHLCV + OI + CVD)
       │
       ▼
  등록된 패턴들과 매칭 (유사도 + LightGBM 스코어)
       │
       ▼
  threshold 이상이면 알림
       │
       ▼
  유저 트레이딩 → 결과 기록 → L5 재학습
```

---

## §3 Layer details (v2)

### 3.0 L0 — Data

**기존**: `data_cache/` — Binance 1h OHLCV, 30심볼 × 6년, 오프라인.

**v2 추가**:

| 데이터 | 소스 | 용도 | 상태 |
|--------|------|------|------|
| OI (미결제약정) | CoinGlass API | 세력 포지션 감지 | ❌ 필요 |
| CVD (현물 매집) | CoinGlass API | 고래 방향 감지 | ❌ 필요 |
| 펀딩비 | CoinGlass / Binance | 숏/롱 과열 감지 | ❌ 필요 |
| Net Longs/Shorts | CoinGlass API | 포지션 변화 | ❌ 필요 |
| 멀티 타임프레임 | Binance API | 15m/4h/1d | ❌ 필요 |
| OHLCV 1h | Binance API | 기존 | ✅ 있음 |

**우선순위**: CoinGlass API 연결이 **전체 v2 의 전제조건**.

### 3.1 L1 — Scan (Feature Calc + Event Detection)

**기존 모듈**: `scanner/feature_calc.py` — 28 features, past-only, vectorised ✅

**v2 변경**:

1. **OI/CVD/펀딩비 placeholder → 실제 데이터**

```python
# 현재 (placeholder)
"oi_change_pct": 0.0
"funding_rate": 0.0
"cvd_score": 0.0

# v2 (CoinGlass 실제값)
"oi_change_pct": +40.2        # CoinGlass
"funding_rate": -0.015        # CoinGlass
"cvd_score": +3.454           # CoinGlass
"net_longs_change_pct": -12.3 # 신규
"net_shorts_change_pct": +28.1# 신규
"liquidation_volume": 5.2     # 신규 (옵션)
```

2. **이벤트 감지 레이어 추가**

```python
def detect_events(features_history: pd.DataFrame) -> list[Event]:
    """바 단위가 아닌, 이벤트 기반 트리거."""
    events = []
    # 급락 감지: 4시간 내 -10% 이상
    if price_change_4h < -0.10:
        events.append(Event("dump", severity=abs(price_change_4h)))
    # OI 급등: 4시간 내 +30% 이상
    if oi_change_4h > 0.30:
        events.append(Event("oi_spike", severity=oi_change_4h))
    # BB 스퀴즈: bb_width < 하위 10%
    if bb_width < bb_width_10th_percentile:
        events.append(Event("squeeze", severity=...))
    return events
```

3. **멀티 타임프레임**

| 타임프레임 | 용도 |
|-----------|------|
| 15m | 진입 타이밍 (미세 구조) |
| 1h | 주력 분석 (기존) |
| 4h | 트렌드 방향 |
| 1d | 스퀴즈/확장 레짐 |

### 3.1b 멀티 스냅 패턴 표현

**문제**: 유저 패턴은 시퀀스다. "급락 → OI 급등 → 진입". 한 시점의 feature snapshot으로는 이 순서를 표현할 수 없다.

**해결**: 유저가 핵심 시점을 직접 여러 개 찍는다.

```python
@dataclass
class PatternInput:
    """유저가 등록하는 패턴. snap 1개(단순)~5개(복잡) 지원."""
    snaps: list[Snap]  # 최소 1개

@dataclass
class Snap:
    symbol: str
    timestamp: datetime
    label: str = ""     # "급락 시작", "OI 터짐", "진입" (선택)

# 유저 입력 예시:
# 단순: PatternInput(snaps=[Snap("TRADOOR", "2024-11-22")])
# 복잡: PatternInput(snaps=[
#     Snap("TRADOOR", "2024-11-20", "급락"),
#     Snap("TRADOOR", "2024-11-21", "OI 급등"),
#     Snap("TRADOOR", "2024-11-22", "진입"),
# ])
```

**시스템이 만드는 확장 벡터**:

```python
def build_pattern_vector(snaps: list[Snap], feature_db) -> np.ndarray:
    """snap들로부터 확장된 패턴 벡터 생성."""
    vectors = [extract_features(s.timestamp, feature_db) for s in snaps]

    parts = []
    # 1. 각 snap의 feature vector
    for v in vectors:
        parts.append(v)                     # 28 features × N snaps

    # 2. snap 간 delta (뭐가 변했나)
    for i in range(1, len(vectors)):
        parts.append(vectors[i] - vectors[i-1])  # 28 deltas × (N-1)

    # 3. snap 간 timing (시간 간격)
    for i in range(1, len(snaps)):
        dt = (snaps[i].timestamp - snaps[i-1].timestamp).total_hours()
        parts.append([dt])                  # 1 scalar × (N-1)

    return np.concatenate(parts)
    # 3-snap 예시: 28*3 + 28*2 + 2 = 142차원
```

**핵심**:
- `delta`: snap1→snap2 사이에 price가 회복되면서 OI가 급등 = **패턴의 본질**
- `timing`: 급락 후 4h 내 OI 터지면 good, 1d 후면 late = **시간 조건도 자동 탐색**
- snap 1개만 넣으면 기존 단일 snapshot과 동일하게 동작 (하위 호환)

### 3.1c Pattern Refinement (Autoresearch 편입)

**위치**: L1 (feature 추출) → **여기** → L2 (스코어링) 사이

**역할**: 유저의 멀티 스냅으로부터 최적 패턴 정의를 자동 탐색.
어떤 feature가 핵심인지, 어떤 delta가 중요한지, timing 범위는 어떤지 — 전부 시스템이 찾는다.

**왜 필요한가**: 유저는 "여기서 올랐어"는 알지만, "왜 올랐는지"의 정확한 조건은 모른다.
급락이 -10%인지 -15%인지, OI가 +20%인지 +40%인지 — 이걸 사람이 정하면 D12처럼 FAIL.
시스템이 자동으로 범위를 탐색해서 승률 최적 조합을 찾아야 한다.

```python
class PatternRefiner:
    """
    유저 예시(타임스탬프)로부터 최적 패턴 정의를 자동 탐색.
    Karpathy autoresearch의 NEVER STOP 루프를 패턴 정제에 적용.

    핵심: 하나의 방법론이 아니라, 여러 방법론을 경쟁시킨다.
    어떤 방법론이 이 패턴을 가장 잘 잡는지도 시스템이 알아서 찾는다.
    """

    strategies: list[RefinementStrategy] = [
        FeatureOutlierStrategy(),    # z-score 기반 특이 feature 탐색
        CosineSimilarityStrategy(),  # feature vector 통째로 유사도
        TreeImportanceStrategy(),    # LightGBM feature importance
        ShapeMatchStrategy(),        # 가격 구조 shape matching (DTW)
        # ... 새 방법론 추가 가능
    ]

    def refine(
        self,
        anchor: FeatureSnapshot,
        feature_db: pd.DataFrame,
        max_iterations: int = 200,
    ) -> list[RefinedPattern]:
        """모든 전략을 돌려서 결과를 score 순으로 반환."""
        results = []
        for strategy in self.strategies:
            pattern = strategy.search(anchor, feature_db, max_iterations)
            results.append(pattern)
        return sorted(results, key=lambda p: p.score, reverse=True)


class RefinementStrategy(Protocol):
    """각 방법론이 구현하는 인터페이스."""
    def search(self, anchor, feature_db, max_iter) -> RefinedPattern: ...


class FeatureOutlierStrategy:
    """방법 1: anchor에서 z-score 높은 feature → threshold 범위 탐색."""
    def search(self, anchor, feature_db, max_iter) -> RefinedPattern:
        candidates = self._find_outlier_features(anchor, feature_db)
        best = None
        for i in range(max_iter):
            subset = sample_feature_subset(candidates)
            thresholds = search_thresholds(anchor, subset, feature_db)
            cases = find_matching_cases(feature_db, subset, thresholds)
            score = calc_score(win_rate(cases), len(cases))
            if best is None or score > best.score:
                best = RefinedPattern(subset, thresholds, cases, score)
        return best


class TreeImportanceStrategy:
    """방법 2: anchor 주변 positive/negative로 LightGBM 학습 → 중요 feature 발견."""
    def search(self, anchor, feature_db, max_iter) -> RefinedPattern:
        # anchor와 유사한 시점들을 positive, 나머지를 negative로
        # LightGBM 학습 → feature importance → 핵심 feature 추출
        # 그 feature 기준으로 threshold 탐색
        ...


class CosineSimilarityStrategy:
    """방법 3: feature vector 통째로 cosine similarity."""
    ...


class ShapeMatchStrategy:
    """방법 4: 가격 시계열 shape matching (DTW 등)."""
    ...
```

**구조의 핵심**:
- 방법론 자체가 플러그인. 새로운 아이디어 → Strategy 하나 추가하면 끝.
- 모든 전략이 같은 anchor + feature_db를 받고, 같은 RefinedPattern을 반환.
- 결과를 score 순으로 정렬 → "이 패턴은 TreeImportance 방식이 제일 잘 잡네요" 까지 알려줌.
- autoresearch의 NEVER STOP 루프가 **전략 안에서도** (threshold 탐색) **전략 간에도** (어떤 전략이 좋은지) 작동.

**핵심 차이 (vs v1 autoresearch)**:

| | v1 autoresearch | v2 Pattern Refinement |
|---|---|---|
| 탐색 대상 | building block 조합 | **방법론 자체** + threshold 범위 |
| 입력 | wizard interview (규칙) | 타임스탬프 (예시) |
| 판단 | match.py (hand-crafted) | 통계적 승률 (자동) |
| 확장 | 블록 추가 | **Strategy 클래스 추가** |
| 실패 원인 | indicator soup (사람이 선택) | N/A — 방법론 선택도 자동 |

### 3.2 L2 — Scoring (LightGBM + Similarity Search)

**기존**: LightGBM classifier → P(win) per bar ✅

**v2 추가**: 유사도 검색 엔진

```python
class SimilaritySearch:
    """feature vector 공간에서 유사한 과거 시점을 찾는다."""

    def __init__(self, feature_db: pd.DataFrame):
        """feature_db: 전체 히스토리의 feature snapshot 모음."""
        self.scaler = StandardScaler().fit(feature_db)
        self.normalized = self.scaler.transform(feature_db)

    def find_similar(
        self,
        query_vector: np.ndarray,
        top_k: int = 100,
        min_similarity: float = 0.8,
    ) -> list[SimilarCase]:
        """
        코사인 유사도 기반으로 과거 유사 케이스를 반환.
        각 케이스에는 이후 7일 수익률 (라벨) 포함.
        """
        similarities = cosine_similarity(
            self.scaler.transform(query_vector.reshape(1, -1)),
            self.normalized
        )[0]
        top_indices = np.argsort(similarities)[-top_k:]
        return [
            SimilarCase(
                timestamp=self.feature_db.index[i],
                symbol=self.feature_db.iloc[i]["symbol"],
                similarity=similarities[i],
                outcome_7d=self.feature_db.iloc[i]["future_return_7d"],
            )
            for i in top_indices
            if similarities[i] >= min_similarity
        ]

    def win_rate(self, cases: list[SimilarCase], threshold: float = 0.30) -> float:
        """유사 케이스 중 threshold 이상 상승한 비율."""
        wins = sum(1 for c in cases if c.outcome_7d >= threshold)
        return wins / len(cases) if cases else 0.0
```

**LightGBM 은 기존과 동일**: feature vector → P(win). 유사도 검색과 LightGBM 스코어를 결합하여 최종 알림 여부 결정.

### 3.3 L3 — Language (LLM)

**역할 3가지** (판단 없음):

| 역할 | 입력 | 출력 | 예시 |
|------|------|------|------|
| 쿼리 파싱 | 자연어 | 구조화된 조건 | "bb_squeeze + oi_up" → `{bb_width: {lt: 0.02}, oi_change_pct: {gt: 20}}` |
| 결과 설명 | feature snapshot + P(win) | 한국어 설명 | "CVD 다이버전스 + OI 급등. 과거 69% 반등" |
| 패턴 등록 파싱 | 복기 텍스트 + 타임스탬프 | feature query | TRADOOR 복기 → 추출할 feature 목록 |

**구현 옵션**:
- Phase E LoRA (Llama-3.2-1B fine-tune) — 오프라인, 저비용
- Claude API — 온라인, 고품질, 비용 발생
- 하이브리드 — 파싱은 LoRA, 복잡한 설명은 API

### 3.4 L4 — Execution (Scan + Alert)

**백테스트**: 기존 `simulator.py` + `pnl.py` ✅ 그대로 사용

**실시간 스캔** (신규):

```python
# tools/realtime_scanner.py — 1시간 cron
def scan_cycle():
    for symbol in ALL_SYMBOLS:
        features = compute_features(load_latest_klines(symbol))
        events = detect_events(features)
        if events:
            score = lgb_model.predict(features)
            similar = similarity_search.find_similar(features)
            win_rate = similar.win_rate(threshold=0.30)
            if score > THRESHOLD and win_rate > 0.60:
                send_alert(
                    symbol=symbol,
                    events=events,
                    score=score,
                    similar_cases=len(similar),
                    win_rate=win_rate,
                )
```

**알림 포맷**:
```
🔥 PTB 트리거됨
이벤트: 4H -15% 급락 + OI +40%
P(win): 0.72
유사 과거: 287건 중 198건 반등 (69%)
조건: bb_squeeze + oi_spike + funding_negative
```

**실행 엔진 옵션**:
- 자체 cron (MVP) — 단순, 빠름
- freqtrade 위에 올리기 (프로덕션) — 검증된 실행 인프라

### 3.5 L5 — Learning (Feedback Loop)

```
유저 트레이딩 결과
       │
       ▼
trade_log.csv 기록
  (symbol, entry_time, exit_time, pnl, pattern_type, features_at_entry)
       │
       ▼
주기적 재학습 (weekly 또는 N trades 마다)
  1. trade_log → 새 학습 데이터로 추가
  2. LightGBM 재학습 (expanding window)
  3. feature importance 재계산
  4. 유사도 검색 DB 업데이트
       │
       ▼
모델 개선 → 스캔 정확도 향상
```

**FreqAI adaptive retraining 참고**: freqtrade 의 FreqAI 는 별도 스레드에서 지속적으로 재학습. 이 패턴을 L5 에서 차용 가능.

---

## §4 쿼리 언어 (유저 인터페이스)

### 4.1 예시

```
BTC 4h recent_rally 8% + bb_squeeze + oi_up + funding_positive
ETH 1h breakdown retest + cvd_down + open_interest_expand
SOL 15m high_beta breakout but perp crowded
BTC vs ETH 4h relative_strength divergence
find alts with 1d squeeze + 4h expansion + volume regime shift
```

### 4.2 문법

```
<query> ::= [<symbol>] [<timeframe>] <condition> ("+" <condition>)* ["but" <warning>]*
           | "find alts with" <condition> ("+" <condition>)*
           | <symbol> "vs" <symbol> <timeframe> <comparison>

<condition> ::= <feature_name> [<operator> <value>]
<warning>   ::= <feature_name> [<operator> <value>]
<timeframe> ::= "15m" | "1h" | "4h" | "1d"
```

### 4.3 feature 어휘 (v2)

| 카테고리 | 어휘 | feature_calc 매핑 |
|----------|------|-------------------|
| 가격 구조 | recent_rally, breakdown, retest, squeeze, expansion | price_change_*, bb_width, bb_position |
| 모멘텀 | high_beta, breakout, dead_cross | atr_pct, ema_alignment, macd_hist |
| 온체인 | oi_up, oi_down, cvd_up, cvd_down, funding_positive, funding_negative | oi_change_pct, cvd_score, funding_rate |
| 포지션 | perp_crowded, net_longs_up, net_shorts_up | net_longs_change_pct, net_shorts_change_pct |
| 볼륨 | volume_spike, volume_regime_shift | volume_zscore, volume_ratio |
| 크로스 에셋 | relative_strength, divergence, coupling | 신규 구현 필요 |

---

## §5 기존 인프라 보존

### 5.1 그대로 쓰는 것

| 모듈 | 파일 | v2 에서의 역할 |
|------|------|---------------|
| feature_calc | `scanner/feature_calc.py` | L1 핵심 (OI/CVD 채우면 됨) |
| LightGBM | `challenges/classifier-training/` | L2 스코어링 |
| path walker | `scanner/pnl.py` | L4 백테스트 |
| portfolio | `backtest/portfolio.py` | L4 백테스트 |
| simulator | `backtest/simulator.py` | L4 백테스트 |
| metrics | `backtest/metrics.py` | L5 측정 |
| regime filter | `backtest/regime.py` | L1 feature 로 편입 |
| walk-forward | `tools/walk_forward.py` | 검증 파이프라인 |
| data cache | `data_cache/` | L0 OHLCV |
| 302 tests | `tests/` | 전부 유지 |

### 5.2 수정하는 것

| 모듈 | 변경 내용 |
|------|-----------|
| `feature_calc.py` | OI/CVD/펀딩비 placeholder → CoinGlass 실제 데이터 |
| `data_cache/` | CoinGlass 히스토리 수집기 추가, 멀티 TF 지원 |
| `RiskConfig` | 이벤트 트리거 조건 추가 |

### 5.3 새로 만드는 것

| 모듈 | 역할 | 우선순위 |
|------|------|---------|
| `data/coinglass.py` | CoinGlass API 연결 + 캐시 | ★★★ 최우선 |
| `search/similarity.py` | feature vector 유사도 검색 | ★★★ |
| `search/pattern_refiner.py` | 타임스탬프 → 최적 패턴 정의 자동 탐색 (autoresearch) | ★★★ |
| `scan/event_detector.py` | 급락/OI급등/스퀴즈 이벤트 감지 | ★★☆ |
| `scan/realtime_scanner.py` | 실시간 1000코인 스캔 (D18) | ★★☆ |
| `alert/telegram_bot.py` | 텔레그램 알림 발송 | ★☆☆ |
| `learn/feedback_loop.py` | trade_log → 재학습 (L5) | ★☆☆ |
| `parse/query_parser.py` | 자연어 쿼리 파싱 (L3) | ★☆☆ |

---

## §6 Roadmap (v2)

### Phase 1: 데이터 기반 (1-2주)

```
D17a: CoinGlass API 연결 — OI, CVD, 펀딩비, Net Longs/Shorts
D17b: feature_calc placeholder → 실제 데이터 교체
D17c: CoinGlass 히스토리 수집 (백테스트용)
D17d: 멀티 타임프레임 (15m, 4h, 1d)
Gate: LightGBM 재학습 시 ceiling +2.08% → +3%+ 이동
```

### Phase 2: 유사도 + 이벤트 + 패턴 정제 (2-3주)

```
S1: 유사도 검색 엔진 (cosine/KNN on feature space)
S2: 이벤트 감지 (급락, OI급등, 스퀴즈, 돌파)
S3: Pattern Refinement 엔진 (autoresearch 편입)
    - 타임스탬프 입력 → outlier feature 식별
    - threshold 범위 자동 탐색
    - 핵심 feature vs 노이즈 분리
    - NEVER STOP 루프로 최적 조합 발견
S4: "패턴 예시 등록" → feature snapshot → 정제 → 승률 리포트
Gate: "TRADOOR 2024-11-22" 입력만으로 최적 패턴 정의 + 유사 케이스 50건+ + 승률
```

### Phase 3: 실시간 스캔 + 알림 (1주)

```
D18: 실시간 스캐너 (cron 1h)
D19: 텔레그램 알림 봇
Gate: 1주 무사 운용, signal 빈도 ≈ 백테스트
```

### Phase 4: 학습 루프 (2주)

```
L5a: trade_log 기록 시스템
L5b: 주기적 LightGBM 재학습
L5c: feature importance 리포트 → "funding 추가하면 승률 +15%"
Gate: 1달 후 모델 승률이 초기보다 향상
```

### Phase 5: 제품화 (이후)

```
웹 대시보드 (D19 확장)
자연어 쿼리 파싱 (L3)
유저 온보딩 플로우
구독 모델
```

---

## §7 경쟁 분석

### 7.1 기존 도구와 차별점

| 도구 | 한계 | WTD 차별점 |
|------|------|-----------|
| TradingView | 단순 조건만, OI/CVD 없음 | 온체인 데이터 + 유사도 검색 |
| CoinGlass | 데이터만, 스캔/알림 없음 | 자동 스캔 + 학습 |
| GMGN | 밈코인 온체인만, 선물 없음 | 선물 데이터 통합 |
| freqtrade | 코딩 필요 | 자연어 + 예시 기반 |
| ai-hedge-fund | LLM 판단 → 재현 불가 | LightGBM 판단 → 재현 가능 |
| TradingAgents | LLM 판단 → 실거래 불가 | 스캐너 (판단은 유저) |

### 7.2 해자

1. **데이터 파이프라인**: CoinGlass + OHLCV + 멀티 TF 통합 자체가 진입장벽
2. **유사도 DB**: 유저가 많아질수록 검증된 패턴 데이터 축적
3. **학습 루프**: 쓸수록 모델 개선 → 전환 비용
4. **판단 분리**: 시스템은 눈, 트레이더가 뇌 → 알파 공유 아님

---

## §8 기존 검증 결과 보존

D8-D16 의 검증 결과는 v2 에서도 유효:

| 검증 | 결과 | v2 활용 |
|------|------|--------|
| Stage 1 (D12) | btc-macd-style PASS | 백테스트 엔진 검증됨 |
| Stage 2 (D16) | walk-forward 87% positive | 검증 파이프라인 검증됨 |
| D14 param sweep | stop=2.5%, target=10% 최적 | 기본 리스크 파라미터 |
| D15 regime | chop_skip +3.40% | regime feature 유효성 확인 |
| D10 ceiling | +2.08% (28 features) | OI/CVD 추가 시 상한 이동 기대 |
| Bonferroni k=23 | 보정 후 유의미 패턴 존재 | 통계적 엄밀성 유지 |

---

## §9 참고 레포 정리

| 레포 | 용도 | 메모 |
|------|------|------|
| freqtrade/FreqAI | L4 실행 엔진 후보, L5 adaptive retraining 참고 | LightGBM 기반 동일 구조 |
| vnpy v4.0 Alpha | L1+L2 참고 (Alpha158 + Lasso → LightGBM) | Microsoft Qlib 기반 |
| options-gpt | Phase E QLoRA 구현 참고 | Unsloth 30x + MLX |
| NautilusTrader | 프로덕션 전환 시 고려 | Rust, nanosecond 정밀도 |
| Self-Org 논문 | Swarm 아키텍처 참고 (Sequential protocol) | 트레이딩 아님, 조직 태스크 |

---

## §10 리스크

| # | 리스크 | 심각도 | 완화 |
|---|--------|--------|------|
| 1 | CoinGlass API 제한/비용 | 높음 | 무료 tier 확인, 캐시 적극 활용 |
| 2 | OI/CVD 히스토리 부족 (백테스트 불가) | 높음 | 지금부터 수집 시작, 있는 만큼만 백테스트 |
| 3 | 유사도 검색이 noise 에 취약 | 중간 | feature 정규화 + 차원 축소 (PCA) |
| 4 | 알파 붕괴 (패턴 공유 시) | 중간 | 시스템이 파는 건 눈이지 알파가 아님 |
| 5 | 멀티 TF 데이터 폭발 | 중간 | 이벤트 기반 → 모든 바를 스캔하지 않음 |
| 6 | LLM 파싱 부정확 | 낮음 | 초기엔 구조화된 입력으로 시작, L3 는 나중 |
