# W-0311 — 퀀트 리스크 엔진 v2 (Kelly + Regime-sized + Portfolio Guard)

> Wave: 4 | Priority: P1 | Effort: M
> Charter: In-Scope L4 (Execution Engine)
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: TBD

---

## Goal

Jin 페르소나가 패턴 신호를 받을 때 **감정 없이 최적 포지션 크기와 stop**을 받아 실행할 수 있다.

현재 `FixedStopPolicy`는 모든 신호에 200 USDT 고정 손절 + 1.5 ATR 단일 stop을 적용한다.
이 정책은 **신호의 통계적 우월성(hit_rate × R:R)을 사이즈에 반영하지 못하고**, regime/portfolio 조건도 무시한다.

W-0311은 이 한계를 깬다:

1. **Kelly Criterion**으로 신호별 statistical edge를 사이즈에 직접 매핑.
2. **Regime multiplier**로 매크로 환경별 expected edge 차이를 반영.
3. **Portfolio correlation guard**로 동방향 패턴 동시발화 시 중복 리스크 차감.
4. **Dynamic ATR stop**으로 regime별 변동성 비대칭에 적응.
5. **Rolling 30d Sharpe/Sortino/Calmar**로 시스템 수익성 실시간 추적.

기존 `FixedStopPolicy`는 fallback 모드로 보존하여 cold-start (hit_rate 표본 < 10) 시 그대로 사용.

---

## Owner

engine

---

## Scope

### 포함

- `engine/patterns/risk_policy.py`: `KellyPolicy` dataclass 추가 (기존 `FixedStopPolicy` 보존).
- `engine/patterns/portfolio_guard.py`: 신규 모듈 — 동방향 패턴 카운트 + correlation penalty.
- `engine/research/validation/sizing.py`: 신규 모듈 — `regime_multiplier()`, `dynamic_atr_multiplier()`, `apply_portfolio_penalty()` 순수 함수.
- `engine/research/validation/performance_tracker.py`: 신규 — rolling Sharpe/Sortino/Calmar 계산 (verdict feed 기반).
- `engine/tests/test_kelly_policy.py`: 신규 (15+ 테스트).
- `engine/tests/test_portfolio_guard.py`: 신규 (10+ 테스트).
- `engine/tests/test_sizing.py`: 신규 (8+ 테스트).
- `engine/tests/test_performance_tracker.py`: 신규 (6+ 테스트).
- 통합 지점: `engine/scoring/ensemble.py` — STRONG_LONG verdict가 `KellyPolicy.summary()`를 호출하도록 wiring.

### Non-Goals

- **실제 주문 집행 (exchange API)**: 별도 layer (W-0309 Decision HUD 또는 후속 W-0312).
- **Multi-account / sub-account allocation**: account_equity는 단일 값으로 가정.
- **Multi-asset class (옵션, 페어 트레이드)**: 단방향 spot/perp 롱숏만.
- **Volatility targeting (target σ)**: regime multiplier로 대체. 별도 sigma-target은 W-0313 후보.
- **ML-based hit_rate prediction**: 30d rolling 빈도 통계만 사용. ML predictor는 W-0314 후보.
- **Black-Litterman / risk parity 포트폴리오 최적화**: scope 외. 단순 correlation penalty만.

---

## CTO 관점

### 알고리즘 설계 (수식 포함)

#### 1. Kelly Criterion (Fractional)

Edward Thorp / Kelly (1956) 원공식:

```
f* = (b * p - q) / b
```

여기서:
- `b` = 승리 시 R:R (= target_dist / stop_dist). 기본 3.0 (FixedStopPolicy 호환).
- `p` = pattern hit_rate (30일 rolling, 최소 10 verdict 표본).
- `q` = 1 - p.

**Fractional Kelly** (과적합 / 파산 회피):
```
f_used = kelly_fraction * f*    # kelly_fraction = 0.25 기본
```

**Position size**:
```
position_usdt = account_equity * f_used * regime_mult * portfolio_mult
position_coin = position_usdt / entry_price
```

**경계 조건**:
- `p < 1/(1+b)` → `f* ≤ 0` → **진입 차단** (Kelly negative).
- `n_samples < 10` → KellyPolicy unavailable → `FixedStopPolicy` fallback.
- `f_used > kelly_cap` (기본 0.25) → clamp. 단일 신호 한 번에 25% 이상 절대 베팅 안함.
- `position_usdt < min_position_usdt` (기본 50 USDT) → 거래 비용 효율 미달 → 진입 스킵.

**검증 예시** (AC1):
```
account_equity = 1000 USDT, hit_rate = 0.60, rr = 3.0
f* = (3 * 0.60 - 0.40) / 3 = (1.80 - 0.40) / 3 = 1.40 / 3 = 0.4667
f_used = 0.25 * 0.4667 = 0.1167
position_usdt = 1000 * 0.1167 = 116.7 USDT  (regime/portfolio 1.0 가정)
```
→ 검증값: `f* ≈ 0.467`, `f_used ≈ 0.117`, `position_usdt ≈ 117 USDT`.

#### 2. Regime Multiplier

```
regime_mult = {
    BULL:    1.2,
    BEAR:    0.6,
    RANGE:   0.8,
}
```

근거 (W-0290 regime study, 30d rolling):
- BULL 구간 long-side 패턴 mean_net_bps ~ +18 bps, hit_rate ~ 0.62 → upsize 정당.
- BEAR 구간 long-side 패턴 mean_net_bps ~ +6 bps, hit_rate ~ 0.51 → downsize.
- RANGE 구간 mean_net_bps ~ +9 bps, hit_rate ~ 0.55 → 중립.

**Vol axis 보정** (W-0290 Phase 1 5-label vol axis 활용):
```
if vol_label == HIGH_VOL:
    regime_mult *= 0.85   # 추가 디스카운트 (whipsaw 위험)
elif vol_label == LOW_VOL:
    regime_mult *= 1.05   # 소폭 부스트 (낮은 noise)
```

최종 `regime_mult`는 [0.4, 1.4] 범위로 clamp.

#### 3. Portfolio Correlation Penalty

**문제**: 같은 패턴 family (예: bullish_engulfing) 또는 같은 방향(LONG)으로 여러 심볼이 동시에 신호를 내면, 매크로 베타 노출이 중첩되어 단일 사이즈 가정이 깨진다.

**알고리즘**:

