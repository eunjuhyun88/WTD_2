# W-0312 — 개인화 패턴 매칭 엔진 (Per-user Variant + Verdict Learning)

> Wave: 4 | Priority: P1 | Effort: M
> Charter: In-Scope L7 (AutoResearch — personalized layer over global L4 PromotionGate)
> Status: 🟢 Design v2 (V-track)
> Created: 2026-04-29 | Upgraded: 2026-04-29
> Issue: #644
>
> **Source design context (실측 코드 reference):**
> - Global variant store: `engine/patterns/active_variant_registry.py`
> - Variant search loop: `engine/research/pattern_search.py` (Hill Climbing, `PromotionGatePolicy`)
> - User accuracy: `engine/stats/engine.py::compute_user_accuracy` — single scalar (no per-pattern breakdown)
> - 5-cat verdict labels: `engine/stats/user_accuracy.py::F60_DENOM_LABELS = (valid, invalid, near_miss, too_early, too_late)`
> - `VerdictOutcome` enum: `engine/scoring/verdict.py` — `HIT, MISS, VOID, PENDING`
> - Validation pipeline (global): `engine/research/validation/pipeline.py`
> - Refinement scheduler: `engine/research/refinement_trigger` (daily, ≥10 verdicts → re-search)

---

## Goal

Jin 페르소나가 verdict를 제출할수록 자신의 트레이딩 스타일에 맞게 패턴 threshold/affinity 가 개인화된다.
**측정 가능한 목표**: `verdicts_per_user ≥ 10` 사용자의 WVPL(Weekly Verified Pattern Loops) 평균이
글로벌 변형(global-only) 대조군 대비 **+20% 이상** (90% CI, two-sample Welch t-test, n≥30 per arm, 14일 window).

비목표: 패턴 자체의 발견(이미 W-0290 글로벌 검증이 담당), 사용자 행동 기반 **새 패턴** 자동 발굴
(W-0313 후속), 사용자별 ML 모델 학습 (XGBoost/LightGBM 풀 파이프라인 — Wave 5).

## Owner

`engine/personalization/` (신규 모듈) — Engine 도메인.
Surface 변경: `app/src/lib/api/users.ts` 에 WVPL/affinity getter 추가, UI 변경 최소.

---

## Scope

### Files Touched (신규)
- `engine/personalization/__init__.py`
- `engine/personalization/user_variant_registry.py` — Per-user `ActivePatternVariantEntry` 확장
- `engine/personalization/threshold_adapter.py` — Verdict → threshold delta (Bayesian)
- `engine/personalization/affinity_registry.py` — `(user, pattern)` Beta-Binomial 점수 + 영속화
- `engine/personalization/wvpl.py` — Per-user weekly loop counter
- `engine/personalization/coldstart.py` — Fallback policy
- `engine/personalization/decay.py` — 90d half-life concept-drift decay
- `engine/personalization/api.py` — REST endpoints (WVPL, affinity, variant resolve, ack)
- `engine/personalization/scheduler.py` — Daily per-user refinement hook
- `engine/personalization/exceptions.py` — `PersonalizationError` 계열
- `engine/tests/personalization/test_threshold_adapter.py` (≥6 tests)
- `engine/tests/personalization/test_affinity_registry.py` (≥4 tests)
- `engine/tests/personalization/test_user_variant_registry.py` (≥3 tests)
- `engine/tests/personalization/test_coldstart.py` (≥2 tests)
- `engine/tests/personalization/test_decay.py` (≥2 tests)
- `engine/tests/personalization/test_wvpl.py` (≥3 tests)
- `engine/tests/personalization/test_api_e2e.py` (≥2 tests)
- `engine/tests/personalization/test_search_priority.py` (≥2 tests)
- `engine/tests/personalization/test_ab_assignment.py` (≥1 test)
- `engine/tests/personalization/test_failure_modes.py` (≥3 tests)

### Files Touched (수정)
- `engine/patterns/active_variant_registry.py` — `resolve_for_user(user_id, pattern_slug)` 신규
- `engine/research/pattern_search.py` — `run_pattern_benchmark_search` 가 `user_id` 옵션 수용 (verdict pool filter)
- `engine/scheduler/refinement.py` (또는 동등 트리거) — 사용자별 분기

### DB / Storage
- 신규 테이블: `user_pattern_state` (Postgres) — Phase 1: JSON-backed, Phase 2: DB
- 신규 view: `user_wvpl_weekly` — 주간 검증 루프 카운트 (capture_records 집계)

### Non-Goals
- 사용자 간 협업 필터링 (CF) — 콜드 스타트 부하 + privacy 추가 검토 필요. Wave 5.
- 사용자 행동 시계열의 RNN/Transformer 학습 — 현 verdict volume (≤100/user) 기준 ROI 부족.
- 사용자 verdict 의 **글로벌 priors 업데이트** (개인화는 leaf, 글로벌 검증은 W-0290 trunk).
- 패턴 **선호 timeframe / 선호 symbol** 학습은 별도 score 만 노출 (UI 변경 X 이번 wave).

---

## CTO 관점

### 1. Verdict-driven Threshold Adaptation (Bayesian Beta–Binomial)

**문제**: 사용자가 같은 패턴에 `near_miss` 를 자주 찍으면 stop 이 너무 타이트, `too_early` 가 잦으면
entry trigger 조건이 약함. 이를 **글로벌 threshold 에 더해질 user delta** 로 변환한다.

**상태 변수** — pattern-family 단위로 보관:
```
state[u, P] = {
    α_near_miss, β_near_miss,   # Beta posterior over P(near_miss | event for u, P)
    α_too_early, β_too_early,
    α_too_late,  β_too_late,
    α_invalid,   β_invalid,
    α_valid,     β_valid,
    n_total
}
```
글로벌 prior `(α0, β0) = (1 + 5·p_global_c, 1 + 5·(1 − p_global_c))` 로 출발 (informed prior, κ_prior=5).

