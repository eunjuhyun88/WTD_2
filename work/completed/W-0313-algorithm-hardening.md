# W-0313 — 핵심 알고리즘 강화 (LightGBM Layer C + Calibration + Block Weight Learning)

> Wave: 4 | Priority: P1 | Effort: L
> Charter: In-Scope L5 (Search) + L7 (AutoResearch)
> Status: 🟢 V-track Spec (implementation-ready)
> Created: 2026-04-29
> Issue: #645
> V-track upgrade: 2026-04-29

## Goal

검색 recall@10 ≥ 0.70 달성, LightGBM **Layer C 실제 활성화** (현재 미훈련 → `None`), ml_score **isotonic calibration** 적용, 블록 가중치 **verdict 결과 EWM 자동 학습**.

핵심 효과:
- 가중치 분포: 현재 A 0.60 / B 0.40 (Layer C 무력) → 목표 **A 0.45 / B 0.30 / C 0.25** 정상 활성화
- ml_contribution: raw LightGBM logit/proba → **isotonic-calibrated P(win)** (ECE < 0.05)
- 85개 블록 동일 취급 → **verdict 정합도 기반 가중치** (α=0.95 EWM)
- AutoResearch 게이트: Sharpe ≥ 0.1 → **Sharpe ≥ 0.3** (실전 임계값 상향)

## Owner

engine

## Scope

**핵심 변경 (실측 기준)**

| 파일 | 변경 |
|---|---|
| `engine/scoring/lightgbm_engine.py` | `train_with_calibration()` 추가 — `IsotonicRegression` wrap |
| `engine/scoring/calibration.py` (신규) | `IsotonicCalibrator` 클래스 + reliability diagram 유틸 |
| `engine/scoring/trainer_trigger.py` (신규) | verdict 50+ 자동 트리거, 폴링 + 디바운스 |
| `engine/scoring/feature_matrix.py` | `encode_verdict_outcomes()` — verdict ledger → (X, y) |
| `engine/scoring/ensemble.py` | `W_ML` 계산을 calibrated `p_win` 기준으로, regime feature leakage 제거 |
| `engine/scoring/block_weights.py` (신규) | EWM block weight 학습 + persisted store |
| `engine/scoring/block_evaluator.py` | block 평가 시 학습된 가중치 곱 |
| `engine/search/_signals.py` | `SIGNAL_WEIGHTS` 상단에 `LEARNED_WEIGHTS` 우선순위 |
| `engine/search/feature_importance.py` (신규) | LightGBM gain → Layer A weight 동기화 |
| `engine/search/similar.py` | `_layer_a` 옵션, learned weight 통합 |
| `engine/search/block_weight_learner.py` (신규) | 검색 측 EWM facade |
| `engine/research/autoresearch_loop.py` | `GATE_MIN_SHARPE: 0.1 → 0.3`, `PROMOTE_SHARPE: 0.5 → 0.7` |
| `engine/api/algorithm.py` (신규) | `/algorithm/calibration/report`, `/algorithm/block_weights` GET |
| `engine/tests/test_calibration.py` | ECE / Brier score 테스트 |
| `engine/tests/test_block_weight_learning.py` | EWM 수렴 테스트 |
| `engine/tests/test_layer_c_trigger.py` | 50 verdict 자동 학습 테스트 |
| `engine/tests/test_recall_at_k.py` | recall@10 회귀 가드 |

## Non-Goals

- 새 Layer D 추가 (graph/transformer-based) — W-0314+ 별도 트랙
- LightGBM → XGBoost / CatBoost 교체 — Decisions §M3 참조 (LightGBM 유지)
- Online learning (per-bar SGD) — Wave 5 이후
- 블록 자동 생성 (LLM이 새 블록 작성) — Charter §Frozen 위반, 별도 승인 필요
- Layer B 완전 재설계 (transformer sequence model) — 점진 개선만
- Production model A/B testing 인프라 — W-0317 데이터플랜 별도

## CTO 관점

### Sub-1: LightGBM Layer C 훈련 파이프라인 + Isotonic Calibration

#### 1.1 자동 훈련 트리거 (verdict 50+ 도달 시)

```python
# engine/scoring/trainer_trigger.py
from __future__ import annotations
import logging
import time
from typing import Optional
from ledger.store import LEDGER_RECORD_STORE
from scoring.lightgbm_engine import get_engine
from scoring.feature_matrix import encode_verdict_outcomes
from scoring.calibration import IsotonicCalibrator

log = logging.getLogger("engine.layer_c.trigger")

MIN_VERDICTS = 50
MIN_POSITIVE_RATE = 0.10  # 최소 5/50 = HIT, class imbalance 가드
RETRAIN_INTERVAL_SECONDS = 3600  # 1h debounce
RETRAIN_INTERVAL_HOURS = 24      # 24h hard retrain
DEBOUNCE_KEY_PREFIX = "layer_c_last_train"


def maybe_trigger_layer_c_training(
    pattern_slug: Optional[str] = None,
    *,
    user_id: Optional[str] = None,
    force: bool = False,
) -> Optional[dict]:
    """verdicts 50+ 도달하면 LightGBM 학습 + isotonic calibration.

    Debounce 규칙: verdicts % 10 == 0 AND NOT currently_training
                   AND last_train_at < now - 1h.

    Returns training report dict, or None if conditions unmet.
    """
    ...
```

**훈련 트리거 호출 지점**:
- `ledger/store.py::append_verdict()` 후 `verdict_count % 10 == 0` 시점에 background thread로 호출
- `tools/cycle-smoke.py` 끝에서도 명시적 호출 (CI에서 1회)

#### 1.2 Isotonic Calibration

LightGBM `predict_proba()` 출력은 leaf log-odds → sigmoid이지만 trade outcome 분포가 skewed → over-confident. **Isotonic regression**은 monotone 보정이라 분포 가정 없이 잘 작동한다 (Niculescu-Mizil & Caruana 2005).