```python
def portfolio_penalty(
    open_positions: list[OpenPosition],
    new_direction: Direction,
    new_pattern_family: str,
    same_family_threshold: int = 2,
    same_direction_threshold: int = 2,
) -> float:
    """
    Returns multiplier in (0, 1].
    """
    same_dir = sum(1 for p in open_positions if p.direction == new_direction)
    same_family = sum(
        1 for p in open_positions
        if p.pattern_family == new_pattern_family
    )

    penalty = 1.0
    # Rule A: 동일 방향 2개 이상 활성 → 50% 감소
    if same_dir >= same_direction_threshold:
        penalty *= 0.5
    # Rule B: 동일 패턴 family 2개 이상 → 추가 30% 감소
    if same_family >= same_family_threshold:
        penalty *= 0.7
    # Rule C: open_positions가 5개 이상이면 portfolio 한도 초과 → 0.0 (block)
    if len(open_positions) >= 5:
        penalty = 0.0
    return penalty
```

**근거**:
- 같은 방향 패턴 2개 동시발화 시 두 포지션 returns의 spearman corr 평균 0.55+ (BTC 베타 dominant).
- naive sum-of-Kelly은 corr=0 가정 → corr=0.55 일 때 실제 variance 1.55× → 사이즈 1/√1.55 ≈ 0.80×.
- 보수적으로 0.5× 적용 (Markowitz adj 보다 더 디펜시브, fat-tail buffer).

**검증 예시** (AC3):
```
open: [LONG BTCUSDT (hammer), LONG ETHUSDT (hammer)]
new signal: LONG SOLUSDT (hammer)
same_dir=2 → penalty *= 0.5
same_family=2 (hammer) → penalty *= 0.7
final penalty = 0.5 * 0.7 = 0.35
position_usdt_final = base * 0.35
```

→ AC3는 "동일방향 2개 동시 → 50% 감소"만 검증. family penalty는 별도 테스트.

#### 4. Dynamic ATR Stop

```
atr_mult = {
    BULL:  1.2,   # tight stop, trend-follow
    BEAR:  2.0,   # wide stop, whipsaw 흡수
    RANGE: 1.5,   # 기본
}
```

근거:
- BEAR regime에서 reversal 패턴 평균 max_adverse_excursion (MAE) = 1.83 ATR.
- BULL 추세 따라가는 entry는 MAE 평균 0.95 ATR → 1.2 ATR이면 95th pctile cover.
- RANGE는 기존 1.5 ATR 유지 (FixedStopPolicy 호환).

**Vol-adjusted final**:
```
final_atr_mult = base_atr_mult[regime]
if vol_label == HIGH_VOL:
    final_atr_mult *= 1.15    # 더 넓게
elif vol_label == LOW_VOL:
    final_atr_mult *= 0.95    # 더 좁게

stop_dist = final_atr_mult * atr
stop_price = entry_price - stop_dist          # for LONG
```

**경계**: `stop_dist_pct = stop_dist / entry < 0.5%` 일 때 → 최소 0.5% 강제 (slippage buffer).

#### 5. Rolling 30d Sharpe / Sortino / Calmar

**Sharpe** (annualized, hourly horizon):
```
SR = (mean(returns) / std(returns, ddof=1)) * sqrt(periods_per_year / horizon_hours)
periods_per_year = 365 * 24 = 8760    # crypto 24/7 (W-0286 fix)
```

**Sortino** (downside-only deviation):
```
downside = returns[returns < 0]
DD = sqrt(mean(downside ** 2))         # downside deviation, threshold=0
SO = (mean(returns) / DD) * sqrt(periods_per_year / horizon_hours)
```

**Calmar** (return / max drawdown):
```
cum_returns = cumprod(1 + returns) - 1
running_max = maximum.accumulate(cum_returns + 1)
dd = (cum_returns + 1) / running_max - 1   # drawdown series, ≤ 0
max_dd = abs(min(dd))
ann_return = (1 + total_return) ** (periods_per_year / n) - 1
CALMAR = ann_return / max_dd if max_dd > 0 else inf
```

**Rolling window**: 30일 = 30 × 24 = 720 hourly bar (또는 verdict 단위 window).
**Update trigger**: 매 verdict resolution 후 (`outcome_resolver` 1h scheduler hook).
**Persistence**: `state/perf_rolling_30d.json` (JSON; agent가 다음 사이클에 read).

---

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Kelly overshoot (small n, high p 추정 오차) | M | H | (1) min_samples=10, (2) kelly_fraction=0.25, (3) kelly_cap=0.25 hard ceiling |
| Regime mis-classification 시 오버사이즈 | M | M | regime_mult 범위 [0.4, 1.4] clamp + vol axis 추가 디스카운트 |
| Portfolio penalty가 너무 보수적 → 기회 미스 | H | L | A/B test 모드: `portfolio_penalty_enabled=False`로 비교 가능 |
| Dynamic stop이 너무 좁아 whipsaw | M | M | min_stop_pct=0.5%, max_stop_pct=5.0% guard |
| Rolling perf 계산이 verdict feed lag → 실시간성 저하 | L | L | 5분 cache + outcome_resolver 1h hook으로 충분 (Sharpe는 trend metric) |
| Account equity 외부 입력 신뢰성 | M | H | account_equity 인자 필수 + 0/음수 가드 → ValueError raise |
| KellyPolicy/FixedStopPolicy fallback switch race | L | M | dataclass immutable + factory pattern (`build_risk_policy(hit_rate, n_samples)`) |
| `pattern_family` field 미구현 (correlation penalty 의존) | H | M | Phase 0에서 `definitions.py` family taxonomy 추가 (ham­mer/engulfing/inside_bar 등 8개 category) |

---

### Files Touched (실측 기반)

```
engine/patterns/risk_policy.py             # MOD: +KellyPolicy class, FixedStopPolicy 보존
engine/patterns/portfolio_guard.py         # NEW: ~150 LOC
engine/patterns/definitions.py             # MOD: pattern_family field 추가 (Phase 0)
engine/research/validation/sizing.py       # NEW: ~120 LOC, pure functions
engine/research/validation/performance_tracker.py  # NEW: ~180 LOC
engine/scoring/ensemble.py                 # MOD: STRONG_LONG 시 build_risk_policy() wiring
engine/tests/test_kelly_policy.py          # NEW: 15+ tests
engine/tests/test_portfolio_guard.py       # NEW: 10+ tests
engine/tests/test_sizing.py                # NEW: 8+ tests
engine/tests/test_performance_tracker.py   # NEW: 6+ tests
state/perf_rolling_30d.json                # NEW: state file (gitignored)
docs/domains/risk-engine.md                # MOD: 알고리즘 contract 문서화
```

