# Pattern Engine — 설계 문서

> CTO + AI Researcher 관점에서 작성
> 작성일: 2026-04-13
> 기반: TRADOOR/PTB 매매복기 + 현재 엔진 아키텍처 감사

---

## 0. 왜 이걸 만드는가

트레이더가 하는 일:
1. 차트 보며 "이거 예전 트라도어랑 비슷한데" 감지
2. 수동으로 복기 작성
3. 비슷한 종목을 눈으로 뒤짐
4. 진입 타이밍 놓치거나 손실

우리가 대신 해야 할 일:
1. 전 종목 24시간 감시
2. 패턴 자동 인식 → Phase 분류
3. 진입 구간 진입 시 알림
4. 맞았는지 틀렸는지 기록

**해자가 되려면 4개가 붙어야 한다:**

```
Pattern Object     → 사건을 구조화된 패턴으로 저장
State Machine      → 지금 이 종목이 그 패턴의 어느 phase인지 판단
Result Ledger      → 그 패턴이 실제로 먹혔는지 계속 기록
User Refinement    → 같은 패턴도 유저마다 다르게 다듬음
```

---

## 1. Pattern Object

### 1.1 개념

패턴은 "하나의 스냅샷"이 아니라 **시간 순서가 있는 이벤트 시퀀스**다.

TRADOOR/PTB 복기에서 추출한 패턴 구조:

```
TRADOOR_PATTERN := [
  Phase.FAKE_DUMP,       # 가짜 신호 (OI 소폭, 거래량 적음)
  Phase.ARCH_ZONE,       # 번지대 형성 (진입 금지)
  Phase.REAL_DUMP,       # 진짜 신호 (OI 급등 + 거래량 폭발)
  Phase.ACCUMULATION,    # 축적 (저점↑, 펀비 전환, OI 유지)
  Phase.BREAKOUT,        # 급등 (50~100%+)
]
```

### 1.2 PatternObject 스키마

```python
# engine/patterns/types.py

@dataclass
class PhaseCondition:
    """한 Phase를 정의하는 조건 묶음"""
    phase_id: str                        # "REAL_DUMP", "ACCUMULATION" 등
    label: str                           # 한국어 설명
    required_blocks: list[str]           # 반드시 충족해야 하는 블록
    optional_blocks: list[str]           # 보조 시그널 (있으면 신뢰도 ↑)
    disqualifier_blocks: list[str]       # 이게 있으면 이 phase 아님
    min_bars: int                        # 최소 지속 봉 수
    max_bars: int                        # 최대 지속 봉 수 (timeout)
    timeframe: str                       # "15m", "1h", "4h"

@dataclass
class PatternObject:
    """구조화된 패턴"""
    slug: str                            # "tradoor-oi-reversal"
    name: str                            # "OI 급등 반전 패턴"
    description: str                     # 복기 내용 요약
    created_by: str                      # user_id or "auto"
    created_at: datetime

    # 패턴의 핵심: Phase 시퀀스
    phases: list[PhaseCondition]         # 순서대로 충족해야 함
    entry_phase: str                     # 진입 구간 phase_id
    target_phase: str                    # 목표 phase_id (성공 판정 기준)

    # 패턴을 정의한 예시 인스턴스 (스냅)
    anchor_snaps: list[PatternSnap]      # 유저가 "이거야" 표시한 시점들
    feature_vector: list[float]          # 앵커 snaps의 평균 feature vector

    # 메타
    timeframe: str                       # 주 분석 TF
    universe_scope: str                  # "binance_perp_all", "binance_30"
    tags: list[str]                      # ["oi_reversal", "whale_short", "altcoin"]
    version: int                         # refinement 횟수

@dataclass
class PatternSnap:
    """패턴의 한 시점 스냅샷"""
    symbol: str
    timestamp: datetime
    timeframe: str
    phase_id: str                        # 이 스냅이 어느 phase인지
    feature_vector: list[float]          # 92개 feature
    screenshot_path: str | None          # 선택적 시각 레퍼런스
    user_note: str | None                # 유저 메모
    label: str                           # "entry", "phase2", "top" 등
```