```python
# engine/scoring/calibration.py
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss


class IsotonicCalibrator:
    """Monotone binning calibration for binary P(win).
    Theory: PAV algorithm O(n log n), Zadrozny & Elkan 2002.
    """

    def __init__(self, n_bins_for_ece: int = 10) -> None: ...
    def fit(self, raw_proba, y) -> "IsotonicCalibrator": ...
    def transform(self, raw_proba) -> np.ndarray | float: ...
    def ece(self) -> float: ...
    def reliability_diagram(self) -> dict: ...
    def save(self, path: Path) -> None: ...
    @classmethod
    def load(cls, path: Path) -> "IsotonicCalibrator": ...
```

`get_engine().predict_one()` → `predict_one_calibrated()` 신규 메서드: raw → `IsotonicCalibrator.transform()` 통과한 P(win)을 반환.

### Sub-2: Layer A — Feature Importance Weighting

#### 2.1 결정: weighted L1 (현행) → **weighted L1 with importance weights** (LightGBM gain 기반)

```
sim_A(x, y) = 1 - Σ_i w_i * |x_i - y_i| / (Σ_i w_i * (|x_i| + |y_i| + ε))
```

`w_i = 0.5 * w_static_i + 0.5 * w_learned_i`.

#### 2.2 Phase Order Penalty (Layer B) — Kendall-tau

```
sim_B = LCS(q, c) / max(|q|, |c|) - λ * inversions(q, c) / (|q| * (|q|-1) / 2)
```

`λ = 0.15`. Kendall-tau 분자 = inversion count.

### Sub-3: Block Weight Learning + AutoResearch Gate Strengthening

#### 3.1 EWM Block Weight Update

```
w_i(t+1) = α * w_i(t) + (1 - α) * outcome_t        (α=0.95)
outcome_t ∈ {+1 if verdict='valid' AND block_i fired,
             -1 if verdict='invalid' AND block_i fired,
              0  otherwise}
w_i_effective = clip(1 + β * w_i, 0.1, 2.0)        (β=0.5)
```

수렴: `E[w_i(∞)] = E[outcome | block_i fired]`. α=0.95 → effective N ≈ 20 verdicts.

#### 3.2 AutoResearch Gate 강화

| Gate | 현재 | 변경 후 | 근거 |
|---|---|---|---|
| `GATE_MIN_SHARPE` | 0.1 | **0.3** | Sharpe 0.1 = noise (Sharpe<0.5 deflated p>0.05 with n_trials=2000) |
| `PROMOTE_SHARPE` | 0.5 | **0.7** | 실전 평균 Sharpe 0.5–1.0 (2σ 마진) |
| `GATE_MIN_HIT_RATE` | 0.50 | 0.50 | 유지 (binomial test p<0.05 @ n=50) |
| `GATE_MIN_T_STAT` | 1.0 | 1.5 | 1-sided p<0.07 → align with Bonferroni |
| `GATE_MIN_SIGNALS` | 5 | 10 | Sharpe SE = 1/√n; n=10 → SE≈0.32 |

추가: **deflated Sharpe gate** → `sharpe_p < 0.05`. 모듈은 W-0290에 이미 존재.

---

## V-track Spec (implementation-ready)

### V1. Module Interface Contract — public API

#### V1.1 `engine/scoring/calibration.py`

```python
class IsotonicCalibrator:
    """
    Public API:
      fit(scores: np.ndarray, labels: np.ndarray) -> Self
      transform(scores: np.ndarray | float) -> np.ndarray | float
      ece() -> float                                  # current ECE on the held-out fit set
      reliability_diagram() -> dict                   # {'bins': [...], 'acc': [...], 'conf': [...], 'count': [...]}
      save(path: pathlib.Path) -> None                # pickle + JSON sidecar
      load(path) -> IsotonicCalibrator                # classmethod
      brier_before: float | None                      # set after fit()
      brier_after:  float | None
      ece_before:   float | None
      ece_after:    float | None

    Invariants:
      - len(scores) >= 30                             # else raise ValueError
      - scores ∈ [0, 1]                               # raw LightGBM proba
      - labels ∈ {0, 1}                               # binary
      - transform() before fit() → identity (graceful degradation)
      - IsotonicRegression(out_of_bounds='clip', y_min=0, y_max=1, increasing=True)
    """
```

#### V1.2 `engine/scoring/block_weights.py` + `engine/search/block_weight_learner.py`

```python
class BlockWeightLearner:
    """EWM block weight (search-facing facade over BlockWeightStore).

    Public API:
      update(block_name: str, outcome: float) -> None
          # outcome ∈ [-1, 1], single-block update
      update_from_verdict(verdict: str, blocks_triggered: Iterable[str],
                          all_blocks: Iterable[str]) -> None
          # batch update for entire universe
      get_weights() -> dict[str, float]                # block_name → effective weight ∈ [0.1, 2.0]
      get_raw(block_name: str) -> float                # raw EWM ∈ [-1, 1]
      reset(block_name: str) -> None                   # set raw=0, n_updates=0
      reset_all() -> None
      n_updates(block_name: str) -> int

    Invariants:
      - α=0.95 (steady), α=0.85 (warmup, n_updates < 100)
      - β=0.5, w_eff = clip(1 + β * raw, 0.1, 2.0)
      - DISQUALIFIER blocks → fixed weight 1.0 (not learned)
      - SQLite-backed; thread-safe via _lock + connection-per-call
    """
```

#### V1.3 `engine/scoring/trainer_trigger.py`

```python
@dataclass(frozen=True)
class TrainingResult:
    triggered: bool
    n_verdicts: int
    n_positive: int
    auc: float | None
    auc_replaced: bool
    ece_before: float | None
    ece_after: float | None
    brier_before: float | None
    brier_after: float | None
    skip_reason: str | None    # 'insufficient_verdicts' | 'class_imbalance' | 'debounce' | 'auc_regression' | None


class LayerCTrigger:
    """
    Public API:
      maybe_trigger(n_verdicts: int) -> bool
          # debounce + condition check WITHOUT actually training (cheap)
      train_layer_c(engine: LightGBMEngine,
                    records: list[LedgerRecord]) -> TrainingResult
          # synchronous train + calibrate (the Thread target wraps this)
      last_train_at(pattern_slug: str | None) -> datetime | None

    Invariants:
      - len(records) >= 50
      - n_positive / n >= 0.10
      - now() - last_train_at >= 1h
      - n_verdicts % 10 == 0
      - NOT currently_training (mutex)
    """
```