**업데이트 (per verdict 도착 시)**:
```
α_c ← α_c + 1        if verdict == c
β_c ← β_c + 1        if verdict ∈ F60_DENOM_LABELS \ {c}
```
사후 평균 `p̂_c = α_c / (α_c + β_c)`.

**Threshold delta map** (선형, 보수적 클램프):
```
stop_multiplier_delta(u, P)  = +η_s · (p̂_near_miss − p_global_near_miss)
                              − η_s · (p̂_invalid   − p_global_invalid)

entry_strictness_delta(u, P) = +η_e · (p̂_too_early − p_global_too_early)
                              − η_e · (p̂_too_late  − p_global_too_late)

clamp: |delta| ≤ Δ_max = 0.30
shrinkage: delta *= n_total / (n_total + κ),  κ = 20    # 30 verdicts 에서 60% 영향
```
하이퍼파라미터: `η_s = 0.6, η_e = 0.4, Δ_max = 0.30, κ = 20`. 초기값은 W-0290 글로벌 backtest 의
민감도 분석에서 도출 (구현 단계 1 sub-task).

**Bayesian 선택 이유**:
- Frequentist hit-rate 는 verdict 5개 미만에서 과적합. Beta posterior 는 자연스레 prior 가 지배.
- Conjugacy → O(1) 업데이트, scheduler 친화적.
- Posterior variance `α·β / ((α+β)² (α+β+1))` 를 그대로 confidence band 로 노출 (UI 미래 활용).

**기각 옵션**:
- ❌ EWM (Exponentially Weighted Moving) — verdict 가 sparse (주당 5-10) 하므로 forgetting factor 가 noise 만 증폭.
- ❌ Per-user XGBoost — n=30 verdicts 에서 학습 불가, 과적합 보장.
- ❌ Direct gradient (online SGD on `Δ_threshold`) — 학습률/스케줄 운영 부담, posterior 가 더 안전.

### 2. Pattern Affinity Score (Bayesian, ELO-aware fallback)

**문제**: 사용자 X 에게 어떤 패턴을 우선 띄울지. `valid` 비율이 직관적이나 sample size 문제.

**Score 정의** — `affinity(u, P) ∈ [0, 1]`:
```
affinity(u, P) = α_valid(u, P) / (α_valid(u, P) + β_valid(u, P))
                with prior (α0, β0) = (1 + 5·p_global_valid_P, 1 + 5·(1 − p_global_valid_P))
```
즉 §1 의 Bayesian state 를 그대로 재사용 — score 는 `valid` 카테고리의 사후 평균.

**Search 우선순위 반영**:
```
search_priority(u, P) = 0.5 · affinity(u, P) + 0.4 · global_promotion_score(P) + 0.1 · exploration_bonus(u, P)
exploration_bonus    = max(1/√n_observations, 0.1)
                       # WVPL_4w < 3 → 0.10 → 0.20 자동 부스트
```

### 3. Per-user Variant Selection (Global Base + User Delta)

**원칙**: 글로벌 variant 가 truth. 사용자는 거기에 **threshold delta** 만 얹는다 (variant 구조는 공유).

```python
def resolve_for_user(user_id, pattern_slug) -> ActivePatternVariantEntry:
    base = global_active_variant_store.get(pattern_slug)
    if user_total_verdicts(user_id) < COLD_START_THRESHOLD:        # 10
        return base
    delta = threshold_adapter.compute_delta(user_id, pattern_slug)
    user_variant = clone_with_overrides(
        base,
        phase_overrides=apply_threshold_delta(base.phase_overrides, delta),
        variant_slug=f"{base.variant_slug}__user-{short_hash(user_id)}",
        source_kind="personalized",
        source_ref=f"user:{user_id}",
    )
    user_variant_store.upsert(user_id, user_variant)
    return user_variant
```
**불변식**:
- 글로벌 variant 의 `pattern_slug`, `timeframe`, `watch_phases` 는 **불변**.
- 오직 `phase_overrides` 의 numeric threshold (entry trigger band, stop multiplier, target multiplier) 만 변경.
- `source_kind="personalized"`, `source_ref="user:{id}"` 로 글로벌과 구분 (감사 가능).
- 캐시: 사용자당 (pattern_slug → resolved variant) LRU `maxsize=64`, TTL 1h.

### 4. Cold-start Protocol

```python
COLD_START_THRESHOLD = 10           # total verdicts across all patterns
PER_PATTERN_COLD_START = 3          # 패턴 단위로도 3개 이하면 글로벌 fallback

def is_cold(user_id, pattern_slug=None):
    n = total_verdicts(user_id)
    if n < COLD_START_THRESHOLD:
        return True
    if pattern_slug and per_pattern_verdicts(user_id, pattern_slug) < PER_PATTERN_COLD_START:
        return True
    return False
```

### 5. WVPL Measurement + Feedback Loop

```sql
CREATE VIEW user_wvpl_weekly AS
SELECT
  user_id,
  date_trunc('week', verdict_at AT TIME ZONE 'UTC') AS iso_week,
  COUNT(*) FILTER (WHERE user_verdict IN ('valid', 'near_miss')) AS wvpl,
  COUNT(*) FILTER (WHERE user_verdict IN ('valid','near_miss','invalid','too_early','too_late')) AS wvpl_engaged,
  COUNT(*) FILTER (WHERE user_verdict = 'valid') AS valid_count,
  AVG(CASE WHEN user_verdict='valid' THEN 1.0 ELSE 0.0 END) AS week_hit_rate
FROM capture_records
WHERE user_verdict IS NOT NULL
GROUP BY user_id, iso_week;
```