### 1.3 TRADOOR 패턴 실제 인스턴스

```python
TRADOOR_OI_REVERSAL = PatternObject(
    slug="tradoor-oi-reversal-v1",
    name="OI 급등 반전 패턴 (TRADOOR/PTB형)",
    description="""
        급락 + OI 급등 두 번. 두 번째 급락이 진짜.
        이후 저점↑ 고점↑ + 펀비 양전환 = 진입 구간.
        OI 재급등 시 50~100% 목표.
    """,
    phases=[
        PhaseCondition(
            phase_id="FAKE_DUMP",
            label="가짜 신호 (관망)",
            required_blocks=["recent_decline", "funding_extreme"],
            optional_blocks=["volume_spike"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=6,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ARCH_ZONE",
            label="번지대 형성 (진입 금지)",
            required_blocks=["sideways_compression"],
            optional_blocks=["volume_dryup"],
            disqualifier_blocks=["oi_spike_with_dump"],
            min_bars=4, max_bars=48,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="REAL_DUMP",
            label="진짜 신호 ← 핵심 이벤트",
            required_blocks=["oi_spike_with_dump", "volume_spike", "funding_extreme"],
            optional_blocks=["recent_decline"],
            disqualifier_blocks=[],
            min_bars=1, max_bars=4,
            timeframe="1h",
        ),
        PhaseCondition(
            phase_id="ACCUMULATION",
            label="축적 구간 ← 진입 구간",
            required_blocks=["higher_lows_sequence", "funding_flip", "oi_hold_after_spike"],
            optional_blocks=["volume_dryup", "bollinger_squeeze"],
            disqualifier_blocks=["recent_decline", "oi_spike_with_dump"],
            min_bars=6, max_bars=72,
            timeframe="15m",  # 더 세밀하게
        ),
        PhaseCondition(
            phase_id="BREAKOUT",
            label="브레이크아웃 (목표)",
            required_blocks=["breakout_above_high", "oi_change", "volume_spike"],
            optional_blocks=[],
            disqualifier_blocks=[],
            min_bars=1, max_bars=12,
            timeframe="15m",
        ),
    ],
    entry_phase="ACCUMULATION",
    target_phase="BREAKOUT",
    timeframe="1h",
    universe_scope="binance_perp_all",
    tags=["oi_reversal", "whale_short_squeeze", "altcoin", "perp"],
)
```

---

## 2. State Machine

### 2.1 개념

종목 하나가 패턴 속 어느 Phase에 있는지 판단하는 엔진.

```
BTCUSDT → Phase.NONE
PTBUSDT → Phase.ACCUMULATION  ← 알림 대상
TRADOOR → Phase.BREAKOUT      ← 이미 늦음
XYZUSDT → Phase.ARCH_ZONE     ← 대기
```

### 2.2 StateMachine 설계

