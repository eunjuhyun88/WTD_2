# W-0312 — 개인화 패턴 매칭 엔진 (Per-user Variant + Verdict Learning)

> Wave: 4 | Priority: P1 | Effort: M
> Charter: In-Scope L7 (AutoResearch — personalized layer over global L4 PromotionGate)
> Status: 🟡 Design Draft v1
> Created: 2026-04-29
> Issue: #644
>
> **Source design context:**
> - Global variant store: `engine/patterns/active_variant_registry.py`
> - Variant search loop: `engine/research/pattern_search.py` (Hill Climbing, `PromotionGatePolicy`)
> - User accuracy: `engine/stats/engine.py::compute_user_accuracy` (5-cat verdict, F60 publishable gate)
> - Validation pipeline (global): `engine/research/validation/pipeline.py`
> - Refinement scheduler: `engine/research/refinement_trigger` (daily, ≥10 verdicts → re-search)

---

## Goal

Jin 페르소나가 verdict를 제출할수록 자신의 트레이딩 스타일에 맞게 패턴 threshold/affinity 가 개인화된다.
**측정 가능한 목표**: `verdicts_per_user ≥ 10` 사용자의 WVPL(Weekly Verified Pattern Loops) 평균이
글로벌 변형(global-only) 대조군 대비 **+20% 이상** (90% CI, two-sample t-test, n≥30 per arm, 14 일 window).

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
- `engine/personalization/affinity.py` — `(user, pattern)` ELO-style 점수
- `engine/personalization/wvpl.py` — Per-user weekly loop counter
- `engine/personalization/coldstart.py` — Fallback policy
- `engine/personalization/api.py` — `GET /users/{id}/wvpl`, `/users/{id}/affinity`, `/users/{id}/active_variant/{pattern_slug}`
- `engine/personalization/scheduler.py` — Daily per-user refinement hook
- `engine/tests/personalization/test_threshold_adapter.py` (≥6 tests)
- `engine/tests/personalization/test_affinity.py` (≥4 tests)
- `engine/tests/personalization/test_user_variant_registry.py` (≥3 tests)
- `engine/tests/personalization/test_coldstart.py` (≥2 tests)
- `engine/tests/personalization/test_wvpl.py` (≥3 tests)
- `engine/tests/personalization/test_api_e2e.py` (≥2 tests)

### Files Touched (수정)
- `engine/patterns/active_variant_registry.py` — `resolve_for_user(user_id, pattern_slug)` 신규
- `engine/research/pattern_search.py` — `run_pattern_benchmark_search` 가 `user_id` 옵션 수용 (verdict pool filter)
- `engine/scheduler/refinement.py` (또는 동등 트리거) — 사용자별 분기

### DB / Storage
- 신규 테이블: `user_variant_registry` (Postgres) — 또는 첫 구현은 JSON-backed (active_variant_registry 스타일) → Wave 5 에서 DB 이관
- 신규 테이블: `user_pattern_affinity` — `(user_id, pattern_slug, score, n_observations, updated_at)`
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
    n_total
}
```
글로벌 prior `(α0, β0) = (1 + n_global * p_global, 1 + n_global * (1 − p_global))` 에서 출발.
`n_global` 은 글로벌 사용자 풀에서의 해당 verdict 카테고리 카운트의 0.05 배 — strong prior 로 시작 (콜드 스타트 안정).

**업데이트 (per verdict 도착 시)**:
```
α_c ← α_c + 1        if verdict == c
β_c ← β_c + 1        if verdict ∈ F60_DENOM_LABELS \ {c}
```
사후 평균 `p̂_c = α_c / (α_c + β_c)`.

**Threshold delta map** (선형, 보수적 클램프):
```
stop_multiplier_delta(u, P)  = +η_s · (p̂_near_miss − p_global_near_miss)         # near_miss ↑ → 손절 완화
                              − η_s · (p̂_invalid   − p_global_invalid)           # invalid ↑ → 손절 강화 (반대 방향)