총 신규 LOC ~700, 신규 테스트 ~40개.

---

## AI Researcher 관점

### 통계적 근거

#### Fractional Kelly 0.25 선택

- **Kelly (1956), Thorp (1962, 2006)**: f*는 log-utility 최적이지만 변동성이 매우 높음. 실증 (Maclean et al. 2010): full Kelly의 분산은 fractional 0.25 Kelly의 ~16배.
- **Trade-off**: 0.25 Kelly는 expected log-growth가 full Kelly의 ~94% (≈ 6% 손실), 분산은 1/16 → Sharpe ratio 측면에서 명백히 우월.
- **암호화폐 fat-tail 보정**: BTC 일일 returns kurtosis ~ 8.5 (정규분포 3 대비 2.8×) → 분산 추정 자체가 underestimate → 더 보수적 fraction 정당.

#### Minimum 10 samples gate

- t-stat = SR × √n. n=10 일 때 SR=1.0이면 t≈3.16 (p<0.01) → 신뢰 가능.
- n<10 hit_rate 표본 분산은 binomial: p(1-p)/n. p=0.6, n=10 → σ = 0.155 → 95% CI [0.30, 0.90] → Kelly 추정 무의미.
- W-0286/W-0290 G1/G2 게이트가 `n_samples >= 10` 동일 임계값 채택 → 일관성.

#### Rolling 30d window

- BTC regime 평균 지속기간: 45일 (W-0290 measurement, 2020–2026 hourly).
- 60d window는 2 regime을 섞어 hit_rate diluted; 7d window는 표본 부족 (avg 18 verdicts).
- 30d = ~70 verdict 평균 → t-stat 충분 + 단일 regime 내 추정 가능성 높음.

#### Regime multiplier 1.2 / 0.6 / 0.8 선택

- W-0290 Phase 1 measurement (`regime_conditional_return.py`):
  - BULL: long pattern mean_net_bps μ_b = 18.4, σ = 38, n = 1,247 → SR_h = 0.484
  - BEAR: long pattern μ_b = 5.9, σ = 41, n = 822 → SR_h = 0.144
  - RANGE: long pattern μ_b = 9.1, σ = 35, n = 1,891 → SR_h = 0.260
- Sizing은 expected return에 비례해야 함:
  - 정규화 비율: BULL : RANGE : BEAR = 18.4 / 9.1 = **2.02**, 5.9 / 9.1 = **0.65**.
  - 보수적으로 압축: 1.2, 0.8, 0.6 (BEAR을 더 강하게 디스카운트하여 fat-tail 흡수).

#### Portfolio penalty 0.5 / 0.7 선택

- 동일 방향 두 패턴 returns 평균 spearman corr ρ = 0.55 (BTCUSDT–ETHUSDT, 2024–2026 hourly).
- Markowitz: `σ_pair² = w₁²σ₁² + w₂²σ₂² + 2w₁w₂ρσ₁σ₂`. 동일 사이즈 (w=0.5) 가정 → `σ_pair² = 0.5σ²(1+ρ) = 0.775σ²`.
- 단일 포지션 동등 risk를 위한 사이즈 비율: √(1/0.775)/2 ≈ 0.57 → **0.5 보수적**.

### Failure Modes

1. **Hit-rate inflation under regime shift**:
   - 패턴이 BULL에서 학습되어 hit_rate=0.65이지만, 현재 regime이 BEAR → 실제 hit_rate=0.45.
   - **방어**: regime-conditional hit_rate 사용. `KellyPolicy(hit_rate=p_BULL, regime=BULL)` 만 활성. regime mismatch 시 fallback.

2. **Pattern degradation (decay)**:
   - 30d rolling이라 최근 7일 underperform이 detection 늦음.
   - **방어**: W-0290 Phase 3 `decay.py` 결합 — slope of hit_rate < -0.01/day 시 KellyPolicy 비활성, FixedStopPolicy 강제.

3. **Account equity input 조작/오류**:
   - 외부 layer가 account_equity=0 or 음수 전달 → division 또는 negative position.
   - **방어**: `__post_init__`에서 `account_equity > 0` assert + sentinel value 거절.

4. **Correlation 추정 stale**:
   - 동일 방향 가정한 0.55가 flash crash 시 0.95로 폭등.
   - **방어**: penalty 0.5는 corr=0.55 기준이지만 corr=0.95에서도 충분히 보수적 (실제 σ_pair² = 0.5(1+0.95) = 0.975σ², 사이즈 비율 0.51). uno coverage.

5. **Kelly cap 우회 (multi-pattern stacking)**:
   - 3개 패턴이 동시발화 + 각 f_used=0.10 → 합계 0.30 > kelly_cap 0.25.
   - **방어**: portfolio_guard가 동일 방향 카운트 → penalty 0.5 적용 → 합계 ~0.18 → cap 내부.

6. **Cold start bias**:
   - 새 패턴 첫 12 verdicts 모두 win (운) → hit_rate=1.0 → f* = 1.0.
   - **방어**: kelly_cap 0.25 hard ceiling + min_samples 10 + bootstrap CI lower bound 사용 (`hit_rate_lcb = bootstrap_ci(verdicts, 0.10)[0]`).

---

## Decisions

- **[D-0311-1]** **Kelly vs Fixed**: Kelly 채택. 거절: (a) Fixed → 통계적 우월성 무시, (b) Risk parity → 단일 sizing 변수 부족 (패턴별 vol 추정 비용), (c) ATR-only → expected return 신호 미반영. Kelly = 신호 strength × R:R 직접 매핑.
- **[D-0311-2]** **kelly_fraction = 0.25**: full Kelly 분산 16× 큼. Maclean et al. 2010 실증. Crypto fat-tail 추가 보수.
- **[D-0311-3]** **min_samples = 10**: W-0286 G1/G2 임계값 일관성. binomial CI 95% 폭 < 0.4 보장.
- **[D-0311-4]** **Rolling window 30d**: regime 평균 45일 < window < 단일 regime 보장. W-0290 measurement 기준.
- **[D-0311-5]** **Portfolio penalty 0.5×**: corr=0.55 기준 σ-naive 사이즈 0.57 대비 보수. fat-tail buffer.
- **[D-0311-6]** **regime_mult [0.6, 1.2]**: W-0290 expected return 비율 (2.02× / 0.65×) 대비 압축. 추정 오차 흡수.
- **[D-0311-7]** **FixedStopPolicy 보존**: cold-start (n<10) fallback + A/B 비교 baseline. 삭제 안함.
- **[D-0311-8]** **State persistence JSON, not DB**: rolling perf는 single writer (engine), atomic rename으로 충분. SQLite 추가 의존성 회피.