```python
# engine/patterns/state_machine.py

class PatternStateMachine:
    """
    한 종목이 PatternObject의 어느 Phase에 있는지 추적.

    작동 방식:
    - Phase 0부터 순서대로 조건 충족 여부 확인
    - 현재 Phase 조건 충족 + 다음 Phase 조건 충족 → 전환
    - max_bars 초과 시 timeout → 패턴 무효화
    """

    def __init__(self, pattern: PatternObject):
        self.pattern = pattern
        # symbol → SymbolState
        self._states: dict[str, SymbolState] = {}

    def evaluate(
        self,
        symbol: str,
        features: dict[str, float],      # compute_features_table 결과
        blocks_triggered: list[str],      # 현재 봉에서 발동된 블록들
        timestamp: datetime,
    ) -> PhaseTransition | None:
        """
        현재 데이터로 이 종목의 Phase를 업데이트.
        Phase 전환이 발생하면 PhaseTransition 반환.
        """
        state = self._states.get(symbol, SymbolState(symbol))

        current_phase_idx = state.current_phase_idx
        current_phase = self.pattern.phases[current_phase_idx]

        # 현재 Phase timeout 체크
        if state.phase_entered_at:
            bars_in_phase = self._bars_since(state.phase_entered_at, timestamp)
            if bars_in_phase > current_phase.max_bars:
                # 패턴 무효화
                self._states[symbol] = SymbolState(symbol)  # 리셋
                return PhaseTransition(symbol, current_phase.phase_id, "NONE", "timeout")

        # 다음 Phase로 전환 가능한지 확인
        next_phase_idx = current_phase_idx + 1
        if next_phase_idx < len(self.pattern.phases):
            next_phase = self.pattern.phases[next_phase_idx]
            if self._phase_satisfied(next_phase, blocks_triggered):
                # 전환
                state.current_phase_idx = next_phase_idx
                state.phase_entered_at = timestamp
                state.phase_history.append((next_phase.phase_id, timestamp))
                self._states[symbol] = state
                return PhaseTransition(
                    symbol=symbol,
                    from_phase=current_phase.phase_id,
                    to_phase=next_phase.phase_id,
                    timestamp=timestamp,
                    is_entry_signal=(next_phase.phase_id == self.pattern.entry_phase),
                )

        return None

    def _phase_satisfied(self, phase: PhaseCondition, blocks: list[str]) -> bool:
        # required 블록 전부 있어야 함
        if not all(b in blocks for b in phase.required_blocks):
            return False
        # disqualifier 블록 하나라도 있으면 안 됨
        if any(b in blocks for b in phase.disqualifier_blocks):
            return False
        return True

    def get_current_phase(self, symbol: str) -> str:
        state = self._states.get(symbol)
        if not state:
            return "NONE"
        return self.pattern.phases[state.current_phase_idx].phase_id

    def get_entry_candidates(self) -> list[str]:
        """현재 진입 구간(ACCUMULATION)에 있는 종목 목록"""
        return [
            sym for sym, state in self._states.items()
            if self.pattern.phases[state.current_phase_idx].phase_id == self.pattern.entry_phase
        ]


@dataclass
class SymbolState:
    symbol: str
    current_phase_idx: int = 0
    phase_entered_at: datetime | None = None
    phase_history: list[tuple[str, datetime]] = field(default_factory=list)

@dataclass
class PhaseTransition:
    symbol: str
    from_phase: str
    to_phase: str
    timestamp: datetime
    reason: str = "condition_met"
    is_entry_signal: bool = False
```

### 2.3 Phase 전환 다이어그램

```
          NONE
           │ oi_spike_with_dump (약) + funding_extreme
           ▼
        FAKE_DUMP ──── timeout(6h) ────→ NONE
           │ sideways_compression
           ▼
        ARCH_ZONE ──── timeout(48h) ───→ NONE
           │ oi_spike_with_dump (강) + volume_spike + funding_extreme
           ▼
        REAL_DUMP ──── timeout(4h) ────→ NONE
           │ higher_lows + funding_flip + oi_hold
           ▼
      ACCUMULATION ─── timeout(72h) ───→ NONE
    ★ 알림 발송      │ breakout_above_high + volume_spike + oi_change
           ▼
        BREAKOUT  ──── 패턴 완료 ───────→ RESULT_LEDGER
```

---

## 3. Result Ledger

### 3.1 개념

패턴이 "먹혔는지" 계속 기록한다. 이게 쌓일수록 진짜 해자가 된다.

```
REAL_DUMP 이벤트 발생 → 기록 시작
ACCUMULATION 진입 → 진입 가격 기록
BREAKOUT 도달 → 성공 기록
timeout or 저점갱신 → 실패 기록
```

### 3.2 ResultLedger 스키마