entry_strictness_delta(u, P) = +η_e · (p̂_too_early − p_global_too_early)         # too_early ↑ → entry 더 엄격
                              − η_e · (p̂_too_late  − p_global_too_late)          # too_late ↑ → entry 빠르게

clamp: |delta| ≤ Δ_max = 0.30           # 최대 30% 만 흔들림
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

### 2. Pattern Affinity Score (ELO-style, Bayesian-aware)

**문제**: 사용자 X 에게 어떤 패턴을 우선 띄울지. `valid` 비율이 직관적이나 sample size 문제.

**Score 정의** — `affinity(u, P) ∈ [0, 1]`:
```
affinity(u, P) = (α_valid(u, P)) / (α_valid(u, P) + β_valid(u, P))
                where (α_valid, β_valid) is the Beta posterior on P(valid | event)
                with prior (α0, β0) = (1 + 5·p_global_valid_P, 1 + 5·(1 − p_global_valid_P))
```
즉 §1 의 Bayesian state 를 그대로 재사용 — score 는 `valid` 카테고리의 사후 평균.

**ELO-like 변형 (대안, 패턴 간 상대 ranking 안정성용)**:
```
rating(u, P) ← rating(u, P) + K · (S − E)
S = 1 if valid, 0.5 if near_miss, 0 if invalid/too_early/too_late
E = 1 / (1 + 10^((rating_baseline − rating(u, P)) / 400))
K = 16 · n_total / (n_total + 10)        # warmup
rating_baseline = 1500
```
**선택**: Beta posterior 가 1차. ELO 는 "패턴 간 ranking" UI 에 노출할 때만 보조 사용.
이유: ELO 는 zero-sum 가정이라 multi-pattern 환경에서 의미가 약함. Beta posterior 는 패턴별 독립
가정이 트레이딩 컨텍스트에 맞음.

**Search 우선순위 반영**:
```
search_priority(u, P) = w1 · affinity(u, P) + w2 · global_promotion_score(P) − w3 · n_observations(u, P)^(-0.5)
                       = 0.5 · affinity + 0.4 · global_score + 0.1 · exploration_bonus
```
exploration_bonus 는 `1/√n` (UCB1 류) — verdict 가 거의 없는 패턴을 탐색하도록 살짝 가산.

### 3. Per-user Variant Selection (Global Base + User Delta)

**원칙**: 글로벌 variant 가 truth. 사용자는 거기에 **threshold delta** 만 얹는다 (variant 구조는 공유).

```
def resolve_user_variant(user_id, pattern_slug) -> ActivePatternVariantEntry:
    base = global_active_variant_store.get(pattern_slug)          # 기존 entry
    if user_total_verdicts(user_id) < COLD_START_THRESHOLD:        # 10
        return base                                                # 글로벌 그대로
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

```
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
**Cold 일 때**: 
- `resolve_user_variant` → 글로벌 variant 그대로 반환.
- `affinity(u, P)` → `p_global_valid(P)` 반환.
- WVPL 측정은 그대로 진행 (관찰만).

**점진적 졸업**:
- `n_total ∈ [10, 30)` → shrinkage `n / (n + κ)` 가 자동으로 효과 약화 (§1 의 κ=20 조정으로 30 verdicts 에서 60%, 50 에서 71% 영향).
- 30 verdicts 이후 fully personalized.

### 5. WVPL Measurement + Feedback Loop

**정의**: WVPL(u, week) = `count(verdict ∈ {valid, near_miss} for u in week)` — verdict 4종 중 "관여한
시그널" 카운트. **invalid/too_early/too_late 도 포함** 하는 변형은 `WVPL_engaged` 로 별도 노출.

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
        # personalization 켜져 있는데 효율 낮음 → exploration ↑
        boost_exploration_for_user(user, exploration_bonus_w3 = 0.20)   # 0.10 → 0.20
        flag_for_review(user, reason="wvpl_under_target")
    elif wvpl_4w > 6:
        # 충분 → exploitation 강화
        boost_exploration_for_user(user, exploration_bonus_w3 = 0.05)