#### V1.4 `engine/search/feature_importance.py`

```python
def derive_layer_a_weights(min_gain_pct: float = 1.0) -> dict[str, float]:
    """LightGBM gain importance → Layer A weight per feature.
    Mixing rule: w_i = 0.5 * w_static_i + 0.5 * w_learned_i
    Cached: 1h TTL via _LEARNED_CACHE.
    """

def get_active_weights() -> dict[str, float]:
    """Process-cached active weight dict (1h TTL)."""
```

#### V1.5 `engine/search/similar.py` — `RecallEvaluator`

```python
class RecallEvaluator:
    """
    Public API:
      compute_recall_at_k(queries: list[Query], k: int = 10) -> float
      compute_recall_at_k_bootstrap(queries, k=10, n_iter=100,
                                    seed=42) -> tuple[float, float, float]
          # (mean, ci_low, ci_high) at 95% CI
      regression_guard(baseline: float,
                       margin: float = 0.05) -> bool
          # True if current recall >= baseline + margin
    """
```

#### V1.6 `engine/api/algorithm.py`

```python
GET /algorithm/calibration/report
    -> {
         "trained": bool,
         "auc": float | null,
         "ece_before": float | null, "ece_after": float | null,
         "brier_before": float | null, "brier_after": float | null,
         "n_train": int, "n_calibration": int,
         "last_trained_at": ISO8601 | null,
       }

GET /algorithm/block_weights
    -> { block_name: effective_weight, ... }
       # all 85 blocks; never-fired → 1.0
```

### V2. Data Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                       VERDICT INGEST FLOW                           │
└─────────────────────────────────────────────────────────────────────┘

    User verdict (UI)
        │
        ▼
  ledger.store.append_verdict()
        │
        ├──► LEDGER_RECORD_STORE  (Supabase + file fallback)
        │
        ├──► BlockWeightLearner.update_from_verdict()
        │         │
        │         ▼
        │    block_weights.sqlite  (raw, n_updates per block)
        │         │
        │         ▼
        │    SIGNAL_WEIGHTS overlay (process cache, 1h TTL)
        │         │
        │         ▼
        │    similar.SimilaritySearch._layer_a()  ── Recall@10 ↑
        │
        └──► LayerCTrigger.maybe_trigger(n_verdicts)
                  │
                  │ (verdicts % 10 == 0 AND
                  │  n_verdicts >= 50 AND
                  │  positive_rate >= 0.10 AND
                  │  last_train_at < now - 1h AND
                  │  NOT currently_training)
                  │
                  ▼
              Thread(target=train_layer_c, daemon=True)
                  │
                  ▼
   ┌────────────────────────────────────────────────────────┐
   │           LAYER C TRAINING PIPELINE                    │
   │                                                        │
   │  raw verdicts                                          │
   │      │                                                 │
   │      ▼                                                 │
   │  feature_matrix.encode_verdict_outcomes()              │
   │      │ (capture_ts-frozen features; no leakage)       │
   │      ▼                                                 │
   │  X (n × 40+), y (n,) ∈ {0,1}                           │
   │      │                                                 │
   │      ▼                                                 │
   │  LightGBMEngine.train(X, y, n_splits=5)                │
   │      │ (is_unbalance=True, early_stopping=20)          │
   │      ▼                                                 │
   │  AUC_new vs AUC_incumbent − 0.02                       │
   │      │                                                 │
   │      ├── replaced=False ──► persist nothing, return   │
   │      │                                                 │
   │      └── replaced=True ──► last fold = held-out       │
   │              │                                         │
   │              ▼                                         │
   │        engine.predict_batch(X[val_idx]) → raw_proba    │
   │              │                                         │
   │              ▼                                         │
   │        IsotonicCalibrator.fit(raw_proba, y[val_idx])  │
   │              │                                         │
   │              ▼                                         │
   │        ECE_after vs ECE_before, Brier_after vs Brier_before│
   │              │                                         │
   │              ▼                                         │
   │        calibrator.save(engine.calibrator_path())       │
   │              │                                         │
   │              ▼                                         │
   │        engine._calibrator = loaded                     │
   │              │                                         │
   │              ▼                                         │
   │        predict_one_calibrated() returns calibrated p   │
   └────────────────────────────────────────────────────────┘
                  │
                  ▼
        ensemble.compute_ensemble(p_win=calibrated)
                  │
                  ▼
           Final score → broadcast/HUD/AutoResearch