```python
# engine/patterns/ledger.py

@dataclass
class PatternOutcome:
    """하나의 패턴 인스턴스 결과"""
    id: str                              # UUID
    pattern_slug: str                    # "tradoor-oi-reversal-v1"
    symbol: str
    user_id: str | None                  # None = auto-detected

    # 이벤트 타임라인
    real_dump_at: datetime               # Phase.REAL_DUMP 진입 시각
    accumulation_at: datetime | None     # Phase.ACCUMULATION 진입 시각
    breakout_at: datetime | None         # Phase.BREAKOUT 진입 시각
    invalidated_at: datetime | None      # 무효화 시각

    # 가격 데이터
    real_dump_price: float               # REAL_DUMP 시점 가격
    entry_price: float | None           # 실제 또는 예상 진입가 (ACCUMULATION 시점)
    peak_price: float | None            # BREAKOUT 후 고점
    invalidation_price: float | None    # 무효화 시점 가격

    # 결과
    outcome: Literal["success", "failure", "timeout", "pending"]
    max_gain_pct: float | None          # 최대 수익률 (entry → peak)
    duration_hours: float | None        # 진입 → 결과까지 시간

    # 시장 맥락
    btc_trend_at_entry: str             # "bullish", "bearish", "sideways"
    market_regime: str                  # "risk_on", "risk_off"

    # 유저 피드백 (있을 경우)
    user_verdict: Literal["valid", "invalid", "missed"] | None
    user_note: str | None

    created_at: datetime
    updated_at: datetime


class ResultLedger:
    """패턴 결과 저장소"""

    def __init__(self, db_path: str):
        self.db_path = db_path  # SQLite or 파일시스템

    def record_event(self, transition: PhaseTransition, context: dict) -> PatternOutcome:
        """Phase 전환 발생 시 호출"""
        ...

    def close_outcome(self, outcome_id: str, result: str, peak_price: float):
        """결과 확정 (success/failure)"""
        ...

    def get_stats(self, pattern_slug: str, user_id: str = None) -> PatternStats:
        """패턴 성과 통계"""
        ...

    def get_active_watches(self) -> list[PatternOutcome]:
        """현재 감시 중인 (pending) 인스턴스들"""
        ...


@dataclass
class PatternStats:
    pattern_slug: str
    total_instances: int
    success_rate: float                  # success / (success + failure)
    avg_gain_pct: float                  # 성공 케이스 평균 수익
    avg_duration_hours: float
    by_market_regime: dict[str, float]   # regime별 성공률
    by_btc_trend: dict[str, float]       # BTC 방향별 성공률
    recent_30d_success_rate: float
```

### 3.3 Ledger가 만드는 것

```
패턴 성과표 (자동 생성):
┌────────────────────────────────────────────────────┐
│  OI 급등 반전 패턴 (TRADOOR형)   v1               │
├─────────────────┬──────────────────────────────────┤
│  전체 성공률    │  68% (34/50)                     │
│  평균 수익률    │  +47% (성공 케이스)              │
│  평균 소요시간  │  18h                             │
├─────────────────┼──────────────────────────────────┤
│  BTC 상승장     │  81% 성공                        │
│  BTC 횡보장     │  65% 성공                        │
│  BTC 하락장     │  41% 성공 ← 주의                 │
├─────────────────┼──────────────────────────────────┤
│  최근 30일      │  72% (성과 개선 중)              │
└─────────────────┴──────────────────────────────────┘
```

---

## 4. User-Specific Refinement

### 4.1 개념

같은 TRADOOR 패턴이라도:
- 유저 A는 OI 스파이크 기준을 15%로 잡음
- 유저 B는 20%로 잡음
- 유저 C는 여기에 온체인 지표를 추가함

개인화된 패턴이 개인화된 ledger를 만들고, 개인화된 모델이 된다.

### 4.2 Refinement 구조