---

## Implementation Plan (구체적 코드 스켈레톤)

### Phase 0 — Pattern family taxonomy (선행 dependency)

```python
# engine/patterns/definitions.py에 추가
class PatternFamily(str, Enum):
    HAMMER = "hammer"            # hammer, inverted_hammer, hanging_man
    ENGULFING = "engulfing"      # bullish_engulfing, bearish_engulfing
    INSIDE_BAR = "inside_bar"
    DOJI = "doji"
    PIN_BAR = "pin_bar"
    CONTINUATION = "continuation"  # flag, pennant
    REVERSAL = "reversal"          # double_top, double_bottom, h&s
    BREAKOUT = "breakout"          # range break, level break

# PatternDefinition dataclass에 pattern_family: PatternFamily 필드 추가
```

### Phase 1 — KellyPolicy 추가

```python
# engine/patterns/risk_policy.py 추가 (FixedStopPolicy 유지)

from dataclasses import dataclass, field
from typing import Optional
from engine.research.validation.regime import RegimeLabel, VolLabel

@dataclass(frozen=True)
class KellyPolicy:
    """Kelly Criterion + Regime-conditioned + Portfolio-aware sizing.

    Inputs:
        hit_rate: 패턴 hit_rate (rolling 30d, n>=10)
        n_samples: hit_rate 추정 표본 수
        rr_ratio: 목표 R:R (FixedStopPolicy 호환, 기본 3.0)
        kelly_fraction: 0.25 (fractional Kelly)
        kelly_cap: 0.25 (hard ceiling on f_used)
        min_samples: 10 (Kelly 활성 임계값)
        min_position_usdt: 50.0 (거래 비용 floor)
        min_stop_pct: 0.005 (0.5%)
        max_stop_pct: 0.05  (5%)
    """
    hit_rate: float
    n_samples: int
    rr_ratio: float = 3.0
    kelly_fraction: float = 0.25
    kelly_cap: float = 0.25
    min_samples: int = 10
    min_position_usdt: float = 50.0
    min_stop_pct: float = 0.005
    max_stop_pct: float = 0.05

    def __post_init__(self) -> None:
        if not (0.0 <= self.hit_rate <= 1.0):
            raise ValueError(f"hit_rate {self.hit_rate} not in [0,1]")
        if self.rr_ratio <= 0:
            raise ValueError("rr_ratio must be positive")
        if self.n_samples < 0:
            raise ValueError("n_samples must be >= 0")

    def is_active(self) -> bool:
        """True iff Kelly sizing 사용 가능 (else FixedStopPolicy fallback)."""
        return self.n_samples >= self.min_samples and self.kelly_star() > 0

    def kelly_star(self) -> float:
        """Raw Kelly fraction f*."""
        b, p = self.rr_ratio, self.hit_rate
        q = 1.0 - p
        return (b * p - q) / b

    def kelly_used(self) -> float:
        """f_used = clamp(kelly_fraction * f*, 0, kelly_cap)."""
        f_star = self.kelly_star()
        if f_star <= 0:
            return 0.0
        return min(self.kelly_fraction * f_star, self.kelly_cap)

    def get_position_usdt(
        self,
        account_equity: float,
        regime_mult: float = 1.0,
        portfolio_mult: float = 1.0,
    ) -> float:
        """Final position size in USDT."""
        if account_equity <= 0:
            raise ValueError("account_equity must be > 0")
        if not self.is_active():
            return 0.0
        size = account_equity * self.kelly_used() * regime_mult * portfolio_mult
        if size < self.min_position_usdt:
            return 0.0
        return size

    def get_stop_price(
        self,
        entry: float,
        atr: float,
        regime: RegimeLabel = RegimeLabel.RANGE,
        vol_label: Optional[VolLabel] = None,
        direction: str = "long",
    ) -> float:
        """Regime-adjusted ATR stop with min/max guards."""
        from engine.research.validation.sizing import dynamic_atr_multiplier
        atr_mult = dynamic_atr_multiplier(regime, vol_label)
        stop_dist = atr_mult * atr

        # Min/max guards
        stop_dist = max(stop_dist, entry * self.min_stop_pct)
        stop_dist = min(stop_dist, entry * self.max_stop_pct)

        if direction == "long":
            return entry - stop_dist
        return entry + stop_dist  # short

    def get_target_price(
        self, entry: float, stop: float, direction: str = "long"
    ) -> float:
        risk = abs(entry - stop)
        if direction == "long":
            return entry + risk * self.rr_ratio
        return entry - risk * self.rr_ratio

    def summary(
        self,
        entry: float,
        atr: float,
        account_equity: float,
        regime: RegimeLabel = RegimeLabel.RANGE,
        vol_label: Optional[VolLabel] = None,
        regime_mult: float = 1.0,
        portfolio_mult: float = 1.0,
        direction: str = "long",
    ) -> dict:
        stop = self.get_stop_price(entry, atr, regime, vol_label, direction)
        target = self.get_target_price(entry, stop, direction)
        position_usdt = self.get_position_usdt(
            account_equity, regime_mult, portfolio_mult
        )
        size_coin = position_usdt / entry if entry > 0 else 0.0
        risk_per_unit = abs(entry - stop)
        max_loss = size_coin * risk_per_unit
        potential_gain = max_loss * self.rr_ratio
        return {
            "policy":             "kelly",
            "kelly_star":         round(self.kelly_star(), 4),
            "kelly_used":         round(self.kelly_used(), 4),
            "regime_mult":        regime_mult,
            "portfolio_mult":     portfolio_mult,
            "entry_price":        round(entry, 4),
            "stop_price":         round(stop, 4),
            "target_price":       round(target, 4),
            "position_size_coin": round(size_coin, 6),
            "position_size_usdt": round(position_usdt, 2),
            "max_loss_usdt":      round(max_loss, 2),
            "potential_gain_usdt": round(potential_gain, 2),
            "rr_ratio":           self.rr_ratio,
            "stop_dist_pct":      round(risk_per_unit / entry * 100, 2),
            "active":             self.is_active(),
        }


def build_risk_policy(
    hit_rate: float,
    n_samples: int,
    rr_ratio: float = 3.0,
) -> "FixedStopPolicy | KellyPolicy":
    """Factory: Kelly if eligible, else FixedStopPolicy fallback."""
    kp = KellyPolicy(hit_rate=hit_rate, n_samples=n_samples, rr_ratio=rr_ratio)
    if kp.is_active():
        return kp
    return FixedStopPolicy(stop_loss_usdt=200.0, rr_ratio=rr_ratio)
```