```

### V3. Test Matrix — 명시 함수명 (≥20)

#### `engine/tests/test_layer_c_trigger.py`

```
test_50_verdicts_triggers_train
test_49_verdicts_no_trigger
test_imbalanced_class_skips_train          # n_pos/n < 0.10
test_debounce_within_1h_no_trigger
test_layer_c_none_before_training          # predict_one returns None
test_predict_one_calibrated_after_train
test_concurrent_trigger_blocked            # mutex
test_train_failure_preserves_incumbent     # AUC regression
test_force_flag_overrides_debounce
```

#### `engine/tests/test_calibration.py`

```
test_isotonic_reduces_ece
test_ece_below_threshold                    # ECE_after < 0.05 on synthetic
test_brier_not_worse                        # Brier_after <= Brier_before
test_calibrator_save_load_roundtrip
test_calibrator_identity_before_fit
test_calibrator_clip_out_of_bounds
test_reliability_diagram_shape
test_min_30_samples_required                # raises ValueError
test_monotone_increasing_invariant
```

#### `engine/tests/test_block_weight_learning.py`

```
test_ewm_converges_on_synthetic             # AC4: funding_extreme → [1.4, 1.6]
test_ewm_decay_alpha_095                    # effective N ≈ 20
test_ewm_warmup_alpha_085                   # first 100 updates faster init
test_block_weight_normalization             # Σ |w_eff − 1| bounded
test_disqualifier_blocks_unchanged          # fixed weight 1.0
test_concurrent_updates_threadsafe          # 1000 threads, no deadlock
test_persistence_across_restart             # SQLite roundtrip
test_reset_clears_history
test_outcome_zero_for_unfired_blocks
test_negative_outcome_decay                 # invalid verdict path
```

#### `engine/tests/test_recall_at_k.py`

```
test_recall_at_10_meets_target              # AC3: ≥ 0.70
test_recall_regression_guard                # baseline + 0.05
test_recall_bootstrap_ci_95
test_kendall_tau_penalty_positive           # inversion → lower sim_B
test_kendall_tau_lambda_015                 # exact coefficient
test_layer_a_learned_weights_applied
test_static_prior_fallback_when_untrained
```

#### `engine/tests/test_autoresearch_gates.py`

```
test_gate_sharpe_threshold_03
test_gate_sharpe_below_03_rejected
test_promote_sharpe_threshold_07
test_gate_min_signals_10
test_deflated_sharpe_gate_p_under_005
test_loose_gate_env_var_escape_hatch
```

#### `engine/tests/test_algorithm_api.py`

```
test_calibration_api_endpoint               # GET /algorithm/calibration/report
test_calibration_api_untrained              # trained=False
test_block_weights_api_endpoint             # GET /algorithm/block_weights
test_block_weights_api_default_one          # never-fired → 1.0
test_api_400_invalid_pattern_slug
```

**총: 41 새 테스트 (AC5: 20+ 충족, +21 buffer).**

### V4. Statistical Protocol

#### V4.1 recall@10 평가

- **Eval set**: `engine/tests/fixtures/recall_eval.json` — 50 query × top-10 ground truth (수기 큐레이션 + verdict-aligned).
- **Bootstrap**: 100 iterations, sample-with-replacement on 50 queries, compute recall@10 per resample.
- **CI**: 95% (percentile method, 2.5%–97.5%).
- **Regression guard**: PR가 `recall_lower_bound (5th pctl) ≥ baseline + 0.05` 충족하지 않으면 fail.
- **Baseline 기록**: 첫 PR merge 시 main branch recall@10 측정값 → `engine/tests/fixtures/recall_baseline.json` commit.

#### V4.2 ECE 평가

- **Held-out fold**: 5-fold CV의 마지막 fold (chronologically latest).
- **n_bins = 10**, equal-width on [0, 1].
- **Pass criteria**: `ECE_after < 0.05` AND `ECE_after < ECE_before * 0.7` (30%+ improvement).
- **Brier guard**: `Brier_after ≤ Brier_before` (Murphy decomp: reliability ↓ without resolution ↓).
- **Re-test 주기**: 매 trigger마다 측정, drift 모니터링 (V7).

#### V4.3 EWM 수렴 (synthetic AC4)

- 100 verdicts 생성: `funding_extreme` valid에서 100% fire, invalid에서 10% fire.
- 다른 블록은 50/50 fire.
- Pass: `w_eff(funding_extreme) ∈ [1.4, 1.6]` (E[outcome|fired] ≈ +1 → raw → +1 → w_eff = 1.5).
- Pass: `w_eff(volume_spike) ∈ [0.95, 1.05]` (neutral).

#### V4.4 deflated Sharpe

- `n_trials = len(scan_df)` 입력 → `deflated_sharpe_ratio()` 호출.
- Gate: `sharpe_deflated ≥ 0.0 AND p_value_deflated < 0.05`.

### V5. Failure Mode Tree

```
W-0313 RUNTIME FAILURE TREE
│
├── F1: < 50 verdicts available
│       Symptom: trigger.maybe_trigger() returns False indefinitely
│       Detection: layer_c_trained==False after 7d in production
│       Mitigation:
│           - Guard already in place (MIN_VERDICTS check)
│           - Cold-start: synthetic seed verdicts NOT used (data integrity)
│           - Monitor metric: verdicts_per_day → alert if < 5/day
│
├── F2: AUC regression (new < incumbent − 0.02)
│       Symptom: train returns auc_replaced=False
│       Detection: TrainingResult.skip_reason == 'auc_regression'
│       Mitigation:
│           - Engine retains incumbent (no replacement)
│           - Calibrator NOT updated (stale incumbent calibration kept)
│           - Manual override: force=True (ops only)
│           - Long-term: investigate feature drift (W-0317)
│
├── F3: Calibration divergence (ECE_after > ECE_before)
│       Symptom: Brier_after > Brier_before OR ECE worsened
│       Detection: TrainingResult.ece_after > ece_before
│       Mitigation:
│           - Reject calibrator update; keep incumbent
│           - Fall back to Platt scaling if isotonic monotone violations
│           - Log: 'calibration_diverged' event
│
├── F4: EWM overflow / NaN
│       Symptom: w_raw outside [-1, 1]; w_eff outside [0.1, 2.0]
│       Detection: clip-and-log on every read
│       Mitigation:
│           - Hard clip in BlockWeightLearner.get_weights()
│           - SQLite NUMERIC(10, 6) precision; no float overflow
│           - reset(block_name) admin endpoint
│
├── F5: Sharpe gate false negative (cold start)
│       Symptom: 0.3 threshold rejects all candidates → no promotions
│       Detection: cycle_smoke promoted=0 for >3 consecutive runs
│       Mitigation:
│           - Env var WTD_GATE_MIN_SHARPE escape hatch
│           - Loose mode: WTD_LOOSE_GATE=true → revert to 0.1
│           - Log: 'gate_zero_promotions' alert
│
├── F6: API timeout (> 5s)
│       Symptom: /algorithm/calibration/report 5xx or hang
│       Detection: prometheus-style latency histogram p99
│       Mitigation:
│           - Cache calibrator metadata (no pickle load on every request)
│           - Read JSON sidecar instead of pickling
│           - Timeout ceiling: 2s, return {'trained': False, 'reason': 'timeout'}
│
├── F7: SQLite corruption / lock contention
│       Symptom: 'database is locked' OperationalError on update
│       Detection: try/except in update_from_verdict
│       Mitigation:
│           - WAL mode: PRAGMA journal_mode=WAL on init
│           - Retry-with-backoff (3 attempts, 100ms)
│           - Daily backup: cron snapshot
│
├── F8: Feature leakage (regime field at verdict_ts not capture_ts)
│       Symptom: train AUC suspiciously high (>0.85)
│       Detection: feature_matrix unit test asserts capture_ts == regime_snapshot_ts
│       Mitigation:
│           - encode_verdict_outcomes() asserts ts equality
│           - CI test: test_no_feature_leakage
│
└── F9: Mutex deadlock (concurrent triggers)
        Symptom: train hung indefinitely
        Detection: timeout in test_concurrent_trigger_blocked
        Mitigation:
            - threading.Lock with 60s timeout
            - currently_training flag in SQLite (not in-process) for multi-worker
            - Watchdog: clear stale lock if last_heartbeat > 5min