```python
# engine/patterns/refinement.py

@dataclass
class UserPatternConfig:
    """유저가 패턴 파라미터를 개인화한 설정"""
    user_id: str
    pattern_slug: str
    base_version: int                    # 기반한 원본 버전

    # 블록별 파라미터 오버라이드
    block_overrides: dict[str, dict]
    # 예:
    # {
    #   "oi_spike_with_dump": {"oi_threshold": 0.20},  # 기본 0.15 → 본인은 0.20
    #   "funding_extreme": {"threshold": -0.0015},      # 더 극단적일 때만
    #   "higher_lows_sequence": {"min_count": 4},       # 더 확실할 때만
    # }

    # 추가 조건 (선택)
    extra_required_blocks: dict[str, list[str]]  # phase_id → 추가 required 블록
    extra_disqualifiers: dict[str, list[str]]    # phase_id → 추가 disqualifier

    # 리파인먼트 이력
    refinement_history: list[RefinementEvent]
    created_at: datetime
    updated_at: datetime

@dataclass
class RefinementEvent:
    timestamp: datetime
    trigger: Literal["manual", "feedback", "auto_ml"]
    changes: dict                        # 변경 내용
    outcome_ids: list[str]              # 근거가 된 ledger 결과들


class UserRefinementEngine:
    """
    유저의 피드백으로 패턴을 점진적으로 개인화.

    두 가지 방식:
    1. Manual: 유저가 직접 파라미터 조정
    2. Auto ML: 유저의 verdict(valid/invalid) 기반으로 LightGBM 재학습
    """

    def apply_feedback(
        self,
        user_id: str,
        outcome_id: str,
        verdict: Literal["valid", "invalid"],
        note: str | None = None,
    ) -> UserPatternConfig:
        """
        유저 피드백 적용.
        N개 이상 쌓이면 자동 파라미터 조정 제안.
        """
        ...

    def suggest_refinement(
        self,
        user_id: str,
        pattern_slug: str,
        min_feedback_count: int = 10,
    ) -> dict:
        """
        축적된 피드백 분석 → 파라미터 조정 제안.
        LightGBM SHAP 기반.
        """
        ...

    def apply_refinement(
        self,
        user_id: str,
        pattern_slug: str,
        changes: dict,
    ) -> UserPatternConfig:
        """제안된 조정을 적용하고 새 버전 생성"""
        ...
```

### 4.3 개인화 흐름

```
1단계: 공유 패턴 사용
  유저 → "OI 급등 반전 패턴" 구독
  기본 파라미터로 알림 수신

2단계: 피드백 수집
  알림 받을 때마다 유저가 "valid / invalid" 판정
  10개 이상 쌓이면 분석 준비

3단계: 자동 개인화 제안
  시스템: "당신은 OI 15% 이상일 때만 valid 판정했네요.
           threshold를 15%로 올릴까요?"
  유저: 수락/거절

4단계: 개인화된 패턴 생성
  user_id + pattern_slug + overrides = 개인 버전
  이 버전의 별도 ledger 시작

5단계: 개인 모델 훈련
  20개 이상의 판정 → LightGBM per-user 재학습
  개인 패턴 감지 정확도 향상
```

---

## 5. Auto-Research Layer

### 5.1 이벤트 감지 → 패턴 자동 발견

```python
# engine/auto_research/detector.py

class AutoResearchDetector:
    """
    급등/급락 이벤트 자동 감지 → 패턴 후보 생성.

    트리거: 4시간 이내 ±10% 이상 움직임
    """

    async def on_significant_move(
        self,
        symbol: str,
        move_pct: float,
        timestamp: datetime,
    ):
        # 1. 이벤트 전후 데이터 수집
        pre_data = await self._collect_pre_event_data(symbol, timestamp)
        # T-48h ~ T-1h: 1m, 5m, 15m, 1h, 4h 전부

        # 2. Feature 계산
        features = compute_features_table(pre_data["1h"], symbol)

        # 3. 기존 패턴과 유사도 비교
        matches = self._match_known_patterns(features)

        # 4. LLM 분석 (선택적)
        analysis = await self._llm_analyze(pre_data, features, move_pct)

        # 5. Research Note 생성
        note = ResearchNote(
            symbol=symbol,
            trigger_move_pct=move_pct,
            timestamp=timestamp,
            feature_snapshot=features,
            matched_patterns=matches,
            llm_analysis=analysis,
            raw_data_path=self._save_raw(pre_data),
        )

        await self._save_note(note)

        # 6. 기존 패턴에 맞으면 State Machine에 넣기
        for match in matches:
            if match.similarity > 0.85:
                await self.state_machine.inject_event(symbol, match.pattern_slug)
```