**Feedback Loop** (daily scheduler hook):
```
for user in active_users():
    wvpl_4w = avg(user_wvpl_weekly[user, last 4 weeks])
    if wvpl_4w < 3 and not is_cold(user):
        boost_exploration_for_user(user, exploration_bonus_w3 = 0.20)   # 0.10 → 0.20
        flag_for_review(user, reason="wvpl_under_target")
    elif wvpl_4w > 6:
        boost_exploration_for_user(user, exploration_bonus_w3 = 0.05)
```

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 사용자 verdict bias (예: 항상 invalid) → 모든 threshold 극단으로 끌고 감 | Med | High | `Δ_max = 0.30` 클램프 + shrinkage, "always invalid" 사용자 자동 flag (n≥30 & valid_rate<0.05 이면 priors 강제 reset) |
| Per-user variant 폭발 (10k users × 6 patterns) | Low | Med | LRU cache + lazy compute (resolve 시점에만 머티리얼라이즈) |
| User-specific variant 가 글로벌 PromotionGate 미통과 임에도 라이브 | High | High | Personalized variant 는 글로벌 base 가 PromotionGate 통과한 경우에만 활성화 (불변식) |
| WVPL 측정의 timezone bug | Med | Low | UTC truncation 강제, view 정의에 `AT TIME ZONE 'UTC'` 명시 + test |
| 콜드 스타트에서 affinity = global, but UI 가 personalized 라 표시 | Low | Med | `is_cold` 응답에 `mode: "global_fallback"` 필드 포함 |
| Concept drift: 6개월 묵은 verdict 가 현재 추론 흐림 | Med | Med | half-life 90d decay 적용 (효과적 n 자동 축소) |
| DB write storm (verdict burst → upsert overload) | Low | High | Async batching (5s coalesce) + retry budget (3) |

---

## AI Researcher 관점

### 개인화 편향 위험

#### A. Selection bias — verdict 이력 자체가 편향
사용자가 "흥미로운" 시그널만 verdict 한다 → 시그널 분포 ≠ 모집단.
- 매 verdict 에 대해 `signal_was_shown` 레코드 동시 기록 (이미 capture_records 가 함).
- Affinity 계산은 P(valid | verdicted) 만 다룸 — selection bias 는 현 단계 수용 (Wave 5 IPW 보정 검토).

#### B. "Always invalid" 함정 — verdict-rage user
- n=20, valid=0 → α_valid=1, β_valid=21 → affinity=0.045 → 패턴 영원히 안 띄움 → verdict 0 → 영원히 0.045.
- **Mitigation**: `n_total ≥ 30 AND valid_rate < 0.05` 시 자동 reset to global priors + admin notify.
- **Mitigation 2**: search_priority 에서 affinity floor 0.10 보장 (occasional re-exposure).

#### C. Concept drift — 사용자 스타일 변화
- 6개월 전 verdict 와 현재 verdict 의 가중치 같음. 해결: `α, β` 를 **half-life 90일** 로 decay.
  ```
  on_load:  α ← 1 + (α_stored − 1) · 0.5^(days_since / 90)
  ```
- κ=20 이지만 decay 후엔 effective n 이 줄어 자동 plasticity 회복.

#### D. Privacy / Fairness
- verdict 데이터는 user-scoped, cross-user 유출 금지. `user_pattern_state` 는 RLS (Postgres row-level security) 로 user_id 일치만 접근.
- A/B test 시 group assignment 는 stable hash (`hash(user_id) mod 2`), opt-in 명시.

### Statistical Validation Plan

#### 가설
- **H0**: WVPL_personalized = WVPL_global (treatment effect zero).
- **H1**: WVPL_personalized > WVPL_global (one-sided, +20% lift).

#### 실험 설계
- **A/B split**: stable_hash(user_id) mod 2 → 0 (control: global variant) / 1 (treatment: personalized).
- **Inclusion**: `total_verdicts ≥ 10` 인 활성 사용자만.
- **Window**: 14 일.
- **Test statistic**: Welch's two-sample t-test (one-sided).
- **Confidence Interval**: 90%.
- **N target**: 60 사용자 (30/arm).
- **Power calc**:
  ```
  baseline μ0 = 3.0 WVPL, σ0 = 1.5
  target Δμ = 0.6 (20%)
  α = 0.05 (one-sided), power = 0.80
  n_per_arm = 2 · ((z_α + z_β) · σ / Δμ)²
            ≈ 2 · ((1.645 + 0.842) · 1.5 / 0.6)² ≈ 31
  ```
  → 30/arm 충분.

#### Multiple-testing 보정
- 6 patterns × 4 verdict categories × 2 metrics = 48 비교. Holm–Bonferroni 적용
  (이미 W-0290 의 `multiple_testing.py` 사용).

#### Stopping rule
- Sequential test (mSPRT) 는 MVP 에서 제외. Fixed-horizon 14일 후 평가.

#### Guardrails
- Per-pattern global_promotion_score 가 personalized arm 에서 더 나빠지면 안 됨.
- `verdicted/shown` 비율이 control 대비 -10% 미만이면 즉시 alert.

---

## V-Track Spec (구현 가능 수준)

### V-1. Module Interface Contract

