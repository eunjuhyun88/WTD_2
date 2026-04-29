# W-0311 — 퀀트 리스크 엔진 v2 (Kelly + Regime-sized + Portfolio Guard)

> Wave: 4 | Priority: P1 | Effort: M
> Charter: In-Scope L4 (Execution Engine)
> Status: 🟡 V-Track Spec
> Track: V (self-contained implementation spec)
> Created: 2026-04-29
> Issue: #643

---

## Goal

Jin 페르소나가 패턴 신호를 받을 때 **감정 없이 최적 포지션 크기와 stop**을 받아 실행할 수 있다.

현재 `FixedStopPolicy`(engine/patterns/risk_policy.py:17)는 모든 신호에 200 USDT 고정 손절 + 1.5 ATR 단일 stop을 적용한다.
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
    """Returns multiplier in (0, 1]."""
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
| `pattern_family` field 미구현 (correlation penalty 의존) | H | M | Phase 0에서 `definitions.py` family taxonomy 추가 (hammer/engulfing/inside_bar 등 8개 category) |

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

## V-Track Section 1 — Module Interface Contract

> 이 섹션은 각 신규 / 수정 모듈의 **public API**를 시그니처 단위로 동결합니다.
> 구현체가 본 시그니처와 다르면 PR 차단.

### 1.1 `engine/patterns/risk_policy.py` (MOD)

```python
# 기존 보존
@dataclass
class FixedStopPolicy:
    stop_loss_usdt: float = 200.0
    rr_ratio: float = 3.0
    def get_stop_price(self, entry: float, atr: float) -> float: ...
    def get_position_size(self, entry: float, stop: float) -> float: ...
    def get_target_price(self, entry: float, stop: float) -> float: ...
    def summary(self, entry: float, atr: float) -> dict: ...

DEFAULT_POLICY: FixedStopPolicy  # = FixedStopPolicy(200.0, 3.0)

# 신규
@dataclass(frozen=True)
class KellyPolicy:
    hit_rate: float
    n_samples: int
    rr_ratio: float = 3.0
    kelly_fraction: float = 0.25
    kelly_cap: float = 0.25
    min_samples: int = 10
    min_position_usdt: float = 50.0
    min_stop_pct: float = 0.005
    max_stop_pct: float = 0.05

    def __post_init__(self) -> None: ...
    def is_active(self) -> bool: ...
    def kelly_star(self) -> float: ...
    def kelly_used(self) -> float: ...
    def get_position_usdt(
        self,
        account_equity: float,
        regime_mult: float = 1.0,
        portfolio_mult: float = 1.0,
    ) -> float: ...
    def get_stop_price(
        self,
        entry: float,
        atr: float,
        regime: "RegimeLabel" = RegimeLabel.RANGE,
        vol_label: Optional["VolLabel"] = None,
        direction: str = "long",
    ) -> float: ...
    def get_target_price(
        self, entry: float, stop: float, direction: str = "long"
    ) -> float: ...
    def summary(
        self,
        entry: float,
        atr: float,
        account_equity: float,
        regime: "RegimeLabel" = RegimeLabel.RANGE,
        vol_label: Optional["VolLabel"] = None,
        regime_mult: float = 1.0,
        portfolio_mult: float = 1.0,
        direction: str = "long",
    ) -> dict: ...

def build_risk_policy(
    hit_rate: float,
    n_samples: int,
    rr_ratio: float = 3.0,
) -> "FixedStopPolicy | KellyPolicy": ...
```

### 1.2 `engine/patterns/portfolio_guard.py` (NEW)

```python
@dataclass
class PortfolioGuard:
    same_direction_threshold: int = 2
    same_family_threshold: int = 2
    same_dir_penalty: float = 0.5
    same_family_penalty: float = 0.7
    portfolio_max_positions: int = 5

    def register(self, pos: OpenPosition, family: PatternFamily) -> None: ...
    def close(self, symbol: str) -> None: ...
    def compute_penalty(
        self,
        new_direction: Direction,
        new_family: PatternFamily,
    ) -> tuple[float, dict]: ...
    def open_count(self) -> int: ...
    def snapshot(self) -> list[dict]: ...   # for monitoring/logging

def get_portfolio_guard() -> PortfolioGuard: ...   # process singleton
def reset_portfolio_guard() -> None: ...           # test fixture only
```

### 1.3 `engine/research/validation/sizing.py` (NEW)