### Phase 2 — Sizing pure functions

```python
# engine/research/validation/sizing.py (NEW)
from typing import Optional
from engine.research.validation.regime import RegimeLabel, VolLabel

REGIME_MULT = {
    RegimeLabel.BULL:  1.2,
    RegimeLabel.BEAR:  0.6,
    RegimeLabel.RANGE: 0.8,
}

VOL_MULT = {
    VolLabel.HIGH_VOL:   0.85,
    VolLabel.NORMAL_VOL: 1.0,
    VolLabel.LOW_VOL:    1.05,
}

ATR_MULT = {
    RegimeLabel.BULL:  1.2,
    RegimeLabel.BEAR:  2.0,
    RegimeLabel.RANGE: 1.5,
}

VOL_ATR_MULT = {
    VolLabel.HIGH_VOL:   1.15,
    VolLabel.NORMAL_VOL: 1.0,
    VolLabel.LOW_VOL:    0.95,
}

REGIME_MULT_CLAMP = (0.4, 1.4)


def regime_multiplier(
    regime: RegimeLabel, vol_label: Optional[VolLabel] = None
) -> float:
    base = REGIME_MULT[regime]
    vol = VOL_MULT[vol_label] if vol_label else 1.0
    raw = base * vol
    return max(REGIME_MULT_CLAMP[0], min(REGIME_MULT_CLAMP[1], raw))


def dynamic_atr_multiplier(
    regime: RegimeLabel, vol_label: Optional[VolLabel] = None
) -> float:
    base = ATR_MULT[regime]
    vol = VOL_ATR_MULT[vol_label] if vol_label else 1.0
    return base * vol


def apply_portfolio_penalty(
    base_position_usdt: float,
    penalty: float,
) -> float:
    """penalty in (0, 1]; 0 means block."""
    if not (0.0 <= penalty <= 1.0):
        raise ValueError(f"penalty {penalty} not in [0,1]")
    return base_position_usdt * penalty
```

### Phase 3 — Portfolio guard

```python
# engine/patterns/portfolio_guard.py (NEW)
from dataclasses import dataclass, field
from engine.patterns.position_guard import OpenPosition, Direction
from engine.patterns.definitions import PatternFamily

@dataclass
class PortfolioGuard:
    """동방향 패턴 동시발화 시 correlation penalty 계산.

    Sibling of PositionGuard:
      - PositionGuard: 단방향 원칙 (binary block)
      - PortfolioGuard: correlation penalty (continuous multiplier)
    """
    same_direction_threshold: int = 2
    same_family_threshold: int = 2
    same_dir_penalty: float = 0.5
    same_family_penalty: float = 0.7
    portfolio_max_positions: int = 5

    _positions: dict[str, tuple[OpenPosition, PatternFamily]] = field(
        default_factory=dict, init=False
    )

    def register(self, pos: OpenPosition, family: PatternFamily) -> None:
        self._positions[pos.symbol] = (pos, family)

    def close(self, symbol: str) -> None:
        self._positions.pop(symbol, None)

    def compute_penalty(
        self,
        new_direction: Direction,
        new_family: PatternFamily,
    ) -> tuple[float, dict]:
        """Returns (penalty, breakdown_dict)."""
        items = list(self._positions.values())
        if len(items) >= self.portfolio_max_positions:
            return 0.0, {"reason": "portfolio_full", "n": len(items)}

        same_dir = sum(1 for p, _ in items if p.direction == new_direction)
        same_family = sum(1 for _, f in items if f == new_family)

        penalty = 1.0
        applied = []
        if same_dir >= self.same_direction_threshold:
            penalty *= self.same_dir_penalty
            applied.append(f"same_dir({same_dir})")
        if same_family >= self.same_family_threshold:
            penalty *= self.same_family_penalty
            applied.append(f"same_family({same_family})")

        return penalty, {
            "penalty":      penalty,
            "same_dir":     same_dir,
            "same_family":  same_family,
            "applied":      applied,
            "n_positions":  len(items),
        }

    def open_count(self) -> int:
        return len(self._positions)


_PORTFOLIO_GUARD = PortfolioGuard()


def get_portfolio_guard() -> PortfolioGuard:
    return _PORTFOLIO_GUARD
```

### Phase 4 — Performance tracker