#### `engine/personalization/threshold_adapter.py`
```python
from dataclasses import dataclass
from typing import Mapping, Literal

VerdictLabel = Literal["valid", "invalid", "near_miss", "too_early", "too_late"]
VERDICT_LABELS: tuple[VerdictLabel, ...] = (
    "valid", "invalid", "near_miss", "too_early", "too_late",
)

ETA_STOP: float = 0.6
ETA_ENTRY: float = 0.4
DELTA_MAX: float = 0.30
KAPPA: float = 20.0
KAPPA_PRIOR: float = 5.0   # informed prior 강도


@dataclass(frozen=True)
class BetaState:
    alpha: float
    beta: float

    @property
    def mean(self) -> float: ...
    @property
    def variance(self) -> float: ...


@dataclass(frozen=True)
class UserPatternState:
    user_id: str
    pattern_slug: str
    states: Mapping[VerdictLabel, BetaState]
    n_total: int
    last_verdict_at: str | None              # ISO 8601 UTC
    decay_applied_at: str | None


@dataclass(frozen=True)
class ThresholdDelta:
    stop_mul_delta: float
    entry_strict_delta: float
    target_mul_delta: float
    n_used: int
    shrinkage_factor: float
    clamped: bool


class ThresholdAdapter:
    def __init__(self, global_priors: Mapping[str, Mapping[VerdictLabel, float]]) -> None: ...

    def compute_delta(
        self,
        verdicts: UserPatternState,
        pattern_slug: str,
    ) -> ThresholdDelta: ...

    def update_on_verdict(
        self,
        state: UserPatternState,
        verdict: VerdictLabel,
        at_iso: str,
    ) -> UserPatternState: ...

    @staticmethod
    def initial_state(
        user_id: str,
        pattern_slug: str,
        global_priors: Mapping[VerdictLabel, float],
    ) -> UserPatternState: ...
```

#### `engine/personalization/affinity_registry.py`
```python
from dataclasses import dataclass

@dataclass(frozen=True)
class AffinityState:
    user_id: str
    pattern_slug: str
    alpha_valid: float
    beta_valid: float
    n_total: int
    score: float                # denormalized α/(α+β)
    is_cold: bool
    updated_at: str             # ISO 8601 UTC


class AffinityRegistry:
    def __init__(self, store_path: Path) -> None: ...

    def update(
        self,
        user_id: str,
        pattern_slug: str,
        outcome: VerdictLabel,
    ) -> AffinityState: ...

    def get_score(self, user_id: str, pattern_slug: str) -> float:
        """Return shrunken score (cold-start safe)."""

    def list_for_user(
        self, user_id: str, top_k: int | None = None
    ) -> list[AffinityState]: ...

    def reset(self, user_id: str, pattern_slug: str, reason: str) -> None:
        """Always-invalid rescue path (audit-logged)."""
```

#### `engine/personalization/user_variant_registry.py`
```python
from engine.patterns.active_variant_registry import ActivePatternVariantEntry

@dataclass(frozen=True)
class VariantResolution:
    entry: ActivePatternVariantEntry
    mode: Literal["personalized", "global_fallback"]
    delta: ThresholdDelta | None
    base_variant_slug: str
    resolved_at: str


class UserVariantRegistry:
    def __init__(
        self,
        threshold_adapter: ThresholdAdapter,
        affinity: AffinityRegistry,
        base_dir: Path,
    ) -> None: ...

    def resolve_for_user(
        self,
        user_id: str,
        pattern_slug: str,
    ) -> VariantResolution: ...

    def invalidate(self, user_id: str, pattern_slug: str) -> None: ...
```

#### `engine/personalization/wvpl.py`
```python
@dataclass(frozen=True)
class WVPLEntry:
    iso_week: str             # e.g. "2026-W17"
    wvpl: int                 # valid + near_miss
    wvpl_engaged: int         # all 5 verdict labels
    valid_count: int
    week_hit_rate: float


class WVPLTracker:
    def __init__(self, db: DatabaseSession) -> None: ...

    def compute(
        self,
        user_id: str,
        weeks: int = 4,
        zero_fill: bool = True,
    ) -> list[WVPLEntry]: ...

    def rolling_average(
        self, user_id: str, weeks: int = 4
    ) -> float: ...
```

#### `engine/personalization/decay.py`
```python
HALF_LIFE_DAYS: float = 90.0

def apply_decay(
    state: UserPatternState,
    now_iso: str,
    half_life_days: float = HALF_LIFE_DAYS,
) -> UserPatternState:
    """α,β ← 1 + (α_stored − 1) · 0.5^(days_since / half_life)"""
```

#### `engine/personalization/coldstart.py`
```python
COLD_START_THRESHOLD: int = 10
PER_PATTERN_COLD_START: int = 3
RESCUE_VALID_RATE: float = 0.05
RESCUE_MIN_N: int = 30

def is_cold(user_id: str, pattern_slug: str | None = None) -> bool: ...
def needs_rescue(state: UserPatternState) -> bool: ...
```

#### `engine/personalization/api.py`
```python
@router.get("/users/{user_id}/wvpl")
def get_wvpl(user_id: str, weeks: int = 4) -> list[WVPLEntry]: ...

@router.get("/users/{user_id}/affinity/{pattern_slug}")
def get_affinity(user_id: str, pattern_slug: str) -> AffinityState: ...

@router.get("/users/{user_id}/active_variant/{pattern_slug}")
def get_user_variant(user_id: str, pattern_slug: str) -> VariantResolution: ...

@router.post("/users/{user_id}/verdicts/personalization_ack")
def ack_verdict(user_id: str, payload: VerdictAckPayload) -> AffinityState:
    """Notify personalization engine of new verdict (idempotent)."""
```

### V-2. Data Flow