```python
REGIME_MULT: dict[RegimeLabel, float]
VOL_MULT: dict[VolLabel, float]
ATR_MULT: dict[RegimeLabel, float]
VOL_ATR_MULT: dict[VolLabel, float]
REGIME_MULT_CLAMP: tuple[float, float] = (0.4, 1.4)

def regime_multiplier(
    regime: RegimeLabel,
    vol_label: Optional[VolLabel] = None,
) -> float: ...

def dynamic_atr_multiplier(
    regime: RegimeLabel,
    vol_label: Optional[VolLabel] = None,
) -> float: ...

def apply_portfolio_penalty(
    base_position_usdt: float,
    penalty: float,
) -> float: ...

def required_edge_pct(
    rr_ratio: float,
    n_samples: int,
    confidence: float = 0.80,
) -> float:
    """Min hit_rate so Wilson lower bound > breakeven."""
```

### 1.4 `engine/research/validation/performance_tracker.py` (NEW)

```python
PERIODS_PER_YEAR: int = 8760  # 365 * 24

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

def compute_sharpe(returns: np.ndarray, horizon_hours: int) -> float: ...
def compute_sortino(returns: np.ndarray, horizon_hours: int) -> float: ...
def compute_calmar(
    returns: np.ndarray, horizon_hours: int
) -> tuple[float, float]: ...   # (calmar, max_dd)

def update_rolling_performance(
    verdict_returns: Sequence[float],
    horizon_hours: int,
    window_days: int = 30,
    persist_path: Path | None = None,
) -> RollingPerformance: ...

def load_rolling_performance(
    persist_path: Path,
) -> Optional[RollingPerformance]: ...   # None if missing/corrupt
```

### 1.5 `engine/patterns/definitions.py` (MOD — Phase 0 dependency)

```python
class PatternFamily(str, Enum):
    HAMMER = "hammer"
    ENGULFING = "engulfing"
    INSIDE_BAR = "inside_bar"
    DOJI = "doji"
    PIN_BAR = "pin_bar"
    CONTINUATION = "continuation"
    REVERSAL = "reversal"
    BREAKOUT = "breakout"

@dataclass(frozen=True)
class PatternDefinition:
    # ... existing fields ...
    pattern_family: PatternFamily   # NEW required field
```

### 1.6 `engine/scoring/ensemble.py` (MOD — wiring point)

신규 함수 `_attach_risk_plan(verdict, pattern_stats, regime, vol_label, account_equity) -> EnsembleResult` 추가. `compute_ensemble()` 의 return 직전에 invoke. 기존 시그니처 변경 없음 (additive).

---

## V-Track Section 2 — Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         engine/scoring/ensemble.py                       │
│                                                                          │
│   compute_ensemble(p_win, blocks, regime) → EnsembleResult               │
│     │                                                                    │
│     │ direction=STRONG_LONG / LONG / STRONG_SHORT / SHORT                │
│     ▼                                                                    │
│   _attach_risk_plan(verdict, pattern_stats, regime, vol_label, equity)   │
│     │                                                                    │
└─────┼────────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────┐    ┌─────────────────────────────────────────┐
│ pattern_stats           │    │ engine/patterns/risk_policy.py          │
│   .hit_rate_30d : float │───▶│   build_risk_policy(p, n, rr)           │
│   .n_30d        : int   │    │     │                                   │
│   .pattern_family       │    │     ├── n<10 or f*≤0 → FixedStopPolicy  │
└─────────────────────────┘    │     └── else        → KellyPolicy       │
                               └─────┬───────────────────────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────────┐
                  │ engine/research/validation/sizing.py    │
                  │   regime_multiplier(regime, vol)        │
                  │     base [BULL 1.2, RANGE 0.8, BEAR 0.6]│
                  │     × VOL_MULT [0.85 / 1.0 / 1.05]      │
                  │     clamp [0.4, 1.4]                    │
                  │   → regime_mult : float                 │
                  └─────┬───────────────────────────────────┘
                        │
                        ▼
                  ┌─────────────────────────────────────────┐
                  │ engine/patterns/portfolio_guard.py      │
                  │   get_portfolio_guard()                 │
                  │     .compute_penalty(dir, family)       │
                  │       same_dir≥2 → ×0.5                 │
                  │       same_fam≥2 → ×0.7                 │
                  │       open≥5     → 0.0 (block)          │
                  │   → portfolio_mult : float              │
                  └─────┬───────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────────────────────────────────┐
              │ KellyPolicy.summary(                        │
              │     entry, atr, account_equity,             │
              │     regime, vol_label,                      │
              │     regime_mult, portfolio_mult, direction) │
              │                                             │
              │   position_usdt = equity * f_used           │
              │                   * regime_mult             │
              │                   * portfolio_mult          │
              │   stop_price    = entry - atr_mult * atr    │
              │                   (with min/max guards)     │
              │   target_price  = entry + risk * rr_ratio   │
              └─────┬───────────────────────────────────────┘
                    │
                    ▼
              verdict.risk_plan : dict   (attached to EnsembleResult-out)
                    │
                    ▼
              ┌─────────────────────────────────────────────┐
              │ outcome_resolver (1h scheduler hook)        │
              │   on verdict close → realized_return        │
              │     │                                       │
              │     ▼                                       │
              │ performance_tracker.update_rolling_perf()   │
              │   ← writes state/perf_rolling_30d.json      │
              │     (atomic .tmp → rename)                  │
              └─────────────────────────────────────────────┘