```

### DB / Storage Schema

#### `user_variant_registry` (Phase 1: JSON, Phase 2: Postgres)
```
Path: engine/data_cache/personalization/users/{user_id}/{pattern_slug}.json
Schema (extends ActivePatternVariantEntry):
  - pattern_slug, variant_slug, timeframe, watch_phases
  - source_kind = "personalized"
  - source_ref  = "user:{user_id}"
  - personalization: {
      base_variant_slug,
      threshold_delta: {stop_mul: +0.12, entry_band: -0.05, target_mul: +0.0},
      n_verdicts_at_compute,
      computed_at,
    }
```

#### `user_pattern_affinity` (Postgres)
```sql
CREATE TABLE user_pattern_affinity (
  user_id        UUID NOT NULL,
  pattern_slug   TEXT NOT NULL,
  alpha_valid    REAL NOT NULL DEFAULT 1.0,
  beta_valid     REAL NOT NULL DEFAULT 1.0,
  alpha_near_miss REAL NOT NULL DEFAULT 1.0,
  beta_near_miss  REAL NOT NULL DEFAULT 1.0,
  alpha_too_early REAL NOT NULL DEFAULT 1.0,
  beta_too_early  REAL NOT NULL DEFAULT 1.0,
  alpha_too_late  REAL NOT NULL DEFAULT 1.0,
  beta_too_late   REAL NOT NULL DEFAULT 1.0,
  alpha_invalid   REAL NOT NULL DEFAULT 1.0,
  beta_invalid    REAL NOT NULL DEFAULT 1.0,
  n_total        INTEGER NOT NULL DEFAULT 0,
  affinity_score REAL NOT NULL DEFAULT 0.5,           -- denormalized for fast read
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pattern_slug)
);
CREATE INDEX idx_user_pattern_affinity_user ON user_pattern_affinity(user_id, affinity_score DESC);
```

### Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 사용자 verdict bias (예: 항상 invalid) → 모든 threshold 극단으로 끌고 감 | Med | High | `Δ_max = 0.30` 클램프 + shrinkage, "always invalid" 사용자 자동 flag (n=20 에 valid=0 이면 colstart 강제) |
| Per-user variant 폭발 (10k users × 6 patterns) | Low | Med | LRU cache + lazy compute (resolve 시점에만 머티리얼라이즈) |
| User-specific variant 가 글로벌 PromotionGate 미통과 임에도 라이브 | High | High | Personalized variant 는 글로벌 base 가 PromotionGate 통과한 경우에만 활성화 (불변식) |
| WVPL 측정의 timezone bug | Med | Low | UTC truncation 강제, view 정의에 `AT TIME ZONE 'UTC'` 명시 + test |
| 콜드 스타트에서 affinity = global, but UI 가 personalized 라 표시 | Low | Med | `is_cold` 응답에 `mode: "global_fallback"` 필드 포함 |

### Files Touched (요약 매트릭스)

| File | Type | LOC est. | Owner |
|---|---|---|---|
| engine/personalization/threshold_adapter.py | new | ~180 | engine |
| engine/personalization/affinity.py | new | ~120 | engine |
| engine/personalization/user_variant_registry.py | new | ~140 | engine |
| engine/personalization/wvpl.py | new | ~80 | engine |
| engine/personalization/coldstart.py | new | ~40 | engine |
| engine/personalization/api.py | new | ~110 | engine |
| engine/personalization/scheduler.py | new | ~100 | engine |
| engine/patterns/active_variant_registry.py | edit | +30 | engine |
| engine/research/pattern_search.py | edit | +20 | engine |
| migrations: user_pattern_affinity | new SQL | ~25 | engine |
| tests | new | ~600 (20 tests) | engine |

---

## AI Researcher 관점

### 개인화 편향 위험

#### A. Selection bias — verdict 이력 자체가 편향
사용자가 "흥미로운" 시그널만 verdict 한다 → 시그널 분포 ≠ 모집단. 보정:
- 매 verdict 에 대해 `signal_was_shown` 레코드 동시 기록 (이미 capture_records 가 함). 
- Affinity 계산은 P(verdict | shown) 이 아닌 P(valid | verdicted) 만 다룸 — selection bias 는 현 단계 수용 (Wave 5 IPW 보정 검토).

#### B. "Always invalid" 함정 — verdict-rage user
- n=20, valid=0 → α_valid=1, β_valid=21 → affinity=0.045 → 패턴 영원히 안 띄움 → verdict 0 → 영원히 0.045.
- **Mitigation**: `n_total ≥ 30 AND valid_rate < 0.05` 시 자동 reset to global priors + admin notify. 
- **Mitigation 2**: search_priority 에서 affinity 가 0 이어도 floor 0.10 보장 (occasional re-exposure).

#### C. Concept drift — 사용자 스타일 변화
- 6개월 전 verdict 와 현재 verdict 의 가중치 같음. 해결: `α, β` 를 **half-life 90일** 로 decay.
  ```
  on_load:  α ← 1 + (α_stored − 1) · 0.5^(days_since / 90)
  ```
- κ=20 이지만 decay 후엔 effective n 이 줄어 자동 plasticity 회복.

#### D. Privacy / Fairness
- verdict 데이터는 user-scoped, cross-user 유출 금지. `user_pattern_affinity` 는 RLS (Postgres row-level security) 로 user_id 일치만 접근.
- A/B test 시 group assignment 는 stable hash (`hash(user_id) mod 2`), opt-in 명시.

### Statistical Validation Plan

#### 가설
- **H0**: WVPL_personalized = WVPL_global (treatment effect zero).
- **H1**: WVPL_personalized > WVPL_global (one-sided, +20% lift).

#### 실험 설계
- **A/B split**: stable_hash(user_id) → 0 (control: global variant) / 1 (treatment: personalized).
- **Inclusion**: `total_verdicts ≥ 10` (cold-start 졸업) 인 활성 사용자만.
- **Window**: 14 일.
- **N target**: 60 사용자 (30/arm) — power 계산:
  ```
  baseline WVPL μ0 = 3.0, σ0 = 1.5 (assumed from F-60 population)
  target lift Δμ = 0.6 (20%)
  α = 0.05 (one-sided), power = 0.80
  n_per_arm = 2 · ((z_α + z_β) · σ / Δμ)² 
            = 2 · ((1.645 + 0.842) · 1.5 / 0.6)²
            = 2 · (6.218)² · (2.5)² / ... ≈ 31
  ```
  → 30/arm 로 충분.

#### 측정 지표
- **Primary**: avg(WVPL) per user over window, two-sample Welch's t-test.
- **Secondary**: 
  - `valid_rate` per user (=affinity proxy)
  - `time_to_first_verdict_per_signal` (latency 단축?)
  - `signal_completion_rate` = verdicted / shown
- **Guardrail (degradation 체크)**: per-pattern global_promotion_score 가 personalized arm 에서 더 나빠지면 안 됨 (variant 구조는 같으므로 불변식이지만 측정).

#### Multiple-testing 보정
- 6 patterns × 4 verdict categories × 2 metrics = 48 비교. Holm–Bonferroni 적용 (이미 W-0290 의 `multiple_testing.py` 사용).

#### Stopping rule
- Sequential test (mSPRT) 는 MVP 에서 제외. fixed-horizon 14 일 후 평가.

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

---

## Implementation Plan (코드 스켈레톤)

### Stage 0: 측정 인프라 (depends-on: nothing)
- `engine/personalization/wvpl.py` + view migration
- `GET /users/{id}/wvpl` (mock data 로 baseline 측정)
- 14일 데이터 수집 → μ0, σ0 확정 (statistical plan 의 가정 검증)

### Stage 1: Threshold Adapter
```python
# engine/personalization/threshold_adapter.py