```
                  ┌─────────────────────────────┐
  user verdict ──▶│  POST /verdicts/...ack      │
                  └────────────┬────────────────┘
                               │
                               ▼
                  ┌─────────────────────────────┐
                  │ AffinityRegistry.update()   │  α/β ↑, score recompute
                  └────────────┬────────────────┘
                               │
                               ▼
                  ┌─────────────────────────────┐
                  │ ThresholdAdapter            │
                  │   .update_on_verdict()      │  Beta posterior tick
                  │   .compute_delta()          │  → ThresholdDelta
                  └────────────┬────────────────┘
                               │
                               ▼
                  ┌─────────────────────────────┐
                  │ UserVariantRegistry         │
                  │   .resolve_for_user()       │  base + delta → variant
                  └────────────┬────────────────┘
                               │
                               ▼
                  ┌─────────────────────────────┐
                  │ pattern_search.run(...      │  search_priority =
                  │   user_id=u)                │   0.5·affinity
                  │                             │   + 0.4·global
                  │                             │   + 0.1·exploration
                  └────────────┬────────────────┘
                               │
                               ▼
                  ┌─────────────────────────────┐
                  │ WVPLTracker.compute()       │  weekly rollup
                  └─────────────────────────────┘
                               │
                               ▼
                       feedback loop
                  (exploration boost / rescue)
```

### V-3. Test Matrix (function names — 25 tests total)

#### `test_threshold_adapter.py` (7)
- `test_threshold_delta_near_miss_dominant`
- `test_threshold_delta_clamped_at_delta_max`
- `test_threshold_delta_invalid_dominant_tightens_stop`
- `test_threshold_delta_too_early_increases_strictness`
- `test_update_on_verdict_increments_alpha_only_for_match`
- `test_update_on_verdict_increments_beta_for_other_labels`
- `test_shrinkage_factor_at_n30_equals_0_6`

#### `test_affinity_registry.py` (5)
- `test_affinity_uninformed_prior_seven_three`
- `test_affinity_informed_prior_with_pglobal_0_5`
- `test_affinity_score_floor_for_search_priority`
- `test_always_invalid_rescue_resets_to_priors`
- `test_list_for_user_returns_top_k_sorted`

#### `test_user_variant_registry.py` (4)
- `test_resolve_returns_global_when_cold`
- `test_resolve_applies_threshold_delta_when_warm`
- `test_resolve_preserves_invariant_pattern_slug_timeframe`
- `test_invalidate_clears_cache_entry`

#### `test_coldstart.py` (2)
- `test_cold_start_returns_global_under_10_total`
- `test_per_pattern_cold_start_under_3_verdicts`

#### `test_decay.py` (3)
- `test_decay_90d_halves_effective_n`
- `test_decay_zero_days_is_identity`
- `test_decay_idempotent_after_apply`

#### `test_wvpl.py` (3)
- `test_wvpl_4_weeks_zero_fill`
- `test_wvpl_utc_truncation_boundary`
- `test_wvpl_rolling_average_handles_empty`

#### `test_search_priority.py` (2)
- `test_search_priority_formula_weights_sum`
- `test_search_priority_exploration_boost_when_wvpl_low`

#### `test_ab_assignment.py` (1)
- `test_ab_assignment_balance_50_50_within_5pct`

#### `test_api_e2e.py` (3)
- `test_get_wvpl_endpoint_returns_4_entries`
- `test_get_affinity_endpoint_cold_user_returns_global`
- `test_post_verdict_ack_idempotent`

#### `test_failure_modes.py` (3)
- `test_overflow_verdicts_does_not_explode_alpha`
- `test_db_timeout_returns_global_fallback`
- `test_negative_affinity_impossible_invariant`

**Total: 33 test functions** (지시문의 20+ 충족).

### V-4. Statistical Protocol

| Item | Spec |
|---|---|
| Test | Welch two-sample t-test (one-sided) |
| Sample | n=30 per arm (60 users total) |
| CI | 90% (one-sided α=0.05) |
| Lift target | +20% (Δμ=0.6 on baseline μ=3.0 WVPL) |
| Window | 14 days fixed-horizon |
| Power | 0.80 (verified via formula, n_per_arm≈31) |
| Inclusion | total_verdicts ≥ 10 (cold-start 졸업) |
| Multiple testing | Holm–Bonferroni (48 comparisons) |
| Guardrail | global_promotion_score 비악화, verdicted/shown 비율 ≥ control − 10% |
| Pre-registration | `research/experiments/personalization_v1.json` |

### V-5. Failure Mode Tree

```
F-1. Cold-start user (n_total < 10)
     └─ resolve_for_user() → global base
        affinity → p_global_valid
        delta → null

F-2. Decay → near-zero effective n
     └─ days_since_last > 365
        α,β → ≈ 1.0 (uninformed)
        shrinkage_factor → ~0
        delta → 0 (auto plasticity)

F-3. Always-invalid rescue
     └─ n_total ≥ 30 AND valid_rate < 0.05
        AffinityRegistry.reset(user_id, pattern_slug, reason="rescue")
        Audit log → memory/incidents/personalization_rescue.jsonl
        Admin notify (Slack #ops-personalization)

F-4. DB / store timeout (read)
     └─ ThresholdAdapter.compute_delta raises StoreTimeoutError
        UserVariantRegistry catches → mode="global_fallback"
        Counter: personalization_db_timeout_total += 1
        Retry budget: 3 (exponential backoff 100ms, 400ms, 1.6s)

F-5. Overflow verdicts (verdict storm 1000+/min)
     └─ Async batching (5s coalesce window)
        Beta α,β capped at 1e6 to avoid float precision drift
        Test: test_overflow_verdicts_does_not_explode_alpha

F-6. Negative affinity (invariant violation)
     └─ Should be impossible (α,β ≥ 1 always)
        Defensive assert in AffinityState.__post_init__
        Test: test_negative_affinity_impossible_invariant

F-7. Variant slug collision
     └─ short_hash(user_id) collision (16-bit) → +user_id suffix on conflict
        UserVariantRegistry.upsert detects + appends counter

F-8. Global base variant retracted (PromotionGate revoked)
     └─ resolve_for_user() returns base=None
        Personalized variant invalidated (cache flush)
        UI 표면에 "pattern_unavailable" 신호
```