```

**Side channels**:
- `PortfolioGuard.register(pos, family)` 는 verdict가 "주문 실행" 단계로 진입할 때 외부 (Decision HUD / 후속 W-0312) 가 호출.
- `PortfolioGuard.close(symbol)` 는 outcome_resolver가 stop/target hit 시 호출.

---

## V-Track Section 3 — Test Matrix

> 함수명 단위 동결. 각 파일별로 정확히 다음 이름의 함수가 존재해야 한다.
> count: 15 + 11 + 8 + 6 = **40 tests**.

### 3.1 `engine/tests/test_kelly_policy.py` — 15 tests

```
test_kelly_star_positive_edge
test_kelly_star_negative_edge
test_kelly_star_breakeven_zero
test_kelly_used_fractional_quarter
test_kelly_used_clamped_at_cap
test_cold_start_fallback_under_min_samples
test_is_active_requires_positive_kelly
test_get_position_usdt_basic_AC1
test_get_position_usdt_with_regime_bear_AC2
test_get_position_usdt_account_equity_zero_raises
test_get_position_usdt_below_min_returns_zero
test_get_stop_price_bull_tight_AC4
test_get_stop_price_bear_wide_AC4
test_get_stop_price_min_pct_guard_AC9
test_get_stop_price_max_pct_guard_AC9
```

(15개. AC1/AC2/AC4/AC9 는 명시적 매핑, 나머지는 경계조건.)

### 3.2 `engine/tests/test_portfolio_guard.py` — 11 tests

```
test_no_penalty_with_zero_positions
test_no_penalty_with_one_same_direction
test_two_same_direction_returns_half_AC3
test_two_same_family_returns_seventy_pct
test_same_dir_and_same_family_compounds_to_035
test_portfolio_full_blocks_at_five
test_close_releases_penalty
test_opposite_direction_no_penalty
test_breakdown_dict_shape_contains_keys
test_register_overwrites_same_symbol
test_get_portfolio_guard_singleton_identity
```

### 3.3 `engine/tests/test_sizing.py` — 8 tests

```
test_regime_multiplier_bull_baseline
test_regime_multiplier_bear_baseline
test_regime_multiplier_range_baseline
test_regime_multiplier_high_vol_discount
test_regime_multiplier_low_vol_boost
test_regime_multiplier_clamp_upper_bound
test_dynamic_atr_multiplier_per_regime
test_required_edge_pct_wilson_lower_bound
```

### 3.4 `engine/tests/test_performance_tracker.py` — 6 tests

```
test_compute_sharpe_30_returns_AC8
test_compute_sortino_downside_only
test_compute_calmar_with_drawdown
test_update_rolling_performance_window_truncation
test_update_rolling_performance_atomic_persist
test_load_rolling_performance_missing_returns_none
```

### 3.5 Integration smoke (existing file)

```
# engine/tests/test_ensemble_risk_wiring.py (NEW lightweight)
test_strong_long_attaches_kelly_risk_plan
test_strong_long_falls_back_to_fixed_when_cold_start
test_neutral_signal_no_risk_plan_attached
```

(integration smoke 3개는 AC10 카운트에 추가, 총 43 tests.)

---

## V-Track Section 4 — Statistical Validity Protocol

### 4.1 30-day Rolling Window Sample Adequacy

| Check | Threshold | Rationale |
|-------|-----------|-----------|
| **Minimum samples** | `n ≥ 10` verdicts | binomial CI width < 0.4 at p=0.5 |
| **Wilson lower bound (80% CI)** | `p_LCB > 1/(1+rr)` | Kelly positive after CI shrinkage |
| **Required edge** | `hit_rate ≥ required_edge_pct(rr, n, 0.80)` | break-even in worst case 80% CI |
| **Decay slope** | `slope(hit_rate) > -0.01/day` | block degrading patterns (W-0290 Ph3) |

### 4.2 `required_edge_pct()` Calculation

```
breakeven_p = 1 / (1 + rr_ratio)            # rr=3 → 0.25
margin       = z * sqrt(p*(1-p)/n)          # z(80%)=1.282
required_p   = breakeven_p + margin         # so Wilson LCB > breakeven
```

worked example (`rr=3, n=10`):
- breakeven = 0.25, margin = 1.282 × √(0.25·0.75/10) ≈ 0.176
- required_p ≈ 0.426 → 패턴 hit_rate ≥ 0.43 일 때만 KellyPolicy 활성

### 4.3 Bootstrap Confidence Interval (optional hardening)

10,000 resample bootstrap on 30d verdict outcomes → 10th / 90th percentile of `f*`.
KellyPolicy 활성 조건: `f*_p10 > 0` (lower 10% bound positive).
구현은 W-0312 후보 (현 spec은 Wilson만 강제).

### 4.4 Multiple Testing Correction

W-0290 Phase 3 `multiple_testing.py` 결합:
- Bonferroni adjusted α: `α' = 0.10 / n_patterns_active`.
- Pattern 30개 동시 평가 → α' = 0.0033 → z = 2.94.
- 본 KellyPolicy는 단일 패턴 단위 → Bonferroni 비적용. 다만 production deploy 시 Sharpe trend 통계검정에는 적용 (`outcome_resolver` aggregation 단계).