```

### V6. Rollout Plan

**Stage 1 — Shadow Calibration (Day 5–7)**
- `predict_one_calibrated()` 추가, 그러나 ensemble은 raw `predict_one()` 사용 유지.
- 양쪽 다 로그 (`p_raw`, `p_calibrated`).
- 1주일간 production verdict 누적 → ECE_calibrated vs ECE_raw 비교.
- Pass: `ECE_calibrated < ECE_raw - 0.02` AND no Brier regression → Stage 2.

**Stage 2 — Canary A/B (Day 7–10)**
- 50% 트래픽 (user_id hash mod 2): calibrated, 나머지 raw.
- Metric: alarm_clickthrough_rate, valid_verdict_ratio, false_positive_rate.
- Pass: calibrated 그룹 false_positive_rate ≤ raw 그룹 (no regression) → Stage 3.

**Stage 3 — Full Rollout (Day 10+)**
- 100% calibrated.
- Block weight learning ON (was already on by Day 5).
- AutoResearch gate 0.3 ON.

**Rollback triggers**:
- ECE drift > 0.1 in any 24h window → auto-rollback to incumbent calibrator.
- block_weight_entropy < 0.5 (collapse) → revert to static SIGNAL_WEIGHTS.
- gate_reject_rate > 95% for 7d → loosen gate to 0.2.

### V7. Monitoring (production metrics)

| Metric | Type | Source | Alert |
|---|---|---|---|
| `layer_c_trained` | gauge (0/1) | engine.is_trained | =0 for 7d → P1 |
| `layer_c_last_train_at` | timestamp | trigger.last_train_at | > 30d → P2 |
| `layer_c_auc` | gauge | engine.auc | drop > 0.05 in 7d → P1 |
| `ece_current` | gauge | calibrator.ece_after | > 0.10 → P1 |
| `brier_current` | gauge | calibrator.brier_after | regression > 10% → P2 |
| `recall_at_10` | gauge | RecallEvaluator (daily cron) | < 0.65 → P1 |
| `block_weight_entropy` | gauge | -Σ p_i log p_i over weights | < 0.5 → P2 (collapse) |
| `block_weight_n_updates_p50` | gauge | median over 85 blocks | < 10 after 30d → P2 |
| `sharpe_gate_reject_rate` | counter | autoresearch_loop | > 95% in 7d → P1 |
| `calibration_divergence_events` | counter | trigger logs | > 3 in 24h → P1 |
| `verdicts_per_day` | counter | ledger.append_verdict | < 5 → P3 (data starvation) |
| `trigger_skip_reasons` | histogram | TrainingResult.skip_reason | dominant 'class_imbalance' → P2 |
| `api_calibration_p99_latency_ms` | histogram | algorithm.py middleware | > 2000ms → P1 |

Dashboard: `engine/observability/dashboards/algorithm.json` (신규, optional).

### V8. Training Pipeline (ASCII)

```
                       LAYER C TRAINING PIPELINE
                       (engine/scoring/trainer_trigger.py)

   ┌──────────────────────────────────────────────────────────────┐
   │ INPUT: LEDGER_RECORD_STORE.list(record_type='verdict')       │
   └──────────────────────────────────────────────────────────────┘
                              │
                              ▼
            filter user_verdict ∈ {'valid', 'invalid'}
                              │
                              ▼
              ┌───────────────────────────────┐
              │ Guard: n >= 50                │── False ──► return None (skip)
              │ Guard: n_pos/n >= 0.10        │── False ──► return None (skip)
              │ Guard: now - last > 1h        │── False ──► return None (skip)
              │ Guard: NOT currently_training │── False ──► return None (skip)
              └───────────────────────────────┘
                              │ True
                              ▼
            encode_verdict_outcomes(verdicts)
                              │
                              ▼
                X (n, 40+), y (n,) ∈ {0, 1}
                              │
                              ▼
               assert capture_ts == regime_ts (no leakage)
                              │
                              ▼
            ┌──────────────────────────────────┐
            │ LightGBMEngine.train(             │
            │   X, y, n_splits=5,               │
            │   is_unbalance=True,              │
            │   early_stopping_rounds=20)       │
            └──────────────────────────────────┘
                              │
                              ▼
                AUC_new computed via 5-fold CV
                              │
                              ▼
              ┌───────────────────────────────┐
              │ AUC_new > AUC_incumbent - 0.02│── False ──► incumbent kept
              └───────────────────────────────┘             return TrainingResult(replaced=False)
                              │ True
                              ▼
            engine._model = new_model (replace incumbent)
                              │
                              ▼
              X[val_idx] = last fold (chronologically latest)
                              │
                              ▼
            raw_proba = engine.predict_batch(X[val_idx])
                              │
                              ▼
        ┌────────────────────────────────────────────┐
        │ IsotonicCalibrator()                       │
        │   .fit(raw_proba, y[val_idx])              │
        │   - PAV algorithm, O(n log n)              │
        │   - increasing=True, clip out_of_bounds    │
        │   - compute ECE_before/after, Brier_b/a    │
        └────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │ ECE_after < ECE_before        │── False ──► reject calibrator
              │ AND Brier_after <= Brier_before│           keep incumbent
              └───────────────────────────────┘            log 'calibration_diverged'
                              │ True
                              ▼
            calibrator.save(engine.calibrator_path())
                              │
                              ▼
            engine._calibrator = calibrator (in-process)
                              │
                              ▼
            persist_debounce(pattern_slug)
                              │
                              ▼
   ┌──────────────────────────────────────────────────────────────┐
   │ OUTPUT: TrainingResult(triggered=True, auc, ece_after, ...)  │
   └──────────────────────────────────────────────────────────────┘