### V-6. Rollout Plan

| Phase | Coverage | Duration | Guardrail (rollback if) |
|---|---|---|---|
| 0. Shadow | 0% (compute but don't apply) | 7d | personalized vs global delta divergence > Δ_max in >5% cases |
| 1. Canary | 10% (random hash mod 10) | 7d | WVPL drop > 10% vs control |
| 2. Expanded | 50% | 7d | A/B Welch t-test p > 0.10 (no lift) |
| 3. Full | 100% | indefinite | Daily WVPL_engaged ratio < 0.95 of pre-launch |

**Kill switch**: `feature_flag('personalization.enabled')` — ENV `PERSONALIZATION_ENABLED=false`
즉시 모든 사용자 global fallback. PostgreSQL 데이터는 보존 (recovery 가능).

### V-7. Monitoring (Prometheus / Grafana)

| Metric | Type | Alert |
|---|---|---|
| `personalization_wvpl_engaged_ratio` | gauge | <0.95 for 1h → page |
| `personalization_wvpl_global_ratio` | gauge | reference |
| `personalization_affinity_score_p50` | gauge | drift >0.1 in 24h → warn |
| `personalization_cold_start_rate` | gauge | >0.5 sustained → warn |
| `personalization_decay_trigger_count` | counter | spike > 10x baseline → warn |
| `personalization_rescue_count` | counter | >5/day → page (verdict-rage cluster?) |
| `personalization_db_timeout_total` | counter | >100/h → page |
| `personalization_resolve_latency_p99_ms` | histogram | >200ms → warn |
| `personalization_ab_assignment_skew` | gauge | abs(50-x) > 5 → warn |

### V-8. DB Schema

#### `user_pattern_state` (Postgres, Phase 2)
```sql
CREATE TABLE user_pattern_state (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL,
  pattern_slug       TEXT NOT NULL,
  alpha_valid        REAL NOT NULL DEFAULT 1.0,
  beta_valid         REAL NOT NULL DEFAULT 1.0,
  alpha_invalid      REAL NOT NULL DEFAULT 1.0,
  beta_invalid       REAL NOT NULL DEFAULT 1.0,
  alpha_near_miss    REAL NOT NULL DEFAULT 1.0,
  beta_near_miss     REAL NOT NULL DEFAULT 1.0,
  alpha_too_early    REAL NOT NULL DEFAULT 1.0,
  beta_too_early     REAL NOT NULL DEFAULT 1.0,
  alpha_too_late     REAL NOT NULL DEFAULT 1.0,
  beta_too_late      REAL NOT NULL DEFAULT 1.0,
  n_verdicts         INTEGER NOT NULL DEFAULT 0,
  affinity_score     REAL NOT NULL DEFAULT 0.5,           -- denormalized
  last_verdict_at    TIMESTAMPTZ,
  decay_applied_at   TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, pattern_slug)
);

CREATE INDEX idx_user_pattern_state_user
  ON user_pattern_state(user_id, affinity_score DESC);
CREATE INDEX idx_user_pattern_state_last_verdict
  ON user_pattern_state(last_verdict_at)
  WHERE last_verdict_at IS NOT NULL;

ALTER TABLE user_pattern_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_pattern_state_self_only ON user_pattern_state
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

#### `user_wvpl_weekly` (view) — see §5 above.

#### Phase 1 JSON layout
```
engine/data_cache/personalization/users/{user_id}/{pattern_slug}.json
{
  "user_id": "u-xxx",
  "pattern_slug": "tradoor-oi-reversal-v1",
  "states": {
    "valid":     {"alpha": 1.0, "beta": 1.0},
    "invalid":   {"alpha": 1.0, "beta": 1.0},
    "near_miss": {"alpha": 1.0, "beta": 1.0},
    "too_early": {"alpha": 1.0, "beta": 1.0},
    "too_late":  {"alpha": 1.0, "beta": 1.0}
  },
  "n_verdicts": 0,
  "affinity_score": 0.5,
  "last_verdict_at": null,
  "decay_applied_at": null
}
```

### V-9. API Endpoints (REST)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/users/{id}/wvpl?weeks=4` | Weekly Verified Pattern Loops | session |
| GET | `/users/{id}/affinity/{pattern_slug}` | Single pattern affinity state | session |
| GET | `/users/{id}/affinity` | All patterns (top_k optional) | session |
| GET | `/users/{id}/active_variant/{pattern_slug}` | Resolved variant + mode | session |
| POST | `/users/{id}/verdicts/personalization_ack` | Notify of new verdict (idempotent) | service-token |

**Request/Response**:
```jsonc
// GET /users/u-xxx/wvpl?weeks=4
[
  {"iso_week": "2026-W17", "wvpl": 5, "wvpl_engaged": 8, "valid_count": 3, "week_hit_rate": 0.6},
  ...
]

// GET /users/u-xxx/affinity/tradoor-oi-reversal-v1
{
  "user_id": "u-xxx",
  "pattern_slug": "tradoor-oi-reversal-v1",
  "alpha_valid": 8.0, "beta_valid": 4.0,
  "n_total": 10,
  "score": 0.667,
  "is_cold": false,
  "updated_at": "2026-04-29T10:15:00Z"
}

// POST /users/u-xxx/verdicts/personalization_ack
{
  "verdict_id": "v-yyy",                   // idempotency key
  "pattern_slug": "tradoor-oi-reversal-v1",
  "verdict": "near_miss",
  "verdict_at": "2026-04-29T10:14:55Z"
}
```

---

## Decisions

| # | Decision | Chosen | Rejected | Reason |
|---|---|---|---|---|
| D1 | Threshold update method | Beta–Binomial Bayesian (conjugate) | EWM, online SGD, per-user XGBoost | Sparse verdict (~5/주) → posterior shrinkage 가 핵심. O(1) 업데이트. |
| D2 | Affinity score | Beta posterior `α/(α+β)` on `valid` | ELO rating, raw hit-rate | Multi-pattern 독립 가정 적합. Variance 도 자연스럽게 노출. |
| D3 | Variant selection | Global base + threshold delta | Per-user full variant search | Global trunk 검증 보존. n=30 verdicts 로 새 phase override 못 학습. |
| D4 | Cold-start fence | 10 total + 3 per-pattern | 단일 30 verdicts | Per-pattern fence 로 over-coverage 방지. |
| D5 | Concept drift | exponential decay half-life 90d | sliding window, no decay | 90d 는 crypto regime cycle 평균 (W-0290 5-regime 분석 기준). |
| D6 | Storage Phase 1 | JSON-backed (ActiveVariantStore 패턴 재사용) | 처음부터 Postgres | 빠른 MVP, 글로벌 store 와 일관, Wave 5 에서 DB 이관. |
| D7 | A/B exposure mechanism | stable_hash mod 2 | random per-session | 사용자 분산 안정, 분석 재현. |
| D8 | "Always invalid" rescue | n=30 & valid_rate<0.05 → auto reset | manual review only | Silent trap 방지 자동화. |
| D9 | Rollout | Shadow → 10% → 50% → 100% with kill switch | Big-bang flag | Verdict feedback loop 안정화 단계 필요. |
| D10 | Stat test | Welch t-test (variance heteroskedastic OK) | Mann-Whitney U | Welch 가 근사 정규성 + 작은 표본에 robust. |

---

## Implementation Plan (Stage 단위)

### Stage 0: 측정 인프라 (depends-on: nothing) — 1 day
- `engine/personalization/wvpl.py` + view migration
- `GET /users/{id}/wvpl` (mock data 로 baseline 측정)
- 14일 데이터 수집 → μ0, σ0 확정 (statistical plan 의 가정 검증)

### Stage 1: Threshold Adapter — 2 days
- `BetaState`, `UserPatternState`, `ThresholdDelta` dataclasses
- `compute_delta`, `update_on_verdict`, `apply_decay`
- 7 unit tests + 1 property test (`hypothesis` for `|delta| ≤ Δ_max`)

### Stage 2: Affinity Registry + User Variant Registry — 1.5 days
- JSON-backed store, atomic write, LRU cache
- `resolve_for_user` integration with `ActivePatternVariantStore`
- 9 tests

### Stage 3: API + Scheduler Hook — 0.5 day
- FastAPI router, `personalization_ack` idempotency via `verdict_id` dedup
- 3 e2e tests

### Stage 4: A/B harness & telemetry — 0.5 day
- `engine/experiments/personalization_ab.py`
- `research/experiments/personalization_v1.json` preregistration
- Prometheus metric exporters
- 1 assignment test + 3 failure-mode tests

### Stage 5: Rollout (shadow → canary) — 7d shadow + 7d canary
- Feature flag plumbing
- Monitoring dashboard
- Alert routing

**Total dev: ~5.5 days. Total elapsed (with shadow+canary): ~3 weeks.**

---

## Exit Criteria

- [ ] **AC1** — Threshold adaptation correctness: 사용자 A 가 `near_miss` 7회/`valid` 3회/`invalid` 0회 (n=10, p_nm=0.7) 제출 → `compute_delta` 결과 `stop_mul_delta = +0.6 · (0.7 − p_global_nm) · (10/30) ≈ +0.10..+0.13` (p_global_nm=0.2 가정), 클램프 미발동, sign positive (stop 완화). 수치 단위 테스트 + property test (랜덤 input → `|delta| ≤ Δ_max`).
- [ ] **AC2** — Cold-start fence: 사용자 B (verdicts=5) → `resolve_for_user` 반환값이 글로벌 store 의 entry 와 deep-equal, `mode == "global_fallback"`.
- [ ] **AC3** — Affinity correctness: 사용자 X 가 `tradoor-oi-reversal-v1` 에 valid 7 / invalid 3 (n=10) → uninformed prior `(1,1)` 시 affinity ≈ 0.667; informed prior `(3.5, 3.5)` + 7 valid + 3 (invalid+near_miss+too_early+too_late) → `affinity = 10.5/17 ≈ 0.618`. **두 시나리오 모두 ±0.01 이내 일치 테스트**.
- [ ] **AC4** — WVPL API: `GET /users/{id}/wvpl?weeks=4` → `[{"iso_week": "2026-W17", "wvpl": 5, "wvpl_engaged": 8, "valid_count": 3, "week_hit_rate": 0.6}, ...]` 4 entries, UTC truncation, missing weeks 는 0 fill.
- [ ] **AC5** — 33 tests PASS (V-3 의 함수 목록 전체) + coverage ≥ 90% (line) on `engine/personalization/`. svelte-check / mypy 0 errors.
- [ ] **AC6** — A/B harness: `python -m engine.experiments.personalization_ab --dry-run` → assignment 분포 50/50 ± 5% on 1000 mock user_ids.
- [ ] **AC7** — Concept drift: `apply_decay(state, days_since_update=90)` → 모든 Beta posterior 의 effective n (=α+β−2) 이 ±1% 이내에서 절반.
- [ ] **AC8** — Always-invalid rescue triggered: n=30, valid_rate=0.03 인 mock state → `AffinityRegistry.reset` 호출 → priors 반환 + `memory/incidents/personalization_rescue.jsonl` audit 기록 + admin notify hook 호출.
- [ ] **AC9** — Statistical readiness: preregistration JSON (`research/experiments/personalization_v1.json`) 커밋, power calc 결과 (n=31/arm) 문서화, Welch t-test 코드 reference 포함.
- [ ] **AC10** — Rollout safety: kill-switch `PERSONALIZATION_ENABLED=false` → 모든 사용자 global fallback 즉시 (≤5초), 데이터 손실 0건. Shadow phase logs `engine/data_cache/personalization/shadow_audit/*.jsonl` 누적.

---

## Open Questions

1. `p_global_*` priors 산출 — W-0290 의 검증 파이프라인이 패턴별 verdict 분포를 직접 출력하는가, 별도 집계 잡 필요한가?
2. RLS (Postgres row-level security) Phase 1 JSON 단계에서는 file system permission 만으로 충족 OK?
3. Verdict ack endpoint 의 service-token 발급은 기존 `engine.scheduler` 토큰 재사용 OK?
4. Rescue 후 사용자에게 in-app notification 보낼 것인가, 조용히 reset 할 것인가? (UX 결정)
5. Decay 적용 시점 — daily scheduler vs. lazy on-read? (성능/정합성 trade-off)

---

## Facts

- Global active variant store 는 패턴당 하나의 entry 를 JSON 파일로 보관 (`engine/pattern_active_variants/{pattern_slug}.json`). User dimension 부재.
- Verdict 5-카테고리 라벨링은 `engine/stats/user_accuracy.py::F60_DENOM_LABELS` 에서 합의됨 (`valid`, `invalid`, `near_miss`, `too_early`, `too_late`).
- F-60 publishable gate 는 200+ verdicts 를 요구 — 글로벌 표준. 개인화 임계는 10 (relaxed, per-user signal).
- `PromotionGatePolicy` 의 글로벌 게이트 (Sharpe ≥ 0.5, FDR ≤ 0.4 등) 는 W-0290 에서 강화됨. 개인화는 이 게이트를 통과한 variant 만을 base 로 받음.
- `compute_user_accuracy` 은 이미 있으나 단일 스칼라 (전체 hit-rate) — per-pattern breakdown 없음.
- `VerdictOutcome` enum (`engine/scoring/verdict.py`) 은 HIT/MISS/VOID/PENDING 만 — 5-cat verdict 와는 별도 layer.

## Assumptions

- 사용자당 weekly verdict volume 5–10 (F-60 기준 pre-launch 추정). 이 가정 위배 시 (e.g., 100/week) → κ 재튜닝.
- Crypto regime 사이클 평균 90 일 (W-0290 5-regime 분석). decay half-life 의 근거.
- 글로벌 priors `p_global_*` 는 W-0290 검증 파이프라인이 패턴별로 산출 가능. 첫 구현은 패턴 무관 평균 (`{valid: 0.4, near_miss: 0.2, invalid: 0.25, too_early: 0.10, too_late: 0.05}`) 로 출발.
- A/B 실험 14일 동안 외부 시장 충격 (예: BTC −20% 단일 일) 발생 시 분석 단위에서 layered (Layer 4 분석으로 별도 보고).
- User variant 가 글로벌 base 를 deep-clone 하여 `phase_overrides` 만 변형 — variant_id 는 base 와 분리되나 `base_variant_slug` 로 lineage 추적.

## Canonical Files

- `engine/personalization/__init__.py`
- `engine/personalization/threshold_adapter.py` — Bayesian update, delta computation
- `engine/personalization/affinity_registry.py` — score + persistence + rescue
- `engine/personalization/user_variant_registry.py` — store + resolve
- `engine/personalization/wvpl.py` — measurement
- `engine/personalization/coldstart.py` — gates
- `engine/personalization/decay.py` — concept drift
- `engine/personalization/api.py` — REST surface
- `engine/personalization/scheduler.py` — daily hook
- `engine/personalization/exceptions.py`
- `migrations/2026XXXX_user_pattern_state.sql`
- `engine/experiments/personalization_ab.py` — A/B harness
- `research/experiments/personalization_v1.json` — preregistration
- `docs/runbooks/personalization-feedback-loop.md` — operator runbook

## Next Steps

1. **사용자 검토 게이트** (이 문서 v2) — V-track 스펙/하이퍼파라미터/decision matrix 승인.
2. **Stage 0 spike** — current verdict volume 측정 → assumption (5–10/week) 확인. 미달 시 effort 재산정.
3. **Global priors 산출** — W-0290 의 검증 파이프라인 출력에서 per-pattern verdict distribution 추출 (Stage 1 시작 전 필수).
4. **GitHub Issue 생성** — Issue ID 받아 branch rename `feat/W-0312-personalization-engine`.
5. Stage 1 구현 → Stage 5 까지 순차 (병렬화 어려움 — Stage 2/3 가 Stage 1 수식에 종속).

## Handoff Checklist

- [ ] `docs/decisions/` 에 D1–D10 10개 결정 기록 (`/결정` 사용)
- [ ] `state/contracts.md` 에 personalization 모듈 계약 등록 (Bayesian invariants, RLS 요구)
- [ ] `engine/personalization/__init__.py` 의 docstring 에 알고리즘 1-page 요약
- [ ] A/B 실험 preregistration → `research/experiments/personalization_v1.json` 커밋
- [ ] `docs/runbooks/personalization-feedback-loop.md` — 운영자용 (rescue, exploration boost 수동 트리거)
- [ ] `CURRENT.md` 의 Wave 4 섹션 업데이트
- [ ] PR 본문에 AC1–AC10 체크박스 + Statistical plan 의 power 계산 재확인
- [ ] Prometheus dashboards (`grafana/personalization.json`) 등록
- [ ] Kill-switch `PERSONALIZATION_ENABLED` env 키 `state/inventory.md` 등록