### 5.2 LLM 분석 프롬프트

```python
LLM_ANALYSIS_PROMPT = """
당신은 크립토 선물 시장 전문 분석가입니다.

다음 데이터를 분석하고 패턴을 설명해주세요:

심볼: {symbol}
이벤트: {move_pct:.1f}% 변동 ({direction})
시각: {timestamp}

이벤트 직전 데이터 (최근 48h):
- OI 변화 타임라인: {oi_timeline}
- 펀딩비 타임라인: {funding_timeline}
- 거래량 프로파일: {volume_profile}
- RSI: {rsi}, BB 상태: {bb_state}

답변 형식:
1. 이 이동의 특징 (2-3줄)
2. 이벤트 전 셋업 조건 (항목별)
3. 이게 다음에 또 나올 가능성 있는 패턴인지
4. 유사한 알려진 패턴과의 비교

JSON으로 출력:
{{
  "pattern_type": "oi_reversal | short_squeeze | organic | unknown",
  "confidence": 0.0-1.0,
  "key_signals": ["signal1", "signal2"],
  "phase_before_move": "ACCUMULATION | ARCH_ZONE | ...",
  "replicable": true/false,
  "notes": "..."
}}
"""
```

---

## 6. 새로 만들어야 하는 Building Blocks

현재 엔진에 없지만 이 패턴에 필수적인 블록들:

### 6.1 oi_spike_with_dump

```python
# engine/building_blocks/confirmations/oi_spike_with_dump.py

def oi_spike_with_dump(
    ctx: SignalContext,
    price_drop_threshold: float = 0.05,   # 5% 이상 하락
    oi_spike_threshold: float = 0.15,     # 15% 이상 OI 증가
    volume_multiple: float = 2.0,         # 평균 거래량 2배 이상
    lookback_bars: int = 3,               # 몇 봉 이내
) -> bool:
    """
    급락 + OI 급등 + 거래량 폭발이 동시에 발생.
    세력 숏 진입 시그널.
    """
    recent = ctx.df.tail(lookback_bars)
    price_change = (recent["close"].iloc[-1] - recent["high"].iloc[0]) / recent["high"].iloc[0]
    oi_change = ctx.perp["oi_change_1h"].iloc[-1]
    vol_ratio = recent["volume"].mean() / ctx.df["volume"].tail(24).mean()

    return (
        price_change <= -price_drop_threshold and
        oi_change >= oi_spike_threshold and
        vol_ratio >= volume_multiple
    )
```

### 6.2 higher_lows_sequence

```python
def higher_lows_sequence(
    ctx: SignalContext,
    min_count: int = 3,       # 연속 저점 상승 횟수
    lookback_bars: int = 24,
) -> bool:
    """최근 N봉에서 swing low가 연속 상승"""
    lows = _find_swing_lows(ctx.df.tail(lookback_bars))
    if len(lows) < min_count:
        return False
    recent_lows = lows[-min_count:]
    return all(recent_lows[i] < recent_lows[i+1] for i in range(len(recent_lows)-1))
```

### 6.3 funding_flip

```python
def funding_flip(
    ctx: SignalContext,
    lookback_negative_bars: int = 8,  # 이전 N봉은 음수였어야 함
) -> bool:
    """펀딩비가 음수 → 양수로 전환. 롱스위칭 시그널."""
    funding = ctx.df["funding_rate"].tail(lookback_negative_bars + 1)
    was_negative = (funding.iloc[:-1] < 0).all()
    now_positive = funding.iloc[-1] > 0
    return was_negative and now_positive
```