### 4.5 Sample Size Power Analysis

To detect Sharpe = 0.5 (annualized) with power 0.80, α=0.05:
- `n_required ≈ (z_α + z_β)² / SR² ≈ (1.96 + 0.84)² / 0.25 ≈ 31.4`
- 30d window 평균 verdict 수 70 ≫ 31 → 충분한 power.

---

## V-Track Section 5 — Failure Mode Tree

```
[FM-1] Pattern stats DB timeout / unavailable
   ├─ Symptom:  pattern_stats.hit_rate_30d 조회 실패 (timeout, 5xx)
   ├─ Detect:   try/except + 100ms wallclock 측정
   ├─ Recover:  build_risk_policy(0.5, 0)  → FixedStopPolicy fallback
   └─ Alert:    log.warning("risk_engine.stats_unavailable") + counter

[FM-2] Kelly negative (f* ≤ 0)
   ├─ Symptom:  kelly_star() returns ≤ 0 (hit_rate < breakeven)
   ├─ Detect:   KellyPolicy.is_active() == False, kelly_star() ≤ 0
   ├─ Recover:  build_risk_policy fall through to FixedStopPolicy
   │            (cold-start path) — 단, hit_rate 표본은 충분하므로
   │            "신뢰성 있게 음수 edge" → 진입 자체 차단이 더 옳음.
   └─ Decision: get_position_usdt() returns 0.0 → ensemble.py 가 SignalDirection.NEUTRAL 로 강등

[FM-3] Portfolio overflow (open ≥ 5)
   ├─ Symptom:  PortfolioGuard.compute_penalty() returns (0.0, {"reason":"portfolio_full"})
   ├─ Detect:   open_count() >= portfolio_max_positions
   ├─ Recover:  새 신호 차단 (position_usdt=0).
   │            기존 포지션 close 시 자동 회복.
   └─ Alert:    log.info("portfolio_full_block", {"new_symbol":..., "open":[...]})

[FM-4] Regime classifier returns UNKNOWN / null
   ├─ Symptom:  classify_regime() 가 raise or returns None
   ├─ Detect:   regime is None or not isinstance(regime, RegimeLabel)
   ├─ Recover:  default to RegimeLabel.RANGE (보수 중립값 mult=0.8)
   │            vol_label 도 None → VOL_MULT 1.0
   └─ Alert:    log.warning("regime_classifier_unknown")

[FM-5] n_samples insufficient (cold-start)
   ├─ Symptom:  pattern_stats.n_30d < min_samples (10)
   ├─ Detect:   KellyPolicy.is_active() returns False (분기점 self.n_samples >= self.min_samples)
   ├─ Recover:  build_risk_policy → FixedStopPolicy(200 USDT, rr=3.0)
   └─ Alert:    log.info("kelly.cold_start_fallback", n=...)

[FM-6] account_equity invalid (≤ 0 or NaN)
   ├─ Symptom:  외부 호출자가 0, 음수, NaN 전달
   ├─ Detect:   get_position_usdt() __post_init__ assert + math.isfinite
   ├─ Recover:  ValueError raise (caller responsibility)
   └─ Alert:    상위 layer가 try/except → 신호 drop + alert

[FM-7] Rolling perf state corrupt / missing
   ├─ Symptom:  state/perf_rolling_30d.json 파일 손상 (JSONDecodeError)
   ├─ Detect:   load_rolling_performance() returns None
   ├─ Recover:  re-build from outcome_resolver verdict log (last 30d)
   └─ Alert:    log.error("perf_state_corrupt") + automatic rebuild trigger

[FM-8] Stop price violates min/max guard
   ├─ Symptom:  ATR=0 또는 ATR 너무 큼 → stop_dist out of [0.5%, 5%]
   ├─ Detect:   get_stop_price() 내부 clamp 자동 적용
   ├─ Recover:  clamp to bound (silent), but logged
   └─ Alert:    log.debug("stop_clamped", original=..., clamped=...)
```