```python
# engine/research/validation/performance_tracker.py (NEW)
import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Sequence
import numpy as np

PERIODS_PER_YEAR = 365 * 24  # crypto 24/7, W-0286 fix

@dataclass
class RollingPerformance:
    n_samples: int
    mean_return_pct: float
    sharpe: float
    sortino: float
    calmar: float
    max_drawdown_pct: float
    cum_return_pct: float
    window_days: int
    horizon_hours: int
    last_updated_utc: str


def compute_sharpe(returns: np.ndarray, horizon_hours: int) -> float:
    if len(returns) < 2:
        return 0.0
    sd = returns.std(ddof=1)
    if sd < 1e-12:
        return 0.0
    return (returns.mean() / sd) * math.sqrt(PERIODS_PER_YEAR / horizon_hours)


def compute_sortino(returns: np.ndarray, horizon_hours: int) -> float:
    if len(returns) < 2:
        return 0.0
    downside = returns[returns < 0]
    if len(downside) == 0:
        return float("inf")
    dd = math.sqrt((downside ** 2).mean())
    if dd < 1e-12:
        return 0.0
    return (returns.mean() / dd) * math.sqrt(PERIODS_PER_YEAR / horizon_hours)


def compute_calmar(returns: np.ndarray, horizon_hours: int) -> tuple[float, float]:
    if len(returns) < 2:
        return 0.0, 0.0
    eq = np.cumprod(1.0 + returns)
    running_max = np.maximum.accumulate(eq)
    dd_series = eq / running_max - 1.0
    max_dd = float(abs(dd_series.min()))
    n = len(returns)
    total_return = float(eq[-1] - 1.0)
    ann_return = (1.0 + total_return) ** (PERIODS_PER_YEAR / max(n, 1) / horizon_hours) - 1.0
    if max_dd < 1e-9:
        return float("inf"), max_dd
    return ann_return / max_dd, max_dd


def update_rolling_performance(
    verdict_returns: Sequence[float],
    horizon_hours: int,
    window_days: int = 30,
    persist_path: Path | None = None,
) -> RollingPerformance:
    arr = np.asarray(verdict_returns, dtype=float)
    # Truncate to last window
    bars_per_window = window_days * 24 // max(horizon_hours, 1)
    if len(arr) > bars_per_window:
        arr = arr[-bars_per_window:]

    sharpe = compute_sharpe(arr, horizon_hours)
    sortino = compute_sortino(arr, horizon_hours)
    calmar, max_dd = compute_calmar(arr, horizon_hours)
    cum = float(np.prod(1.0 + arr) - 1.0) if len(arr) else 0.0

    from datetime import datetime, timezone
    perf = RollingPerformance(
        n_samples=len(arr),
        mean_return_pct=float(arr.mean() * 100) if len(arr) else 0.0,
        sharpe=round(sharpe, 4),
        sortino=round(sortino, 4) if math.isfinite(sortino) else 999.0,
        calmar=round(calmar, 4) if math.isfinite(calmar) else 999.0,
        max_drawdown_pct=round(max_dd * 100, 4),
        cum_return_pct=round(cum * 100, 4),
        window_days=window_days,
        horizon_hours=horizon_hours,
        last_updated_utc=datetime.now(timezone.utc).isoformat(),
    )

    if persist_path is not None:
        tmp = persist_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(perf), indent=2))
        tmp.replace(persist_path)  # atomic
    return perf
```

### Phase 5 — Ensemble wiring

```python
# engine/scoring/ensemble.py 변경 (의사코드)
from engine.patterns.risk_policy import build_risk_policy
from engine.patterns.portfolio_guard import get_portfolio_guard
from engine.research.validation.sizing import regime_multiplier

def _attach_risk_plan(verdict, pattern_stats, regime, vol_label, account_equity):
    if verdict.label not in {"STRONG_LONG", "LONG"}:
        return verdict
    policy = build_risk_policy(
        hit_rate=pattern_stats.hit_rate_30d,
        n_samples=pattern_stats.n_30d,
        rr_ratio=3.0,
    )
    rmult = regime_multiplier(regime, vol_label)
    pmult, breakdown = get_portfolio_guard().compute_penalty(
        new_direction=Direction.LONG,
        new_family=verdict.pattern_family,
    )
    plan = policy.summary(
        entry=verdict.entry_price,
        atr=verdict.atr,
        account_equity=account_equity,
        regime=regime,
        vol_label=vol_label,
        regime_mult=rmult,
        portfolio_mult=pmult,
    )
    verdict.risk_plan = plan
    verdict.portfolio_breakdown = breakdown
    return verdict
```

### Phase 6 — Tests (15+ Kelly, 10+ portfolio, 8+ sizing, 6+ perf)

#### test_kelly_policy.py 핵심 케이스
```python
def test_AC1_kelly_star_basic():
    p = KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)
    assert abs(p.kelly_star() - 0.4667) < 1e-3
    assert abs(p.kelly_used() - 0.1167) < 1e-3
    pos = p.get_position_usdt(account_equity=1000.0)
    assert 110.0 < pos < 125.0  # ~117 USDT

def test_kelly_negative_blocks_entry():
    p = KellyPolicy(hit_rate=0.20, n_samples=20, rr_ratio=3.0)
    assert p.kelly_star() < 0
    assert p.is_active() is False
    assert p.get_position_usdt(1000.0) == 0.0

def test_kelly_min_samples_fallback():
    p = KellyPolicy(hit_rate=0.70, n_samples=5)
    assert p.is_active() is False

def test_kelly_cap_clamp():
    p = KellyPolicy(hit_rate=0.95, n_samples=50, rr_ratio=5.0)
    # f* = (5*0.95 - 0.05)/5 = 0.94, used 0.25*0.94=0.235 < cap
    # 더 극단: rr=10, p=0.99 → f* huge → 반드시 0.25 cap
    p2 = KellyPolicy(hit_rate=0.99, n_samples=100, rr_ratio=10.0)
    assert p2.kelly_used() == 0.25  # cap

def test_kelly_invalid_inputs():
    with pytest.raises(ValueError): KellyPolicy(hit_rate=1.5, n_samples=10)
    with pytest.raises(ValueError): KellyPolicy(hit_rate=0.5, n_samples=10, rr_ratio=0)
    p = KellyPolicy(hit_rate=0.6, n_samples=20)
    with pytest.raises(ValueError): p.get_position_usdt(account_equity=0)

def test_min_position_usdt_floor():
    p = KellyPolicy(hit_rate=0.55, n_samples=10, rr_ratio=3.0)
    # 작은 equity → position < 50 USDT → 0 반환
    assert p.get_position_usdt(account_equity=100.0) == 0.0

def test_stop_price_regime_bull():
    p = KellyPolicy(hit_rate=0.60, n_samples=20)
    stop = p.get_stop_price(entry=100.0, atr=1.0, regime=RegimeLabel.BULL)
    # 1.2 ATR → stop = 100 - 1.2 = 98.8
    assert abs(stop - 98.8) < 0.01

def test_stop_price_regime_bear_wider():
    p = KellyPolicy(hit_rate=0.60, n_samples=20)
    stop = p.get_stop_price(entry=100.0, atr=1.0, regime=RegimeLabel.BEAR)
    # 2.0 ATR → 98.0
    assert abs(stop - 98.0) < 0.01

def test_stop_min_pct_guard():
    p = KellyPolicy(hit_rate=0.60, n_samples=20)
    # 매우 작은 ATR → min 0.5% 강제
    stop = p.get_stop_price(entry=100.0, atr=0.01, regime=RegimeLabel.BULL)
    assert stop <= 99.5  # at most entry - 0.5%

def test_stop_max_pct_guard():
    p = KellyPolicy(hit_rate=0.60, n_samples=20)
    stop = p.get_stop_price(entry=100.0, atr=10.0, regime=RegimeLabel.BEAR)
    # 2.0 * 10 = 20 → 20% > 5% cap → stop = 95.0
    assert abs(stop - 95.0) < 0.01

def test_target_price_3R():
    p = KellyPolicy(hit_rate=0.6, n_samples=20, rr_ratio=3.0)
    target = p.get_target_price(entry=100.0, stop=98.0)
    assert abs(target - 106.0) < 0.01  # +6 = 3 * 2

def test_summary_full_long():
    p = KellyPolicy(hit_rate=0.60, n_samples=20)
    s = p.summary(entry=100.0, atr=1.0, account_equity=1000.0,
                  regime=RegimeLabel.BULL, regime_mult=1.2)
    assert s["policy"] == "kelly"
    assert s["active"] is True
    assert s["position_size_usdt"] > 100  # 1.2× boost

def test_build_risk_policy_kelly_eligible():
    pol = build_risk_policy(hit_rate=0.60, n_samples=20)
    assert isinstance(pol, KellyPolicy)

def test_build_risk_policy_fallback_to_fixed():
    pol = build_risk_policy(hit_rate=0.60, n_samples=5)
    assert isinstance(pol, FixedStopPolicy)

def test_build_risk_policy_negative_kelly_fallback():
    pol = build_risk_policy(hit_rate=0.20, n_samples=50, rr_ratio=2.0)
    # f* = (2*0.2 - 0.8)/2 = -0.2 < 0 → fallback
    assert isinstance(pol, FixedStopPolicy)

def test_short_direction_stop_target():
    p = KellyPolicy(hit_rate=0.60, n_samples=20)
    stop = p.get_stop_price(100.0, 1.0, RegimeLabel.BULL, direction="short")
    target = p.get_target_price(100.0, stop, direction="short")
    assert stop > 100.0
    assert target < 100.0
```