### 6.4 oi_hold_after_spike

```python
def oi_hold_after_spike(
    ctx: SignalContext,
    spike_lookback: int = 24,    # 몇 봉 전에 spike가 있었는지
    hold_threshold: float = 0.8, # spike 대비 80% 이상 유지
) -> bool:
    """OI가 spike 후 유지되고 있음. 세력 포지션 청산 안 함."""
    oi_history = ctx.df["oi_change_1h"].tail(spike_lookback)
    max_oi = oi_history.max()
    current_oi = oi_history.iloc[-1]
    return max_oi > 0.10 and (current_oi / max_oi) >= hold_threshold
```

### 6.5 sideways_compression

```python
def sideways_compression(
    ctx: SignalContext,
    max_range_pct: float = 0.05,  # 가격 범위 5% 이내
    min_bars: int = 6,
) -> bool:
    """가격이 좁은 범위에서 횡보. 번지대 형성 감지."""
    recent = ctx.df.tail(min_bars)
    price_range = (recent["high"].max() - recent["low"].min()) / recent["close"].mean()
    return price_range <= max_range_pct
```

---

## 7. 데이터 파이프라인 확장

### 7.1 동적 유니버스

```python
# engine/universe/dynamic.py

async def load_dynamic_universe(
    min_volume_usd: float = 1_000_000,   # 최소 24h 거래량 $1M
    max_symbols: int = 300,
) -> list[str]:
    """
    바이낸스 USDT-M 선물 전 종목 동적 로딩.
    매일 갱신, 24h 거래량 기준 필터.
    """
    # GET /fapi/v1/exchangeInfo → 전체 USDT-M 심볼
    # GET /fapi/v1/ticker/24hr → 거래량 필터
    # 결과: ~200-300개 심볼 (PTB, TRADOOR 포함)
    ...
```

### 7.2 OI 히스토리 한계 해결

```
현재: 바이낸스 OI 히스토리 = 20일 (API 제한)

해결책 옵션:
A. Coinalyze API → 더 긴 히스토리 (유료)
B. 매일 스냅샷 저장 → 자체 히스토리 누적 (무료, 시간 필요)
C. OI 절대값 대신 상대 변화율만 사용 (현재 방식 유지)

→ 단기: C 유지 (지금도 작동)
→ 중기: B 구현 (매일 자동 저장으로 히스토리 누적)
```

---

## 8. 시스템 아키텍처 전체

```
┌─────────────────────────────────────────────────────────────────┐
│  AUTO-RESEARCH LAYER                                            │
│  ├── EventDetector: 전 종목 ±10% 이동 감지                      │
│  ├── LLM Analyzer: 차트 컨텍스트 → 패턴 언어화                   │
│  └── ResearchNote DB: 이벤트 기록 + 분석 저장                    │
└──────────────────────────┬──────────────────────────────────────┘
                           │ 패턴 후보
┌──────────────────────────▼──────────────────────────────────────┐
│  PATTERN LAYER                                                  │
│  ├── PatternObject: 이벤트 시퀀스로 패턴 정의                     │
│  ├── PatternLibrary: 패턴 저장소 (공유 + 개인)                   │
│  └── PatternSnap: 유저 수동 레이블 스냅                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  STATE MACHINE LAYER                                            │
│  ├── PatternStateMachine: 전 종목 Phase 추적                     │
│  ├── PhaseTransition: 전환 이벤트 발행                           │
│  └── AlertEngine: ACCUMULATION 진입 시 텔레그램/터미널 알림       │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  RESULT LEDGER LAYER                                            │
│  ├── PatternOutcome: 인스턴스별 결과 기록                         │
│  ├── PatternStats: 패턴 성과 통계                                │
│  └── UserFeedback: valid/invalid 유저 판정                      │
└──────────────────────────┬──────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│  REFINEMENT LAYER                                               │
│  ├── UserPatternConfig: 개인화된 파라미터                         │
│  ├── RefinementEngine: 피드백 → 파라미터 조정 제안               │
│  └── PerUserLightGBM: 개인 모델 재학습                           │
└─────────────────────────────────────────────────────────────────┘

                     ↕ 데이터 흐름
┌─────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                     │
│  ├── Dynamic Universe: 바이낸스 USDT-M ~300개                    │
│  ├── feature_calc.py: 92 features                               │
│  ├── Building Blocks: 29 + 5 new                                │
│  └── Data Cache: klines + OI + funding + on-chain               │
└─────────────────────────────────────────────────────────────────┘

                     ↕ API
┌─────────────────────────────────────────────────────────────────┐
│  APP LAYER (SvelteKit)                                          │
│  ├── ChartBoard: lightweight-charts (설치됨, 미연결)             │
│  ├── PatternSaveUI: "Save Setup" → challenge 생성               │
│  ├── PhaseMonitor: 현재 각 종목이 어느 Phase인지                  │
│  ├── LedgerView: 패턴 성과 대시보드                              │
│  └── RefinementUI: 파라미터 조정 인터페이스                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. 구현 로드맵

### Sprint 1 (1주) — 차트 + Save Setup
```
[ ] ChartBoard.svelte (lightweight-charts)
    - 캔들 + SMA5/20/60/150/200
    - 서브패널: RSI, OI, 펀딩비
    - 캔들 클릭 → timestamp 추출