---

## V-Track Section 6 — Rollout Plan

### Phase 0 — Pre-flight (1 day)

- `PatternFamily` enum + `PatternDefinition.pattern_family` 추가 + 기존 패턴 8개 family 분류.
- `state/perf_rolling_30d.json` `.gitignore` 등록.
- feature flag: `RISK_ENGINE_V2_MODE = "off" | "shadow" | "paper" | "live10" | "full"` (env var).

### Phase 1 — Shadow mode (3-5 days)

- `RISK_ENGINE_V2_MODE=shadow`.
- `KellyPolicy.summary()` 호출되지만 결과는 **로그만**, 실제 주문/사이즈는 여전히 `FixedStopPolicy`.
- Compare metric 수집:
  - `kelly_position_usdt` vs `fixed_position_usdt` 분포.
  - kelly negative block 빈도.
  - portfolio penalty trigger 빈도.
- **Exit gate**:
  - 100+ verdict shadow 비교.
  - kelly_used 평균이 `0.05–0.20` 범위 (sanity check).
  - 5% 이상의 verdict에서 `position_usdt=0` (Kelly 또는 portfolio block) — 너무 많거나 적으면 threshold 재조정.

### Phase 2 — Paper trade only (1-2 weeks)

- `RISK_ENGINE_V2_MODE=paper`.
- paper_executor (W-0298) 가 KellyPolicy 사이즈로 시뮬레이션 fill.
- 실 자금 영향 없음.
- **Exit gate**:
  - 200+ paper verdict 누적.
  - paper Sharpe > FixedStopPolicy paper baseline Sharpe.
  - max DD < 10% (paper).
  - portfolio_full block 빈도 < 5%.

### Phase 3 — Live with 10% account (2-4 weeks)

- `RISK_ENGINE_V2_MODE=live10`.
- `effective_equity = account_equity * 0.10` 로 사이즈 산출.
- 실 손실 가능 (단, 90% 자금은 노출 없음).
- **Exit gate**:
  - 50+ live verdict.
  - live Sharpe ≥ paper Sharpe × 0.7 (30% 페널티 허용).
  - max DD (live) < 5% of effective_equity.
  - 무사고 주문 집행 (slippage 평균 < 0.10%).

### Phase 4 — Full deployment

- `RISK_ENGINE_V2_MODE=full`.
- `effective_equity = account_equity * 1.0`.
- FixedStopPolicy 는 cold-start fallback only.
- Continuous monitoring: V-Track Section 7 메트릭.

### Rollback

각 phase 에서 1개라도 exit gate 실패 시:
- 즉시 한 단계 downshift (full → live10 → paper → shadow → off).
- 24h cool-down.
- 원인 분석 → spec patch → 다시 phase 진입.

---

## V-Track Section 7 — Monitoring Hooks

배포 후 추적 메트릭 (logging + metrics endpoint).

### 7.1 Real-time Counters (per verdict)

```
risk_engine.policy.kelly_active_total
risk_engine.policy.fixed_fallback_total
risk_engine.policy.kelly_negative_block_total
risk_engine.policy.portfolio_full_block_total
risk_engine.policy.equity_invalid_total
risk_engine.stats.cache_miss_total
```

### 7.2 Distributional Metrics (5min rollup)

| Metric | Aggregation | Healthy Range |
|--------|-------------|---------------|
| `kelly_star_distribution` | p10 / p50 / p95 | p50 ∈ [0.05, 0.40] |
| `kelly_used_distribution` | p10 / p50 / p95 | p50 ∈ [0.02, 0.15], p95 ≤ 0.25 |
| `position_usdt_median` | median | scales with account_equity (0.5–15%) |
| `position_usdt_p95` | p95 | ≤ 25% account_equity (Kelly cap) |
| `regime_mult_distribution` | per regime | BULL ≈ 1.2, RANGE ≈ 0.8, BEAR ≈ 0.6 (±10%) |
| `portfolio_mult_distribution` | p50 | ≥ 0.7 (penalty가 너무 자주 trigger되면 alarm) |
| `stop_dist_pct_distribution` | p10 / p50 / p95 | p50 ∈ [1%, 3%] |