```

### V9. Debounce Logic

```python
def _should_trigger(n_verdicts: int, pattern_slug: str | None) -> tuple[bool, str | None]:
    """Returns (should_trigger, skip_reason)."""
    # 1. Verdict count multiple of 10 (rate-limit poll)
    if n_verdicts % 10 != 0:
        return False, 'not_multiple_of_10'

    # 2. Minimum threshold
    if n_verdicts < MIN_VERDICTS:
        return False, 'insufficient_verdicts'

    # 3. Currently training (mutex)
    if _is_training_active(pattern_slug):
        return False, 'concurrent_training'

    # 4. Time-based debounce
    last = _last_train_at(pattern_slug)
    if last is not None:
        elapsed = time.time() - last.timestamp()
        if elapsed < RETRAIN_INTERVAL_SECONDS:        # 1 hour
            return False, 'debounce'

    # 5. Force retrain interval (24h hard refresh)
    # If last train > 24h ago, always retrain (regardless of % 10 logic)
    # Handled by separate scheduled cron, not here.

    return True, None
```

**Mutex implementation**:
- In-process: `threading.Lock` (single-worker dev).
- Cross-worker: SQLite advisory lock row `(pattern_slug, locked_at, ttl_at)` with 5min TTL.

**Force flag behavior**:
- `force=True` skips debounce + class_imbalance check, BUT still requires `n_verdicts >= 50`.

### V10. Risk Matrix (V-track refined)

| 리스크 | 확률 | 영향 | 완화 | Failure Mode |
|---|---|---|---|---|
| 50 verdict 한 클래스 편향 | 중 | 중 (학습 실패) | `MIN_POSITIVE_RATE=0.10` 가드 + class_weight='balanced' | F1 |
| LightGBM gain importance 50샘플 노이즈 | 중 | 중 (recall ↓) | static prior 0.5 mixing + 100 verdict 후 비율 ↑ | F2 |
| EWM α=0.95 → 초기 50 verdict raw=0 | 고 | 저 | warmup α=0.85 (n_updates < 100) | F4 |
| Layer C calibration train fold overfit | 중 | 고 (live ECE > 0.1) | last fold held-out + ECE retest on next 20 | F3 |
| `block_weights.sqlite` 와 모델 불일치 | 저 | 중 | `_init_db` 시 `_BLOCK_CATEGORIES` keys auto-seed | F4 |
| AutoResearch gate 0.1→0.3 cold start | 고 | 저 | env var `WTD_LOOSE_GATE=true` escape hatch | F5 |
| Isotonic monotone violation | 저 | 저 | `IsotonicRegression(increasing=True)` 강제 | F3 |
| API 5xx/timeout | 저 | 중 | JSON sidecar fast path + 2s timeout | F6 |
| SQLite lock contention | 중 | 중 | WAL mode + retry-backoff | F7 |
| Feature leakage (regime ts) | 저 | 고 | `encode_verdict_outcomes` assertion + CI test | F8 |

## AI Researcher 관점

### Layer C 훈련 데이터 요구사항

**Class imbalance**: 실측 verdict 분포 추정 — `valid:invalid ≈ 1:3`. LightGBM `is_unbalance=True` (auto `scale_pos_weight = N_neg / N_pos`).

수식:
```
w_pos = N / (2 * N_pos),   w_neg = N / (2 * N_neg)
```

**Feature leakage 가드**: verdict 시점 feature_snapshot은 capture_ts 기준 frozen → ✅ 안전. `regime` macro feature 도 capture_ts 기준 추출 강제 (V8 pipeline assertion).

### Calibration 검증 — Reliability Diagram + ECE

**Reliability diagram**: x=mean predicted prob in bin, y=empirical accuracy. 완벽 calibrated → y=x line.

**ECE** (Guo et al. 2017):
```
ECE = Σ_b (|B_b| / N) · |acc(B_b) - conf(B_b)|
```

**MCE** — worst-case bin:
```
MCE = max_b |acc(B_b) - conf(B_b)|
```

**Brier score**:
```
Brier = (1/N) Σ_i (p_i - y_i)^2
```

Brier decomposition (Murphy 1973):
```
Brier = reliability - resolution + uncertainty
```

→ Calibration이 reliability 항만 줄임. **AUC 유지하면서 Brier ↓** = calibration 성공.

**AC2 측정**: held-out test set에서 `ECE_after - ECE_before` 비교. 임계값 `ECE_after < 0.05` AND `Brier_after ≤ Brier_before`.

### Block Weight Learning 편향

1. **Trigger 블록 over-fire** (예: `volume_spike` 매 4–10 bar) → outcome=0 누적. **완화**: asymmetric update (fired 케이스만 강하게 학습, α'=0.99 for outcome=0).

2. **Disqualifier 블록은 valid에서 거의 안 fire** → raw → -1 위험. **완화**: `BlockCategory.DISQUALIFIER`는 learning 제외 (V1.2 invariant).

3. **Survivorship bias**: `valid` verdict는 알람 본 capture에 한해 발생. → 본 분포 vs 실분포 gap은 W-0314 (capture coverage)에서 처리.

**검증**: Synthetic generator (`tests/fixtures/synthetic_verdicts.py`) — `funding_extreme` valid 100%, invalid 10%. 100 verdict 후 `w_eff(funding_extreme) ∈ [1.4, 1.6]` (AC4).

### Deflated Sharpe Penalty

`research/validation/deflated_sharpe.py::deflated_sharpe_ratio(observed_sr, n_trials, skew, kurt)` 호출. AutoResearch gate에서 `n_trials = len(scan_df)`. Bonferroni-equivalent.

## Decisions

### M1: LightGBM vs XGBoost vs CatBoost

| Axis | LightGBM | XGBoost | CatBoost |
|---|---|---|---|
| Train speed (50 samples) | 1× | 1.3× | 2.5× |
| Categorical handling | label encode | label/one-hot | native |
| Calibration ease | sigmoid leaf | sigmoid leaf | softmax (다중 헤드) |
| sklearn API | ✅ | ✅ | ✅ |
| In-tree (현 코드) | ✅ | ❌ | ❌ |

**Decision: LightGBM 유지**. 카테고리 적음 (4개) → CatBoost 이점 없음.

### M2: Isotonic vs Platt Scaling

| Axis | Isotonic | Platt (sigmoid) |
|---|---|---|
| 분포 가정 | 없음 (non-parametric) | logistic 가정 |
| 데이터 요구량 | ≥30 권장 | ≥10도 가능 |
| Overfit 위험 | 중 (n<200) | 저 |
| Monotone violations | piecewise step | smooth |
| LightGBM과 궁합 | ✅ | ⚠️ (logit 가정) |

**Decision: Isotonic 채택** (n<30 corner: Platt fallback in `_platt_fallback`).

### M3: Mahalanobis vs Weighted L1

§Sub-2.1. **Decision: Weighted L1 + learned importance**. Mahalanobis cov inversion 불안정 + non-stationary.

### M4: EWM α 값

| α | Effective N | 적응 속도 | 노이즈 흡수 |
|---|---|---|---|
| 0.99 | 100 | 매우 느림 | 매우 강함 |
| 0.95 | 20 | 적당 | 강함 |
| 0.90 | 10 | 빠름 | 중간 |
| 0.80 | 5 | 매우 빠름 | 약함 |

**Decision: α=0.95 정상, α=0.85 warmup (n_updates<100)**.

### M5: Block weight gain β

`w_eff = clip(1 + β * raw, 0.1, 2.0)`, **β=0.5**. β=1.0이면 [0, 2] 양극화 → 작은 샘플 블록 0으로 죽음.

### M6: Recall@10 baseline 측정 시점

**Decision**: 첫 PR 머지 후 main branch에서 `RecallEvaluator.compute_recall_at_k_bootstrap(n_iter=100)` 1회 실행 → `engine/tests/fixtures/recall_baseline.json` 별도 PR로 commit. 이후 모든 PR은 baseline + 0.05 마진 검사.

## Open Questions

- **Q1**: verdict ledger의 `feature_snapshot` 가 capture_ts 기준 frozen인지 spot check 필요 (Phase 1 Step 1).
- **Q2**: `LEDGER_RECORD_STORE.list()` multi-user 통합 여부 — 분산 ledger인지 확인.
- **Q3**: 50-query recall fixture 큐레이션 책임자 (Domain expert review 필요).
- **Q4**: production 첫 trigger 타이밍 (verdict 누적 속도 의존).

## Exit Criteria

- [ ] **AC1**: verdicts 50개 → `maybe_trigger_layer_c_training()` 자동 실행 → `engine.is_trained == True` → `_layer_c(snap) is not None`. 테스트: `test_layer_c_trigger.py::test_50_verdicts_triggers_train`.
- [ ] **AC2**: Held-out test set에서 `ECE_after < 0.05` AND `Brier_after ≤ Brier_before`. 테스트: `test_calibration.py::test_isotonic_reduces_ece` + `test_ece_below_threshold` + `test_brier_not_worse`.
- [ ] **AC3**: 50-query eval set에서 `recall@10 ≥ 0.70` (baseline + 0.05 regression guard). 테스트: `test_recall_at_k.py::test_recall_at_10_meets_target` + `test_recall_regression_guard`. Bootstrap CI 95%, n_iter=100.
- [ ] **AC4**: synthetic 100 verdicts (`funding_extreme` valid:100%, invalid:10%) → `w_eff(funding_extreme) ∈ [1.4, 1.6]`. 테스트: `test_block_weight_learning.py::test_ewm_converges_on_synthetic`.
- [ ] **AC5**: 새 테스트 20+ 추가 PASS (V3 매트릭스 41 tests), 기존 테스트 0 regression.
- [ ] **AC6**: `GATE_MIN_SHARPE` 0.3 적용 후 `cycle_smoke` 가 promoted ≥ 1 OR reasoned reject (cold-start guard via env var).
- [ ] **AC7**: `/algorithm/calibration/report` 200 OK (trained=True 후), `/algorithm/block_weights` 200 OK with 85 blocks. 테스트: `test_algorithm_api.py`.
- [ ] **AC8**: Production monitoring metrics (V7) 등록 — `layer_c_trained`, `ece_current`, `recall_at_10`, `block_weight_entropy`, `sharpe_gate_reject_rate` 모두 dashboard 표시 + alert wired.
- [ ] CI green (engine pytest + ruff).

## Facts

- 현 `LightGBMEngine.predict_proba()` 기반 — calibration 없이는 over-confident 일 가능성 (small-sample LightGBM 일반적 문제).
- `engine/scoring/lightgbm_engine.py` `MIN_TRAIN_RECORDS = 20`, `_AUC_REGRESSION_TOLERANCE = 0.02` — 본 W-0313은 50으로 상향.
- `engine/scoring/ensemble.py` `W_ML=0.50, W_BLOCK=0.35, W_REGIME=0.15`, `THRESHOLD_STRONG=0.65`, `THRESHOLD_SIGNAL=0.55` — block weight 학습은 `W_BLOCK` 내부 분배에만 영향.
- `engine/autoresearch_ml.py` `GATE_MIN_SHARPE = 0.1` — 0.3으로 상향.
- `engine/search/_signals.py` `SIGNAL_WEIGHTS = {"block_a": 0.60, "block_b": 0.40}` 정적 → EWM 동적.
- `engine/search/quality_ledger.py` `_DEFAULT_WEIGHTS = {"a": 0.45, "b": 0.30, "c": 0.25}` — 이미 목표값 (Layer C 미훈련으로 effective C=0).
- `ledger/types.py` `LedgerRecordType.verdict`, `user_verdict ∈ {valid, invalid, near_miss, too_early, too_late}` — 학습은 `valid` vs `invalid` binary 압축.

## Assumptions

- verdict 50개 도달 시점에 ledger에 `feature_snapshot` 또는 `capture_id`가 함께 기록 (검증 필요 — Q1).
- verdict 단일 user/hybrid scheduler에서 통합 기록 (Q2).
- LightGBM `feature_importance(gain)` 50 sample unstable, 100 sample stable (Hou et al. 2014, gain importance variance ∝ 1/√n).
- Block coverage imbalanced (예: `volume_spike` 80%+ 케이스 fire) — synthetic test 검증.

## Canonical Files

- `engine/search/similar.py` — Layer A/B/C blending
- `engine/search/_signals.py` — `SIGNAL_WEIGHTS` SSOT
- `engine/search/quality_ledger.py` — verdict 기반 layer 가중치
- `engine/scoring/lightgbm_engine.py` — Layer C engine
- `engine/scoring/ensemble.py` — block ensemble
- `engine/scoring/block_evaluator.py` — block firing logic
- `engine/research/autoresearch_loop.py` — gate thresholds
- `engine/ledger/types.py` — `LedgerRecordType` (verdict)
- `engine/ledger/store.py` — `LEDGER_RECORD_STORE` factory
- `engine/research/validation/deflated_sharpe.py` (W-0290) — n_trials adjustment

## Implementation Plan

### Phase 1: Calibration + Layer C trigger (Day 1–2)

1. `engine/scoring/calibration.py` — `IsotonicCalibrator` + ECE/Brier utils.
2. `engine/scoring/lightgbm_engine.py` 확장 — `calibrator_path()`, `predict_one_calibrated()`, `train_with_calibration()`.
3. `engine/scoring/trainer_trigger.py` — `LayerCTrigger`, debounce, mutex.
4. `engine/ledger/store.py::append_verdict()` hook — `verdict_count % 10 == 0` 시 background thread.
5. Unit tests: `test_calibration.py` (9), `test_layer_c_trigger.py` (9).

### Phase 2: Block weight learning (Day 2–3)

1. `engine/scoring/block_weights.py` — `BlockWeightStore` (SQLite + WAL).
2. `engine/search/block_weight_learner.py` — search-facing facade.
3. `engine/scoring/ensemble.py::_compute_block_score` — learned weight 통합.
4. `engine/ledger/store.py::append_verdict()` hook — `update_from_verdict()`.
5. Unit tests: `test_block_weight_learning.py` (10).

### Phase 3: Layer A learned weights + Layer B order penalty (Day 3–4)

1. `engine/search/feature_importance.py` — `derive_layer_a_weights()`, `get_active_weights()` (1h cache).
2. `engine/search/_signals.py` — overlay learned weights.
3. `engine/search/similar.py::_layer_b` — Kendall-tau penalty (λ=0.15).
4. Unit tests: `test_recall_at_k.py` (7).
5. Recall fixture 빌드 — `engine/tests/fixtures/recall_eval.json` (50 queries).

### Phase 4: AutoResearch gate + tests (Day 4–5)

1. `engine/research/autoresearch_loop.py` — `GATE_MIN_SHARPE=0.3`, `PROMOTE_SHARPE=0.7`, `GATE_MIN_T_STAT=1.5`, `GATE_MIN_SIGNALS=10`.
2. Deflated Sharpe integration — `n_trials = len(scan_df)`.
3. Env var escape hatch — `WTD_GATE_MIN_SHARPE`, `WTD_LOOSE_GATE`.
4. Unit tests: `test_autoresearch_gates.py` (6).

### Phase 5: API + Monitoring (Day 5)

1. `engine/api/algorithm.py` — `/algorithm/calibration/report`, `/algorithm/block_weights`.
2. Monitoring metrics emit — V7 매트릭스 모두.
3. Unit tests: `test_algorithm_api.py` (5).
4. Dashboard JSON (optional): `engine/observability/dashboards/algorithm.json`.

### Phase 6: Rollout (Day 5–10)

1. Stage 1 (Day 5–7) — Shadow calibration.
2. Stage 2 (Day 7–10) — Canary 50/50 A/B.
3. Stage 3 (Day 10+) — Full rollout.

## Next Steps

1. **Day 1 AM**: Issue 갱신 + worktree 진입. `feat/W-0313-algorithm-hardening` rename.
2. **Day 1 PM**: Phase 1 Step 1–3.
3. **Day 2**: Phase 1 Step 4–5 + Phase 2 Step 1–2.
4. **Day 3**: Phase 2 Step 3–5 + Phase 3 Step 1–3.
5. **Day 4**: Phase 3 Step 4–5 + Phase 4.
6. **Day 5**: Phase 5 + PR open.
7. **Day 5–10**: Stage 1–3 rollout, monitoring.
8. **Post-merge**: production 1주일 ECE 모니터링 + block weight drift report.

## Handoff Checklist

- [ ] Issue #645 V-track 본 문서 링크
- [ ] `feat/W-0313-algorithm-hardening` worktree
- [ ] 50-query recall eval fixture (`engine/tests/fixtures/recall_eval.json`) — 별도 PR
- [ ] Synthetic verdict generator for AC4 (`tests/fixtures/synthetic_verdicts.py`)
- [ ] CURRENT.md `In Progress` 추가
- [ ] state/inventory.md 신규 module 등록 (calibration, block_weights, feature_importance, trainer_trigger, algorithm API)
- [ ] 머지 후: production 1주일 ECE 모니터링 + block weight drift report
- [ ] Recall baseline PR commit (`engine/tests/fixtures/recall_baseline.json`)
- [ ] Dashboard wired (V7 metrics)