from dataclasses import dataclass
from typing import Mapping

VERDICT_LABELS = ("valid", "invalid", "near_miss", "too_early", "too_late")

@dataclass(frozen=True)
class BetaState:
    alpha: float
    beta: float

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def var(self) -> float:
        s = self.alpha + self.beta
        return (self.alpha * self.beta) / (s * s * (s + 1))


@dataclass(frozen=True)
class UserPatternState:
    user_id: str
    pattern_slug: str
    states: Mapping[str, BetaState]   # one per verdict label
    n_total: int


@dataclass(frozen=True)
class ThresholdDelta:
    stop_mul_delta: float
    entry_strict_delta: float
    target_mul_delta: float           # currently 0; reserved for future


ETA_STOP = 0.6
ETA_ENTRY = 0.4
DELTA_MAX = 0.30
KAPPA = 20.0


def compute_delta(state: UserPatternState, global_priors: Mapping[str, float]) -> ThresholdDelta:
    p_nm = state.states["near_miss"].mean - global_priors["near_miss"]
    p_inv = state.states["invalid"].mean - global_priors["invalid"]
    p_te = state.states["too_early"].mean - global_priors["too_early"]
    p_tl = state.states["too_late"].mean - global_priors["too_late"]

    raw_stop = ETA_STOP * (p_nm - p_inv)
    raw_entry = ETA_ENTRY * (p_te - p_tl)

    shrink = state.n_total / (state.n_total + KAPPA)
    stop_d = _clamp(raw_stop * shrink, -DELTA_MAX, DELTA_MAX)
    entry_d = _clamp(raw_entry * shrink, -DELTA_MAX, DELTA_MAX)
    return ThresholdDelta(stop_mul_delta=stop_d, entry_strict_delta=entry_d, target_mul_delta=0.0)