[ ] WorkspaceGrid에 ChartBoard 통합
    - 중앙 패널 = 차트

[ ] "Save Setup" 버튼
    - {symbol, timestamp, tf} → POST /challenge/create
    - 저장 완료 → /lab 이동
```

### Sprint 2 (1주) — 새 블록 + 동적 유니버스
```
[ ] 새 building blocks 5개
    - oi_spike_with_dump
    - higher_lows_sequence
    - funding_flip
    - oi_hold_after_spike
    - sideways_compression

[ ] 동적 유니버스
    - engine/universe/dynamic.py
    - 바이낸스 USDT-M 전체 (~300개)
    - 거래량 필터 ($1M 이상)
```

### Sprint 3 (2주) — PatternObject + State Machine
```
[ ] PatternObject 타입 시스템
    - engine/patterns/types.py

[ ] TRADOOR 패턴 정의
    - 5 Phase, 조건 명시

[ ] PatternStateMachine
    - engine/patterns/state_machine.py
    - 전 종목 Phase 추적

[ ] 알림 연결
    - ACCUMULATION 진입 시 텔레그램
```

### Sprint 4 (1주) — Result Ledger
```
[ ] PatternOutcome DB (SQLite)
[ ] 결과 자동 기록
[ ] PatternStats 계산
[ ] LedgerView UI
```

### Sprint 5 (2주) — User Refinement + Auto-Research
```
[ ] UserPatternConfig
[ ] 피드백 UI (valid/invalid)
[ ] 파라미터 조정 제안
[ ] AutoResearchDetector
    - 급등/급락 이벤트 자동 감지
    - ResearchNote 생성
```

---

## 10. 성공 지표

```
3개월 후:
  [ ] 전 종목 (~300개) 24시간 감시
  [ ] TRADOOR형 패턴 Phase 자동 감지
  [ ] ACCUMULATION 알림 → 실제 진입 가능
  [ ] 인스턴스 50개 이상 ledger 기록
  [ ] 성공률 60% 이상 (시장 상황 감안)

6개월 후:
  [ ] 유저별 개인화 패턴 작동
  [ ] Auto-research 자동 발견 패턴 3개 이상
  [ ] LLM 분석 레포트 자동 생성
  [ ] 패턴 라이브러리 10개 이상
```

---

*이 문서는 TRADOOR/PTB 매매복기(2024-11-25)를 기반으로 작성되었습니다.*
*실제 구현 시 각 Sprint의 세부 스펙은 별도 태스크 문서로 분리합니다.*