### 7.3 Trend Metrics (1h rollup, persisted)

```
rolling_30d.sharpe        # target > 0.5 annualized
rolling_30d.sortino       # target > 0.7
rolling_30d.calmar        # target > 1.0
rolling_30d.max_dd_pct    # alert if > 15%
rolling_30d.cum_return    # informational
rolling_30d.n_samples     # alert if < 10 for > 24h
```

### 7.4 Override Rate Metrics

```
regime_override_rate     # (kelly_active && regime != RANGE) / kelly_active_total
                         # — 너무 낮으면 regime classifier 무력
portfolio_penalty_rate   # penalty<1.0 verdict / total
                         # — 너무 높으면 over-conservative
fallback_rate            # fixed_fallback / (kelly_active + fixed_fallback)
                         # — 너무 높으면 패턴 maturity 부족
```

### 7.5 Alert Rules

| Condition | Severity | Action |
|-----------|----------|--------|
| `rolling_30d.sharpe < 0` for 7 consecutive 1h windows | CRITICAL | Phase downshift trigger |
| `rolling_30d.max_dd_pct > 15%` | CRITICAL | Phase downshift |
| `kelly_used p95 > 0.30` (cap 우회) | HIGH | Code review (clamp 작동 확인) |
| `portfolio_full_block_total > 50%` of verdicts | MEDIUM | Threshold 재검토 |
| `stats_unavailable_total > 5%` | MEDIUM | DB 인프라 점검 |

---

## V-Track Section 8 — Integration Point (ensemble.py wiring)

### 8.1 Wiring Location

`engine/scoring/ensemble.py` `compute_ensemble()` (line 246-347).
**Insertion point**: line 338 직전 (return EnsembleResult(...) 직전).

### 8.2 Code Diff (의도)

```python
# engine/scoring/ensemble.py 상단 imports (line 28 부근 추가)
from typing import Optional, Protocol
from engine.patterns.risk_policy import build_risk_policy, KellyPolicy
from engine.patterns.portfolio_guard import get_portfolio_guard
from engine.patterns.definitions import PatternFamily
from engine.research.validation.sizing import regime_multiplier
from engine.research.validation.regime import RegimeLabel, VolLabel


class _PatternStatsProto(Protocol):
    hit_rate_30d: float
    n_30d: int
    pattern_family: PatternFamily


# compute_ensemble signature 확장 (선택적 인자만 추가, breaking 없음)
def compute_ensemble(
    p_win: Optional[float],
    blocks_triggered: list[str],
    regime: str = "chop",
    *,
    # NEW optional kwargs (default None → 기존 동작 유지)
    pattern_stats: Optional[_PatternStatsProto] = None,
    macro_regime: Optional[RegimeLabel] = None,
    vol_label: Optional[VolLabel] = None,
    account_equity: Optional[float] = None,
    entry_price: Optional[float] = None,
    atr: Optional[float] = None,
) -> EnsembleResult:
    # ... 기존 로직 그대로 ...

    # === NEW: line 338 직전, return 직전에 attach ===
    risk_plan = None
    portfolio_breakdown = None
    if (
        direction in (SignalDirection.STRONG_LONG, SignalDirection.LONG,
                      SignalDirection.STRONG_SHORT, SignalDirection.SHORT)
        and pattern_stats is not None
        and account_equity is not None
        and entry_price is not None
        and atr is not None
    ):
        side = "long" if direction in (SignalDirection.STRONG_LONG,
                                        SignalDirection.LONG) else "short"
        policy = build_risk_policy(
            hit_rate=pattern_stats.hit_rate_30d,
            n_samples=pattern_stats.n_30d,
            rr_ratio=3.0,
        )
        rmult = regime_multiplier(
            macro_regime or RegimeLabel.RANGE, vol_label
        )
        new_dir = Direction.LONG if side == "long" else Direction.SHORT
        pmult, breakdown = get_portfolio_guard().compute_penalty(
            new_direction=new_dir,
            new_family=pattern_stats.pattern_family,
        )
        if isinstance(policy, KellyPolicy):
            risk_plan = policy.summary(
                entry=entry_price, atr=atr,
                account_equity=account_equity,
                regime=macro_regime or RegimeLabel.RANGE,
                vol_label=vol_label,
                regime_mult=rmult,
                portfolio_mult=pmult,
                direction=side,
            )
        else:
            # FixedStopPolicy fallback
            fb = policy.summary(entry=entry_price, atr=atr)
            fb["policy"] = "fixed"
            fb["regime_mult"] = rmult
            fb["portfolio_mult"] = pmult
            risk_plan = fb
        portfolio_breakdown = breakdown

    # EnsembleResult 에 risk_plan / portfolio_breakdown 추가 필드 (Optional)
    return EnsembleResult(
        direction=direction,
        ensemble_score=ensemble,
        ml_contribution=ml_raw,
        block_contribution=block_raw,
        regime_contribution=regime_bonus,
        block_analysis=analysis,
        confidence=confidence,
        reason=" | ".join(reasons),
        risk_plan=risk_plan,                  # NEW Optional[dict]
        portfolio_breakdown=portfolio_breakdown,  # NEW Optional[dict]
    )
```