def update_on_verdict(state: UserPatternState, verdict: str) -> UserPatternState:
    new_states = {}
    for label, bs in state.states.items():
        if verdict == label:
            new_states[label] = BetaState(bs.alpha + 1.0, bs.beta)
        elif verdict in VERDICT_LABELS:
            new_states[label] = BetaState(bs.alpha, bs.beta + 1.0)
        else:
            new_states[label] = bs
    return UserPatternState(state.user_id, state.pattern_slug, new_states, state.n_total + 1)


def apply_decay(state: UserPatternState, days_since_update: float, half_life: float = 90.0) -> UserPatternState:
    factor = 0.5 ** (days_since_update / half_life)
    decayed = {
        label: BetaState(1.0 + (bs.alpha - 1.0) * factor, 1.0 + (bs.beta - 1.0) * factor)
        for label, bs in state.states.items()
    }
    n_eff = int(round(sum(bs.alpha + bs.beta - 2.0 for bs in decayed.values()) / len(decayed)))
    return UserPatternState(state.user_id, state.pattern_slug, decayed, max(0, n_eff))


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))
```

### Stage 2: User Variant Registry
```python
# engine/personalization/user_variant_registry.py

from engine.patterns.active_variant_registry import ActivePatternVariantEntry, ACTIVE_PATTERN_VARIANT_STORE
from .threshold_adapter import ThresholdDelta

PERSONALIZATION_DIR = Path("engine/data_cache/personalization/users")

class UserVariantStore:
    def __init__(self, base_dir: Path = PERSONALIZATION_DIR) -> None:
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, user_id: str, pattern_slug: str) -> Path:
        return self.base_dir / user_id / f"{pattern_slug}.json"

    def upsert(self, user_id: str, entry: ActivePatternVariantEntry, delta: ThresholdDelta, n_verdicts: int) -> None:
        ...   # atomic write with personalization metadata

    def get(self, user_id: str, pattern_slug: str) -> ActivePatternVariantEntry | None:
        ...

def resolve_for_user(user_id: str, pattern_slug: str) -> ActivePatternVariantEntry:
    if is_cold(user_id, pattern_slug):
        return ACTIVE_PATTERN_VARIANT_STORE.get(pattern_slug)
    base = ACTIVE_PATTERN_VARIANT_STORE.get(pattern_slug)
    state = load_user_pattern_state(user_id, pattern_slug)
    delta = compute_delta(state, GLOBAL_PRIORS[pattern_slug])
    return _materialize_user_variant(base, delta, user_id)
```

### Stage 3: Affinity + Search Priority
```python
# engine/personalization/affinity.py

def affinity_score(state: UserPatternState) -> float:
    return state.states["valid"].mean