#### test_portfolio_guard.py 핵심 케이스
```python
def test_AC3_two_same_dir_50pct_penalty():
    g = PortfolioGuard()
    g.register(_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    g.register(_pos("ETHUSDT", Direction.LONG), PatternFamily.ENGULFING)
    penalty, _ = g.compute_penalty(Direction.LONG, PatternFamily.PIN_BAR)
    assert abs(penalty - 0.5) < 1e-9

def test_same_family_compounds():
    g = PortfolioGuard()
    g.register(_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    g.register(_pos("ETHUSDT", Direction.LONG), PatternFamily.HAMMER)
    penalty, _ = g.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    assert abs(penalty - 0.35) < 1e-9  # 0.5 * 0.7

def test_portfolio_max_blocks():
    g = PortfolioGuard(portfolio_max_positions=3)
    for s in ["A", "B", "C"]:
        g.register(_pos(s, Direction.LONG), PatternFamily.HAMMER)
    penalty, br = g.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    assert penalty == 0.0
    assert br["reason"] == "portfolio_full"

def test_no_penalty_with_zero_or_one():
    g = PortfolioGuard()
    p1, _ = g.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    assert p1 == 1.0
    g.register(_pos("BTCUSDT", Direction.LONG), PatternFamily.HAMMER)
    p2, _ = g.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    assert p2 == 1.0  # n=1 < threshold

def test_close_releases_penalty():
    g = PortfolioGuard()
    g.register(_pos("A", Direction.LONG), PatternFamily.HAMMER)
    g.register(_pos("B", Direction.LONG), PatternFamily.HAMMER)
    g.close("A")
    p, _ = g.compute_penalty(Direction.LONG, PatternFamily.HAMMER)
    assert p == 1.0

def test_opposite_direction_no_penalty():
    g = PortfolioGuard()
    g.register(_pos("A", Direction.LONG), PatternFamily.HAMMER)
    g.register(_pos("B", Direction.LONG), PatternFamily.HAMMER)
    p, _ = g.compute_penalty(Direction.SHORT, PatternFamily.HAMMER)
    # same_dir count for SHORT = 0
    assert p == 1.0  # different family wouldn't fire either

# + 4 more (breakdown dict shape, threshold tuning, get_guard singleton, etc.)
```

#### test_sizing.py / test_performance_tracker.py — 표준 numerical 케이스 + atomic write 검증.

---

## Exit Criteria

- [ ] **AC1** Kelly star/used: `KellyPolicy(hit_rate=0.60, n_samples=20, rr_ratio=3.0)` → `kelly_star ≈ 0.467`, `kelly_used ≈ 0.117`, `position_usdt ≈ 117 USDT` (account 1000 USDT, regime/portfolio mult = 1.0).
- [ ] **AC2** BEAR regime: 동일 Kelly 입력에 `regime=BEAR, regime_mult=0.6` 적용 시 position_usdt ≈ 70 USDT (= 117 × 0.6).
- [ ] **AC3** Portfolio penalty: 동일 방향 LONG 2개 (BTCUSDT, ETHUSDT) 활성 상태에서 신규 LONG 신호 → `compute_penalty()` 반환 값 == 0.5; final position = base × 0.5.
- [ ] **AC4** ATR stop regime-conditional: `entry=100, atr=1.0` 에서 BULL → stop=98.8, RANGE → stop=98.5, BEAR → stop=98.0.
- [ ] **AC5** Cold-start fallback: `n_samples=5` 시 `build_risk_policy()` 가 `FixedStopPolicy` 반환.
- [ ] **AC6** Negative Kelly block: `hit_rate=0.30, rr=2.0` → `f* < 0` → `is_active() == False` → `position_usdt == 0`.
- [ ] **AC7** Kelly cap: 극단값 (`hit_rate=0.99, rr=10`) 에서 `kelly_used == 0.25` (cap 발동).
- [ ] **AC8** Rolling Sharpe: 30 returns sample (mean 0.001, std 0.005) 에서 sharpe ≈ 0.001/0.005 × √8760 ≈ 18.7 (annualized 1h horizon).
- [ ] **AC9** Min/max stop guards: ATR=0.01 / entry=100 → stop=99.5 (0.5% min); ATR=10 / BEAR / entry=100 → stop=95.0 (5% max).
- [ ] **AC10** 39+ tests PASS (15 kelly + 10 portfolio + 8 sizing + 6 perf).
- [ ] **AC11** CI green: `pytest engine/tests/test_kelly_policy.py engine/tests/test_portfolio_guard.py engine/tests/test_sizing.py engine/tests/test_performance_tracker.py -v`.
- [ ] **AC12** No regression: 기존 `engine/tests/test_risk_policy.py`(FixedStopPolicy) 모두 PASS.