### 8.3 EnsembleResult Field Additions

```python
@dataclass(frozen=True)
class EnsembleResult:
    # ... 기존 필드 ...
    risk_plan: Optional[dict] = None              # NEW
    portfolio_breakdown: Optional[dict] = None    # NEW

    def to_dict(self) -> dict:
        d = {...}  # 기존
        if self.risk_plan is not None:
            d["risk_plan"] = self.risk_plan
        if self.portfolio_breakdown is not None:
            d["portfolio_breakdown"] = self.portfolio_breakdown
        return d
```

### 8.4 Backward Compatibility

- 모든 신규 인자는 `Optional` + default `None`.
- 기존 caller (`pattern_stats=None`) 는 risk_plan 없이 그대로 동작.
- 기존 테스트 변경 불필요.
- `EnsembleResult.risk_plan is None` 가 fallback path.

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
    """Kelly Criterion + Regime-conditioned + Portfolio-aware sizing."""
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
        return self.n_samples >= self.min_samples and self.kelly_star() > 0

    def kelly_star(self) -> float:
        b, p = self.rr_ratio, self.hit_rate
        q = 1.0 - p
        return (b * p - q) / b

    def kelly_used(self) -> float:
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
import math
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
    if not (0.0 <= penalty <= 1.0):
        raise ValueError(f"penalty {penalty} not in [0,1]")
    return base_position_usdt * penalty


def required_edge_pct(
    rr_ratio: float, n_samples: int, confidence: float = 0.80
) -> float:
    """Min hit_rate so Wilson lower bound > breakeven."""
    if n_samples < 1 or rr_ratio <= 0:
        return 1.0
    z_map = {0.80: 1.282, 0.90: 1.645, 0.95: 1.96}
    z = z_map.get(round(confidence, 2), 1.282)
    breakeven = 1.0 / (1.0 + rr_ratio)
    margin = z * math.sqrt(breakeven * (1.0 - breakeven) / n_samples)
    return min(1.0, breakeven + margin)
```

### Phase 3 — Portfolio guard

```python
# engine/patterns/portfolio_guard.py (NEW)
from dataclasses import dataclass, field
from engine.patterns.position_guard import OpenPosition, Direction
from engine.patterns.definitions import PatternFamily

@dataclass
class PortfolioGuard:
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

    def snapshot(self) -> list[dict]:
        return [
            {"symbol": s, "direction": p.direction.value, "family": f.value}
            for s, (p, f) in self._positions.items()
        ]


_PORTFOLIO_GUARD = PortfolioGuard()


def get_portfolio_guard() -> PortfolioGuard:
    return _PORTFOLIO_GUARD


def reset_portfolio_guard() -> None:
    """test fixture only — production code 사용 금지."""
    global _PORTFOLIO_GUARD
    _PORTFOLIO_GUARD = PortfolioGuard()
```

### Phase 4 — Performance tracker

```python
# engine/research/validation/performance_tracker.py (NEW)
import json
import math
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Sequence, Optional
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


def load_rolling_performance(persist_path: Path) -> Optional[RollingPerformance]:
    try:
        data = json.loads(Path(persist_path).read_text())
        return RollingPerformance(**data)
    except (FileNotFoundError, json.JSONDecodeError, TypeError):
        return None