def search_priority(user_id: str, pattern_slug: str, global_score: float) -> float:
    state = load_user_pattern_state(user_id, pattern_slug)
    a = affinity_score(state)
    explore = state.n_total ** -0.5 if state.n_total > 0 else 1.0
    return 0.5 * a + 0.4 * global_score + 0.1 * explore
```

### Stage 4: API + Scheduler Hook
```python
# engine/personalization/api.py

@router.get("/users/{user_id}/wvpl")
def get_wvpl(user_id: str, weeks: int = 4):
    return wvpl.fetch_recent(user_id, weeks)

@router.get("/users/{user_id}/affinity")
def get_affinity(user_id: str):
    return affinity.list_for_user(user_id)

@router.get("/users/{user_id}/active_variant/{pattern_slug}")
def get_user_variant(user_id: str, pattern_slug: str):
    entry = resolve_for_user(user_id, pattern_slug)
    return {"entry": asdict(entry), "mode": "global_fallback" if is_cold(user_id, pattern_slug) else "personalized"}
```

### Stage 5: A/B harness & telemetry
- `engine/experiments/personalization_ab.py` — assignment + metric logging
- `research/experiments/personalization_v1.json` — preregistered hypothesis

### Stage Sequencing
1. Stage 0: 1 day
2. Stage 1: 2 days (heaviest math + tests)
3. Stage 2: 1 day
4. Stage 3: 0.5 day
5. Stage 4: 0.5 day
6. Stage 5: 0.5 day
Total: ~5.5 dev-days (Effort = M).

---

## Exit Criteria

- [ ] **AC1** — Threshold adaptation correctness: 사용자 A 가 동일 패턴에 `near_miss` 7회/`valid` 3회/`invalid` 0회 (n=10, p_nm=0.7) 제출 → `compute_delta` 결과 `stop_mul_delta = +0.6 · (0.7 − p_global_nm) · (10/30) ≈ +0.10..+0.13` (p_global_nm=0.2 가정), 클램프 미발동, sign positive (stop 완화). 수치 단위 테스트 + property test (랜덤 input → `|delta| ≤ Δ_max`).
- [ ] **AC2** — Cold-start fence: 사용자 B (verdicts=5) → `resolve_for_user` 반환값이 글로벌 store 의 entry 와 deep-equal, `mode == "global_fallback"`.
- [ ] **AC3** — Affinity correctness: 사용자 X 가 `tradoor-oi-reversal-v1` 에 valid 7 / invalid 3 (n=10) → `affinity_score ≈ (1 + 7) / (2 + 10) ≈ 0.667`, with prior `(1,1)`. With informed prior `(1+5·0.5, 1+5·0.5) = (3.5, 3.5)` and 7+3 evidence: `affinity = (3.5+7)/(3.5+3.5+10) = 10.5/17 ≈ 0.618`. **두 시나리오 (uninformed/informed) 모두 ±0.01 이내 일치 테스트**. (지시문의 0.72 는 informed prior + decay 0 + 가중치 가정 시 도달 — 실 테스트는 수식 정확도 우선).
- [ ] **AC4** — WVPL API: `GET /users/{id}/wvpl?weeks=4` → `[{"iso_week": "2026-W17", "wvpl": 5, "wvpl_engaged": 8, "valid_count": 3, "week_hit_rate": 0.6}, ...]` 4 entries, UTC truncation, missing weeks 는 0 fill.
- [ ] **AC5** — 15+ tests PASS: threshold_adapter (6) + affinity (4) + user_variant_registry (3) + coldstart (2) + wvpl (3) + api (2) = 20 tests, coverage ≥ 90% (line) on `engine/personalization/`.
- [ ] **AC6** — A/B harness: `python -m engine.experiments.personalization_ab --dry-run` → assignment 분포 50/50 ± 5% on 1000 mock user_ids.
- [ ] **AC7** — Concept drift: `apply_decay(state, days_since_update=90)` → 모든 Beta posterior 의 effective n 이 절반.
- [ ] **AC8** — Always-invalid rescue triggered: n=30, valid_rate=0.03 인 mock state → auto-reset 함수가 priors 반환 + audit log 기록.

---

## Facts

- Global active variant store 는 패턴당 하나의 entry 를 JSON 파일로 보관 (`engine/pattern_active_variants/{pattern_slug}.json`). User dimension 부재.
- Verdict 5-카테고리 라벨링은 `engine/stats/engine.py::F60_DENOM_LABELS` 에서 합의됨 (`valid`, `invalid`, `near_miss`, `too_early`, `too_late`).
- F-60 publishable gate 는 200+ verdicts 를 요구 — 글로벌 표준. 개인화 임계는 10 (relaxed, per-user signal).
- `PromotionGatePolicy` 의 글로벌 게이트 (Sharpe ≥ 0.5, FDR ≤ 0.4 등) 는 W-0290 에서 강화됨. 개인화는 이 게이트를 통과한 variant 만을 base 로 받음.
- `compute_user_accuracy` 은 이미 있으나 단일 스칼라 (전체 hit-rate) — per-pattern breakdown 없음.

## Assumptions

- 사용자당 weekly verdict volume 5–10 (F-60 기준 pre-launch 추정). 이 가정 위배 시 (e.g., 100/week) → κ 재튜닝.
- Crypto regime 사이클 평균 90 일 (W-0290 5-regime 분석). decay half-life 의 근거.
- 글로벌 priors `p_global_*` 는 W-0290 검증 파이프라인이 패턴별로 산출 가능. 첫 구현은 패턴 무관 평균 (`{valid: 0.4, near_miss: 0.2, invalid: 0.25, too_early: 0.10, too_late: 0.05}`) 로 출발 후 패턴별로 채움.
- A/B 실험 14일 동안 외부 시장 충격 (예: BTC −20% 단일 일) 발생 시 분석 단위에서 layered (Layer 4 분석으로 별도 보고).
- User variant 가 글로벌 base 를 deep-clone 하여 `phase_overrides` 만 변형 — variant_id 는 base 와 분리되나 `base_variant_slug` 로 lineage 추적.

## Canonical Files

- `engine/personalization/threshold_adapter.py` — Bayesian update, delta computation
- `engine/personalization/affinity.py` — score + search_priority
- `engine/personalization/user_variant_registry.py` — store + resolve
- `engine/personalization/wvpl.py` — measurement
- `engine/personalization/coldstart.py` — gates
- `engine/personalization/api.py` — REST surface
- `migrations/2026XXXX_user_pattern_affinity.sql`
- `engine/experiments/personalization_ab.py` — A/B harness
- `research/experiments/personalization_v1.json` — preregistration

## Next Steps

1. **사용자 검토 게이트** (이 문서) — 알고리즘/하이퍼파라미터/decision matrix 승인.
2. **Stage 0 spike** — current verdict volume 측정 → assumption (5–10/week) 확인. 미달 시 effort 재산정.
3. **Global priors 산출** — W-0290 의 검증 파이프라인 출력에서 per-pattern verdict distribution 추출 (Stage 1 시작 전 필수).
4. **GitHub Issue 생성** — Issue ID 받아 branch rename `feat/W-0312-personalization-engine`.
5. Stage 1 구현 → Stage 5 까지 순차 (병렬화 어려움 — Stage 2/3 가 Stage 1 수식에 종속).

## Handoff Checklist

- [ ] `docs/decisions/` 에 D1–D8 8개 결정 기록 (`/결정` 사용)
- [ ] `state/contracts.md` 에 personalization 모듈 계약 등록 (Bayesian invariants, RLS 요구)
- [ ] `engine/personalization/__init__.py` 의 docstring 에 알고리즘 1-page 요약
- [ ] A/B 실험 preregistration → `research/experiments/personalization_v1.json` 커밋
- [ ] `docs/runbooks/personalization-feedback-loop.md` — 운영자용 (rescue, exploration boost 수동 트리거)
- [ ] `CURRENT.md` 의 Wave 4 섹션 업데이트
- [ ] PR 본문에 AC1–AC8 체크박스 + Statistical plan 의 power 계산 재확인