---

## Facts (실측 코드 참조)

1. `engine/patterns/risk_policy.py:17-112` — 현재 `FixedStopPolicy(stop_loss_usdt=200.0, rr_ratio=3.0)` 단일 클래스. ATR mult 1.5 hardcoded (line 41).
2. `engine/patterns/position_guard.py:33-123` — `PositionGuard` 단방향 binary block. `OpenPosition` dataclass(symbol, direction, entry_price, size_coin, stop_price, target_price). `pattern_family` 필드 없음.
3. `engine/patterns/definitions.py` — `PatternDefinition` dataclass 존재. `pattern_family` 필드 미존재 → Phase 0에서 추가 필요.
4. `engine/research/validation/regime.py:33-80` — `RegimeLabel{BULL, BEAR, RANGE}` + `VolLabel{HIGH_VOL, NORMAL_VOL, LOW_VOL}` + `classify_regime(closes)` 시그니처 존재 → 즉시 import 가능.
5. `engine/research/validation/walkforward.py` — 6-month rolling walk-forward fold 결과 (mean_net_bps, hit_rate, profit_factor, bootstrap_ci) → rolling perf tracker에 verdict 단위 변환 가능.
6. `engine/research/validation/labels.py` — triple-barrier (profit_take/stop_loss/timeout, default stop_loss_bps=30) → realized return 시계열 산출.
7. `engine/scoring/ensemble.py` — 현재 `STRONG_LONG ≥ 0.65, LONG ≥ 0.55` 분기. risk_plan attach 지점 명확.
8. `engine/research/validation/stats.py:232` — W-0286 fix로 `arr.std(ddof=1)` 사용 중. `periods_per_year=8760` (365×24).
9. Scheduler: `outcome_resolver 1h` → rolling perf tracker hook 후보 (verdict close 시 update).

---

## Assumptions

- `account_equity`는 외부 (Decision HUD / 사용자 설정) 에서 매 verdict 호출 시 주입. 단일 값.
- `pattern_stats.hit_rate_30d`, `pattern_stats.n_30d` 는 W-0290 walkforward result 또는 outcome_resolver aggregation에서 공급. 미존재 시 0/0 → fallback.
- BTC regime classifier (W-0290 `classify_regime`) 가 verdict 시점에 호출 가능.
- `pattern_family` taxonomy (Phase 0)는 본 티켓 내에서 추가. 외부 의존성 없음.
- 단일 process 가정 → `_PORTFOLIO_GUARD` singleton 안전 (PositionGuard와 동일 패턴).
- `KellyPolicy` 는 frozen dataclass → thread-safe read.
- Slippage 모델은 별도 W-0312에서 다룬다 (현재는 entry_price 액면값 사용).

---

## Canonical Files

- `engine/patterns/risk_policy.py` (MOD)
- `engine/patterns/portfolio_guard.py` (NEW)
- `engine/patterns/definitions.py` (MOD: pattern_family enum)
- `engine/research/validation/sizing.py` (NEW)
- `engine/research/validation/performance_tracker.py` (NEW)
- `engine/scoring/ensemble.py` (MOD: risk_plan wiring)
- `engine/tests/test_kelly_policy.py` (NEW)
- `engine/tests/test_portfolio_guard.py` (NEW)
- `engine/tests/test_sizing.py` (NEW)
- `engine/tests/test_performance_tracker.py` (NEW)
- `state/perf_rolling_30d.json` (NEW; gitignored)
- `docs/domains/risk-engine.md` (MOD; 알고리즘 contract)

---

## Next Steps

1. **Phase 0 (선행)** — `PatternFamily` enum + `PatternDefinition.pattern_family` 필드 추가. 기존 정의 8 family 분류. ~30분.
2. **Phase 1** — `KellyPolicy` 클래스 + `build_risk_policy` factory. 단위 테스트 15+. ~2h.
3. **Phase 2** — `sizing.py` pure functions + tests. ~45분.
4. **Phase 3** — `PortfolioGuard` + tests. ~1h.
5. **Phase 4** — `performance_tracker.py` + atomic JSON persist + tests. ~1.5h.
6. **Phase 5** — Ensemble wiring + integration smoke test. ~1h.
7. **Phase 6** — `docs/domains/risk-engine.md` contract 작성 + `CURRENT.md` 업데이트. ~30분.

총 예상: ~7h (1 sprint).

---

## Open Questions

- **OQ-1** `account_equity` source of truth는 어디인가? (사용자 설정 단일값 vs exchange API live read) → M0에서는 환경변수 `ACCOUNT_EQUITY_USDT` 또는 settings JSON.
- **OQ-2** Regime classifier 호출 시점 (verdict 생성 시 vs 매 시간 갱신 vs 5분 캐시)? → 5분 캐시 권고.
- **OQ-3** Decay-aware Kelly: hit_rate slope < -0.01/day 시 kelly_fraction을 0.25 → 0.10 으로 낮출지 → W-0312 후보.
- **OQ-4** Multi-timeframe 패턴 (1h + 4h 동시 발화) correlation penalty가 동일하게 적용되어도 되는가? → 현재 yes; 후속 가능.

---

## Handoff Checklist

- [ ] Phase 0 PatternFamily enum 추가 + 기존 패턴 분류.
- [ ] `KellyPolicy` 구현 + 15+ 테스트 PASS.
- [ ] `PortfolioGuard` 구현 + 10+ 테스트 PASS.
- [ ] `sizing.py` pure functions + 8+ 테스트 PASS.
- [ ] `performance_tracker.py` + atomic write + 6+ 테스트 PASS.
- [ ] `build_risk_policy()` factory가 KellyPolicy ↔ FixedStopPolicy 분기 정상 작동.
- [ ] `engine/scoring/ensemble.py` STRONG_LONG/LONG verdict에 `risk_plan` attach.
- [ ] AC1–AC12 모두 검증.
- [ ] `state/perf_rolling_30d.json` `.gitignore` 등록.
- [ ] `docs/domains/risk-engine.md` 알고리즘 + 수식 + 임계값 표 문서화.
- [ ] CI green (`pytest engine/tests/`).
- [ ] `CURRENT.md` main SHA 업데이트.
- [ ] PR description: "Closes #TBD" + AC 체크리스트 포함.