```

### Phase 5 — Ensemble wiring

V-Track Section 8 참고. compute_ensemble() 끝부분에 risk_plan 부착.

### Phase 6 — Tests

V-Track Section 3 의 함수명을 그대로 구현.

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
- [ ] **AC10** 40+ tests PASS (15 kelly + 11 portfolio + 8 sizing + 6 perf, +3 integration smoke 권고).
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
7. `engine/scoring/ensemble.py:246-347` — 현재 `compute_ensemble(p_win, blocks, regime)`, threshold STRONG=0.65 / SIGNAL=0.55 (line 111-112). risk_plan attach 지점은 line 338 직전.
8. `engine/research/validation/stats.py:232` — W-0286 fix로 `arr.std(ddof=1)` 사용 중. `periods_per_year=8760` (365×24).
9. Scheduler: `outcome_resolver 1h` → rolling perf tracker hook 후보 (verdict close 시 update).

---

## Assumptions

- `account_equity`는 외부 (Decision HUD / 사용자 설정) 에서 매 verdict 호출 시 주입. 단일 값.
- `pattern_stats.hit_rate_30d`, `pattern_stats.n_30d`, `pattern_stats.pattern_family` 는 W-0290 walkforward result 또는 outcome_resolver aggregation에서 공급. 미존재 시 None → fallback (risk_plan=None).
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
- `engine/tests/test_ensemble_risk_wiring.py` (NEW; integration smoke)
- `state/perf_rolling_30d.json` (NEW; gitignored)
- `docs/domains/risk-engine.md` (MOD; 알고리즘 contract)

---

## Next Steps

1. **Phase 0 (선행)** — `PatternFamily` enum + `PatternDefinition.pattern_family` 필드 추가. 기존 정의 8 family 분류. ~30분.
2. **Phase 1** — `KellyPolicy` 클래스 + `build_risk_policy` factory. 단위 테스트 15+. ~2h.
3. **Phase 2** — `sizing.py` pure functions + tests. ~45분.
4. **Phase 3** — `PortfolioGuard` + tests. ~1h.
5. **Phase 4** — `performance_tracker.py` + atomic JSON persist + tests. ~1.5h.
6. **Phase 5** — Ensemble wiring (Section 8) + integration smoke test. ~1h.
7. **Phase 6** — `docs/domains/risk-engine.md` contract 작성 + `CURRENT.md` 업데이트. ~30분.
8. **Rollout** — Section 6 의 Phase 0 ~ Phase 4 단계적 활성화. 4-6주.

총 구현 예상: ~7h (1 sprint). 롤아웃 포함 4-6주.

---

## Open Questions

- **OQ-1** `account_equity` source of truth는 어디인가? (사용자 설정 단일값 vs exchange API live read) → M0에서는 환경변수 `ACCOUNT_EQUITY_USDT` 또는 settings JSON.
- **OQ-2** Regime classifier 호출 시점 (verdict 생성 시 vs 매 시간 갱신 vs 5분 캐시)? → 5분 캐시 권고.
- **OQ-3** Decay-aware Kelly: hit_rate slope < -0.01/day 시 kelly_fraction을 0.25 → 0.10 으로 낮출지 → W-0312 후보.
- **OQ-4** Multi-timeframe 패턴 (1h + 4h 동시 발화) correlation penalty가 동일하게 적용되어도 되는가? → 현재 yes; 후속 가능.
- **OQ-5** Phase 1 (shadow) 종료 임계값 — verdict 100개 vs verdict 200개? → 1차 100, exit gate 미충족 시 200까지 연장.
- **OQ-6** PortfolioGuard singleton vs DI? 멀티 프로세스 워커 시 inconsistency 가능 → 현재 single-process 가정. multi-worker 도입 시 W-0316 후보 (Redis-backed shared state).

---

## Handoff Checklist

- [ ] Phase 0 PatternFamily enum 추가 + 기존 패턴 분류.
- [ ] `KellyPolicy` 구현 + 15+ 테스트 PASS.
- [ ] `PortfolioGuard` 구현 + 11+ 테스트 PASS.
- [ ] `sizing.py` pure functions + 8+ 테스트 PASS.
- [ ] `performance_tracker.py` + atomic write + 6+ 테스트 PASS.
- [ ] `build_risk_policy()` factory가 KellyPolicy ↔ FixedStopPolicy 분기 정상 작동.
- [ ] `engine/scoring/ensemble.py` STRONG_LONG/LONG verdict에 `risk_plan` attach (Section 8 wiring).
- [ ] Integration smoke test 3건 PASS (`test_ensemble_risk_wiring.py`).
- [ ] AC1–AC12 모두 검증.
- [ ] `state/perf_rolling_30d.json` `.gitignore` 등록.
- [ ] `docs/domains/risk-engine.md` 알고리즘 + 수식 + 임계값 표 문서화.
- [ ] `RISK_ENGINE_V2_MODE` env var feature flag 추가 + Section 6 Phase gating.
- [ ] Monitoring 메트릭 7가지 카운터 + 7가지 분포 메트릭 + 5가지 알람 룰 등록 (Section 7).
- [ ] CI green (`pytest engine/tests/`).
- [ ] `CURRENT.md` main SHA 업데이트.
- [ ] PR description: "Closes #643" + AC 체크리스트 포함.
