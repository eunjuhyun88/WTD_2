# W-0313 — 핵심 알고리즘 강화 (LightGBM Layer C + Calibration + Block Weight Learning)

> Wave: 4 | Priority: P1 | Effort: L
> Charter: In-Scope L5 (Search) + L7 (AutoResearch)
> Status: 🟡 Design Draft
> Created: 2026-04-29
> Issue: TBD

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
| `engine/scoring/trainer_trigger.py` (신규) | verdict 50+ 자동 트리거, Supabase 폴링 + 디바운스 |
| `engine/scoring/feature_matrix.py` | `encode_verdict_outcomes()` — verdict ledger → (X, y) |
| `engine/scoring/ensemble.py` | `W_ML` 계산을 calibrated `p_win` 기준으로, regime feature leakage 제거 |
| `engine/scoring/block_weights.py` (신규) | EWM block weight 학습 + persisted store |
| `engine/scoring/block_evaluator.py` | block 평가 시 학습된 가중치 곱 |
| `engine/search/_signals.py` | `SIGNAL_WEIGHTS` 상단에 `LEARNED_WEIGHTS` 우선순위 |
| `engine/search/feature_importance.py` (신규) | LightGBM gain → Layer A weight 동기화 |
| `engine/search/similar.py` | `_layer_a` Mahalanobis 옵션, learned weight 통합 |
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
from typing import Optional
from ledger.store import LEDGER_RECORD_STORE
from scoring.lightgbm_engine import get_engine
from scoring.feature_matrix import encode_verdict_outcomes
from scoring.calibration import IsotonicCalibrator

log = logging.getLogger("engine.layer_c.trigger")

MIN_VERDICTS = 50
MIN_POSITIVE_RATE = 0.10  # 최소 5/50 = HIT, class imbalance 가드
RETRAIN_INTERVAL_HOURS = 24
DEBOUNCE_KEY_PREFIX = "layer_c_last_train"


def maybe_trigger_layer_c_training(
    pattern_slug: Optional[str] = None,
    *,
    user_id: Optional[str] = None,
    force: bool = False,
) -> Optional[dict]:
    """verdicts 50+ 도달하면 LightGBM 학습 + isotonic calibration.

    Returns training report dict, or None if conditions unmet.
    """
    records = LEDGER_RECORD_STORE.list(
        pattern_slug=pattern_slug,
        record_type="verdict",
        limit=10_000,
    )
    verdicts = [r for r in records if r.payload.get("user_verdict") in {"valid", "invalid"}]
    n = len(verdicts)
    if n < MIN_VERDICTS:
        log.debug("Layer C trigger skipped: %d < %d verdicts", n, MIN_VERDICTS)
        return None

    n_positive = sum(1 for v in verdicts if v.payload["user_verdict"] == "valid")
    if n_positive / n < MIN_POSITIVE_RATE:
        log.warning("Layer C trigger skipped: positive rate %.2f%% < %.2f%%",
                    100 * n_positive / n, 100 * MIN_POSITIVE_RATE)
        return None

    if not force and _within_debounce(pattern_slug, RETRAIN_INTERVAL_HOURS):
        return None

    X, y, feature_index = encode_verdict_outcomes(verdicts)
    if len(X) < MIN_VERDICTS:
        return None

    engine = get_engine(user_id=user_id)
    train_report = engine.train(X, y, n_splits=5)
    if not train_report.get("replaced"):
        log.info("Layer C: AUC %.4f did not beat incumbent — skip calibration",
                 train_report.get("auc"))
        return train_report

    # Calibrate on the LAST fold (held-out, chronologically latest)
    val_idx = _last_fold_indices(len(X), n_splits=5)
    raw_proba = engine.predict_batch(X[val_idx])
    calibrator = IsotonicCalibrator()
    calibrator.fit(raw_proba, y[val_idx])
    calibrator.save(engine.calibrator_path())

    train_report["calibration"] = {
        "ece_before": calibrator.ece_before,
        "ece_after":  calibrator.ece_after,
        "brier_before": calibrator.brier_before,
        "brier_after":  calibrator.brier_after,
    }
    _persist_debounce(pattern_slug)
    return train_report
```

**훈련 트리거 호출 지점**:
- `ledger/store.py::append_verdict()` 후 `verdict_count % 10 == 0` 시점에 background thread로 호출
- `tools/cycle-smoke.py` 끝에서도 명시적 호출 (CI에서 1회)

#### 1.2 Isotonic Calibration

LightGBM `predict_proba()` 출력은 leaf log-odds → sigmoid이지만 trade outcome 분포가 skewed (대부분 close to 0.5)이라 over-confident. **Isotonic regression**은 monotone 보정이라 분포 가정 없이 잘 작동한다 (Niculescu-Mizil & Caruana 2005).

```python
# engine/scoring/calibration.py
from __future__ import annotations
import json
import pickle
from pathlib import Path
import numpy as np
from sklearn.isotonic import IsotonicRegression
from sklearn.metrics import brier_score_loss


class IsotonicCalibrator:
    """Monotone binning calibration for binary P(win).

    Theory (Zadrozny & Elkan 2002):
        Find non-decreasing g: [0,1] → [0,1] minimizing
            Σ (g(p_i) - y_i)^2
        subject to p_i < p_j ⇒ g(p_i) ≤ g(p_j).

    Solved by Pool Adjacent Violators (O(n log n)).

    For trade outcomes (Bernoulli y), this directly minimizes Brier score
    while preserving the AUC of the underlying classifier.
    """

    def __init__(self, n_bins_for_ece: int = 10) -> None:
        self._iso: IsotonicRegression | None = None
        self._n_bins = n_bins_for_ece
        self.ece_before: float | None = None
        self.ece_after: float | None = None
        self.brier_before: float | None = None
        self.brier_after: float | None = None

    def fit(self, raw_proba: np.ndarray, y: np.ndarray) -> "IsotonicCalibrator":
        if len(raw_proba) < 30:
            raise ValueError("Need ≥30 samples for stable isotonic fit.")
        self.brier_before = float(brier_score_loss(y, raw_proba))
        self.ece_before = float(_expected_calibration_error(raw_proba, y, self._n_bins))

        # out_of_bounds='clip' avoids NaN at extreme p
        self._iso = IsotonicRegression(out_of_bounds="clip", y_min=0.0, y_max=1.0)
        self._iso.fit(raw_proba, y)

        cal = self._iso.predict(raw_proba)
        self.brier_after = float(brier_score_loss(y, cal))
        self.ece_after = float(_expected_calibration_error(cal, y, self._n_bins))
        return self

    def transform(self, raw_proba: np.ndarray | float) -> np.ndarray | float:
        if self._iso is None:
            return raw_proba  # graceful: identity until trained
        scalar = np.isscalar(raw_proba)
        arr = np.atleast_1d(np.asarray(raw_proba, dtype=float))
        out = self._iso.predict(arr)
        return float(out[0]) if scalar else out

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump({
                "iso": self._iso,
                "ece_before": self.ece_before,
                "ece_after": self.ece_after,
                "brier_before": self.brier_before,
                "brier_after": self.brier_after,
            }, f)
        # JSON sidecar for human inspection
        path.with_suffix(".json").write_text(json.dumps({
            "ece_before": self.ece_before,
            "ece_after": self.ece_after,
            "brier_before": self.brier_before,
            "brier_after": self.brier_after,
        }, indent=2))

    @classmethod
    def load(cls, path: Path) -> "IsotonicCalibrator":
        with open(path, "rb") as f:
            data = pickle.load(f)
        c = cls()
        c._iso = data["iso"]
        c.ece_before = data["ece_before"]
        c.ece_after = data["ece_after"]
        c.brier_before = data["brier_before"]
        c.brier_after = data["brier_after"]
        return c


def _expected_calibration_error(p: np.ndarray, y: np.ndarray, n_bins: int) -> float:
    """ECE = Σ_b (|B_b|/N) * |acc(B_b) - conf(B_b)| (Guo et al. 2017)."""
    p = np.asarray(p)
    y = np.asarray(y)
    edges = np.linspace(0.0, 1.0, n_bins + 1)
    ece = 0.0
    n = len(p)
    for i in range(n_bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (p >= lo) & (p < hi if i < n_bins - 1 else p <= hi)
        if not mask.any():
            continue
        acc = y[mask].mean()
        conf = p[mask].mean()
        ece += (mask.sum() / n) * abs(acc - conf)
    return ece
```

`get_engine().predict_one()` → `predict_one_calibrated()` 신규 메서드: raw → `IsotonicCalibrator.transform()` 통과한 P(win)을 반환. `ensemble.compute_ensemble()`은 calibrated 값을 받도록 시그니처 유지 (하위 호환).

### Sub-2: Layer A — Feature Importance Weighting + Mahalanobis 검토

#### 2.1 결정: weighted L1 (현행) → **weighted L2 with importance weights** (LightGBM gain 기반)

**왜 Mahalanobis 아닌가**: Mahalanobis = `(x-y)^T Σ^{-1} (x-y)` 는 feature 간 공분산까지 표준화한다. 그러나
- Σ는 코퍼스 전체에서 추정해야 안정적 → 75k bar 코퍼스 가능하지만, **non-stationary** (regime shift)에 취약
- inversion `Σ^{-1}` 는 feature 수 N=40+에서 numerical 불안정 (rank deficient)
- `cosine` 은 magnitude를 무시하지만 우리는 magnitude(예: `oi_zscore`)가 신호임

**채택**: **Importance-weighted L1 + 학습된 weight**. 수식:

```
sim_A(x, y) = 1 - Σ_i w_i * |x_i - y_i| / (Σ_i w_i * (|x_i| + |y_i| + ε))
```

여기서 `w_i = 0.5 * w_static_i + 0.5 * w_learned_i`:
- `w_static_i`: 현재 `_signals.SIGNAL_WEIGHTS` (도메인 지식, OI/funding 우선)
- `w_learned_i`: LightGBM `feature_importance(gain)` 기반, normalized so Σ = N

```python
# engine/search/feature_importance.py
def derive_layer_a_weights(min_gain_pct: float = 1.0) -> dict[str, float]:
    """LightGBM gain importance → Layer A weight (per feature).

    Mixing rule: w_i = 0.5 * w_static_i + 0.5 * w_learned_i

    The static prior anchors against catastrophic LightGBM mis-attribution
    on small samples (e.g. 50 verdicts → unstable importance ranking).
    """
    from scoring.lightgbm_engine import get_engine
    from search._signals import SIGNAL_WEIGHTS, _DEFAULT_WEIGHT
    engine = get_engine()
    if not engine.is_trained:
        return dict(SIGNAL_WEIGHTS)

    importance = engine.feature_importance() or {}
    total = sum(importance.values()) or 1.0
    n = len(importance)
    learned = {k: (v / total) * n for k, v in importance.items()}  # normalize Σ=N

    out: dict[str, float] = {}
    keys = set(SIGNAL_WEIGHTS) | set(learned)
    for k in keys:
        ws = SIGNAL_WEIGHTS.get(k, _DEFAULT_WEIGHT)
        wl = learned.get(k, _DEFAULT_WEIGHT)
        out[k] = 0.5 * ws + 0.5 * wl
    return out
```

`search/_signals.weighted_l1_score` 는 호출부에서 `dynamic_weights = derive_layer_a_weights()` 를 받도록 시그니처 확장 (process-cached 1h TTL).

#### 2.2 추가: Phase Order Penalty (Layer B)

순수 LCS는 [`A`, `B`, `C`] 와 [`B`, `A`, `C`] 를 동일하게 길이 2로 친다 (`A`+`C` 또는 `B`+`C`). 트레이딩에서 **순서 자체가 신호** (e.g. accumulation → markup → distribution). Penalty 추가:

```
sim_B = LCS(q, c) / max(|q|, |c|) - λ * inversion_count(q, c) / |q| * (|q| - 1)
```

`λ = 0.15`. `inversion_count` 은 query path에 매핑된 candidate path의 reversed-pair 개수 (Kendall-tau 분자와 동치). λ는 Sub-3 결과 검토 후 hill-climbing 으로 fine-tune.

### Sub-3: Block Weight Learning + AutoResearch Gate Strengthening

#### 3.1 EWM Block Weight Update

verdict ledger는 `(pattern_slug, blocks_triggered, user_verdict)` 를 기록한다 (`ledger/types.py:54`). 각 block i에 대해:

```
w_i(t+1) = α * w_i(t) + (1 - α) * outcome_t
α = 0.95   (slow decay; 크립토 비정상성에 적응 가능하면서 노이즈 흡수)
outcome_t ∈ {+1 if verdict='valid' AND block_i fired,
             -1 if verdict='invalid' AND block_i fired,
              0  otherwise}
```

수렴 분석: `E[w_i(∞)] = E[outcome | block_i fired]` (geometric series). α=0.95 → effective sample size ≈ 1/(1-α) = 20 verdicts. 50 verdicts 도달하면 ~92% 변동에 적응.

**음수 보정**: `w_i` 은 `[-1, 1]` 범위지만 ensemble 내에서는 `block_score` 다중자로 들어가야 하므로:

```
w_i_effective = clip( 1 + β * w_i, 0.1, 2.0 )
β = 0.5  # gain
```

→ 평균 outcome=0 인 블록은 `w=1` (가중치 변화 없음), outcome=+1 (모두 valid 동반) 인 블록은 `w=1.5`, outcome=-1 (false positive 다발) 은 `w=0.5`.

```python
# engine/scoring/block_weights.py
from __future__ import annotations
import json
import sqlite3
import threading
from pathlib import Path
from typing import Iterable

ALPHA = 0.95
BETA = 0.5
W_MIN = 0.1
W_MAX = 2.0
DEFAULT_RAW = 0.0  # neutral ⇒ w_effective = 1.0
STATE_DB = Path(__file__).parent.parent / "scoring" / "state" / "block_weights.sqlite"


class BlockWeightStore:
    """Persistent EWM weight per block with thread-safe updates.

    Schema:
      block_weights(block_name PK, raw REAL, n_updates INT, updated_at TEXT)
    """

    _lock = threading.RLock()

    def __init__(self, db_path: Path | None = None) -> None:
        self.db_path = Path(db_path or STATE_DB)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self) -> None:
        with sqlite3.connect(str(self.db_path)) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS block_weights (
                    block_name TEXT PRIMARY KEY,
                    raw REAL NOT NULL DEFAULT 0.0,
                    n_updates INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                )
            """)

    def update_from_verdict(
        self,
        verdict: str,                       # 'valid' | 'invalid'
        blocks_triggered: Iterable[str],
        all_blocks: Iterable[str],
    ) -> None:
        """EWM update for every block in the universe."""
        if verdict not in {"valid", "invalid"}:
            return
        triggered = set(blocks_triggered)
        outcome_fired = +1.0 if verdict == "valid" else -1.0

        with self._lock, sqlite3.connect(str(self.db_path)) as conn:
            for block in all_blocks:
                outcome = outcome_fired if block in triggered else 0.0
                cur = conn.execute(
                    "SELECT raw, n_updates FROM block_weights WHERE block_name=?",
                    (block,),
                ).fetchone()
                raw_old = cur[0] if cur else DEFAULT_RAW
                n_old = cur[1] if cur else 0
                raw_new = ALPHA * raw_old + (1 - ALPHA) * outcome
                conn.execute("""
                    INSERT INTO block_weights(block_name, raw, n_updates, updated_at)
                    VALUES (?, ?, ?, datetime('now'))
                    ON CONFLICT(block_name) DO UPDATE SET
                      raw=excluded.raw, n_updates=excluded.n_updates,
                      updated_at=excluded.updated_at
                """, (block, raw_new, n_old + 1))

    def effective_weight(self, block_name: str) -> float:
        with sqlite3.connect(str(self.db_path)) as conn:
            row = conn.execute(
                "SELECT raw FROM block_weights WHERE block_name=?", (block_name,)
            ).fetchone()
        raw = row[0] if row else DEFAULT_RAW
        return max(W_MIN, min(W_MAX, 1.0 + BETA * raw))

    def all_effective(self) -> dict[str, float]:
        with sqlite3.connect(str(self.db_path)) as conn:
            rows = conn.execute("SELECT block_name, raw FROM block_weights").fetchall()
        return {b: max(W_MIN, min(W_MAX, 1.0 + BETA * r)) for b, r in rows}
```

`scoring/ensemble.py::_compute_block_score` 를 다음과 같이 확장:

```
block_score = ( Σ_i w_eff_i * I(block_i fired AND not disqualifier) ) / 5
            * 0.6
            + diversity_bonus * 0.4
```

#### 3.2 AutoResearch Gate 강화

| Gate | 현재 | 변경 후 | 근거 |
|---|---|---|---|
| `GATE_MIN_SHARPE` | 0.1 | **0.3** | Sharpe 0.1 = noise (Sharpe<0.5 deflated p>0.05 with n_trials=2000, W-0290) |
| `PROMOTE_SHARPE` | 0.5 | **0.7** | 실전 운영 모형 평균 Sharpe 0.5–1.0 (2 sigma 마진) |
| `GATE_MIN_HIT_RATE` | 0.50 | 0.50 | 유지 (binomial test p<0.05 @ n=50) |
| `GATE_MIN_T_STAT` | 1.0 | 1.5 | 1-sided p<0.07 → p<0.067 → align with Bonferroni |
| `GATE_MIN_SIGNALS` | 5 | 10 | Sharpe SE = 1/√n; n=10 → SE≈0.32 (현실적 하한) |

추가: **deflated Sharpe gate** (research/validation/deflated_sharpe 통합):

```
sharpe_deflated >= 0.0  AND  p_value_deflated < 0.05
```

이미 W-0290에 deflated Sharpe 모듈 있음 — autoresearch_loop에서 `n_trials = len(scan_df)` 넘겨 호출.

### Risk Matrix

| 리스크 | 확률 | 영향 | 완화 |
|---|---|---|---|
| 50 verdict이 모두 한 클래스 (HIT only or MISS only) | 중 | 중 (학습 실패) | `MIN_POSITIVE_RATE=0.10` 가드 + class_weight='balanced' |
| LightGBM gain importance가 50 샘플에서 불안정 → Layer A 가중치 노이즈 | 중 | 중 (recall ↓) | static prior 0.5 mixing + 100 verdict 도달 후 학습 가중치 비율 ↑ |
| EWM α=0.95 → 초기 50 verdict까지 raw=0 (=neutral) → 효과 없음 | 고 | 저 | warmup mode: 첫 100 verdicts에서 α=0.85 (faster init) |
| Layer C calibration이 train fold에 overfit | 중 | 고 (live ECE > 0.1) | calibration 학습은 last fold만 (held-out chronological) + ECE retest on next 20 verdicts |
| `block_weights.sqlite` 와 LightGBM model 불일치 (블록 추가 시) | 저 | 중 | `_init_db` 시 `_BLOCK_CATEGORIES` keys 자동 seed |
| AutoResearch gate 0.1→0.3 상향으로 promoted 패턴 0개 (cold start) | 고 | 저 | env var `LOOSE_GATE=true` (개발용 escape hatch) |
| Isotonic monotone violation (negative slope on edge bins) | 저 | 저 | sklearn `IsotonicRegression(increasing=True)` 강제 |

### Files Touched (요약)

신규: `engine/scoring/calibration.py`, `engine/scoring/trainer_trigger.py`, `engine/scoring/block_weights.py`, `engine/search/feature_importance.py`, `engine/api/algorithm.py`, 테스트 4개.

수정: `engine/scoring/lightgbm_engine.py`, `engine/scoring/ensemble.py`, `engine/scoring/block_evaluator.py`, `engine/scoring/feature_matrix.py`, `engine/search/similar.py`, `engine/search/_signals.py`, `engine/research/autoresearch_loop.py`, `engine/ledger/store.py` (verdict trigger hook).

## AI Researcher 관점

### Layer C 훈련 데이터 요구사항

**Class imbalance**: 실측 verdict 분포 (2026-04-29 기준 추정) — `valid:invalid ≈ 1:3`. SMOTE-NC 또는 LightGBM `class_weight='balanced'` (effective `is_unbalance=True` flag).

수식 — class weight:
```
w_pos = N / (2 * N_pos),   w_neg = N / (2 * N_neg)
```

→ `params["is_unbalance"] = True` 추가 (lightgbm 자동으로 `scale_pos_weight = N_neg / N_pos` 적용).

**Feature leakage 가드**: verdict 시점 = capture_ts + evaluation_window (`ledger/types.py`). feature_snapshot 은 capture_ts에 frozen → ✅ 안전. **단**, `ensemble.compute_ensemble`이 `regime` 입력으로 받는 macro feature는 verdict 시점 macro 가 흘러들어올 위험 → `regime` snapshot은 capture_ts 기준으로만 추출하도록 `feature_matrix.encode_verdict_outcomes`에서 강제.

### Calibration 검증 — Reliability Diagram + ECE

**Reliability diagram**: x=mean predicted prob in bin, y=empirical accuracy. 완벽 calibrated → y=x line.

**ECE (Expected Calibration Error)** — Guo et al. 2017:
```
ECE = Σ_b (|B_b| / N) · |acc(B_b) - conf(B_b)|
```

**MCE (Maximum CE)** — worst-case bin:
```
MCE = max_b |acc(B_b) - conf(B_b)|
```

**Brier score** — strictly proper scoring rule:
```
Brier = (1/N) Σ_i (p_i - y_i)^2
```

Brier decomposition (Murphy 1973):
```
Brier = reliability - resolution + uncertainty
       = (calibration error)  -  (sharpness over base rate) + Var(y)
```

→ Calibration이 reliability 항만 줄임. Resolution은 LightGBM AUC가 좌우. 따라서 **AUC는 유지하면서 Brier만 ↓** 면 calibration이 잘 된 것.

**AC2 측정**: held-out test set (train의 마지막 fold) 에서 `ECE_after - ECE_before` 비교. 임계값 `ECE_after < 0.05`. 추가 가드: `Brier_after ≤ Brier_before` (calibration이 sharpness를 죽이지 않았는지).

### Block Weight Learning 편향

**Over-representation 위험**:

1. **Trigger 블록은 Entry/Confirmation 보다 자주 fired** (e.g. `volume_spike` 매 4–10 bar) → outcome=0 누적이 많아 raw → 0 으로 회귀. **완화**: `update_from_verdict` 에서 `outcome=0` 케이스는 EWM α' = 0.99 로 더 약하게 (asymmetric update — fired 케이스만 강하게 학습).

2. **Disqualifier 블록은 valid verdict일 때 거의 안 fire** → raw → -1 로 잘못 갈 위험. **완화**: `BlockCategory.DISQUALIFIER` 는 weight learning 제외 (정의상 fixed weight).

3. **Survivorship bias**: `valid` verdict는 user가 알람을 본 capture에 한해 발생 → 알람 못 본 invalid (silent failure) 미수집. → block weight는 "알람을 본 사용자가 검증한 결과의 분포"로만 학습됨. 본 분포 vs 실분포 gap 측정은 W-0314 (capture coverage 분석)에서 처리.

**검증 방법**:
- Synthetic verdict generator: `funding_extreme` 가 valid에서 100%, invalid에서 10% fire 하도록 설정 → 100 verdict 후 `w_eff(funding_extreme)` 가 1.5 근처 수렴해야 함 (AC4).
- `volume_spike` 가 valid/invalid 모두 50% fire → 100 verdict 후 `w_eff` ≈ 1.0 ± 0.05 유지.

### Deflated Sharpe Penalty (이미 존재, 통합만)

`research/validation/deflated_sharpe.py` 의 `deflated_sharpe_ratio(observed_sr, n_trials, skew, kurt)` 호출. AutoResearch gate에서 `n_trials = len(scan_df)` 사용. Bonferroni equivalent — true SR distribution under multiple testing.

## Decisions

### M1: LightGBM vs XGBoost vs CatBoost

| Axis | LightGBM | XGBoost | CatBoost |
|---|---|---|---|
| Train speed (50 samples) | 1× | 1.3× | 2.5× |
| Categorical handling | label encode | label/one-hot | native |
| Calibration ease | sigmoid leaf | sigmoid leaf | softmax (다중 헤드) |
| sklearn API | ✅ | ✅ | ✅ |
| In-tree (현 코드) | ✅ | ❌ | ❌ |

**Decision: LightGBM 유지**. 현 코드 유지 + 카테고리 적음 (4개) → CatBoost 이점 없음. XGBoost 대비 학습 속도 우위.

### M2: Isotonic vs Platt Scaling

| Axis | Isotonic | Platt (sigmoid) |
|---|---|---|
| 분포 가정 | 없음 (non-parametric) | logistic 가정 |
| 데이터 요구량 | ≥30 권장 | ≥10도 가능 |
| Overfit 위험 | 중 (n<200) | 저 |
| Monotone violations | piecewise step (계단형) | smooth |
| LightGBM과 궁합 | ✅ (gain → arbitrary distribution) | ⚠️ (logit 가정 → bias) |

**Decision: Isotonic 채택**. 50 verdicts → 30 samples 충분 (last fold) + LightGBM 분포가 logistic이 아닐 가능성 (small sample). 단, n<30 인 코너 케이스는 Platt fallback (`scoring/calibration.py::_platt_fallback`).

### M3: Mahalanobis vs Weighted L1

§Sub-2.1 참조. **Decision: Weighted L1 + learned importance**. Mahalanobis는 cov inversion 불안정 + non-stationary 위험.

### M4: EWM α 값

| α | Effective N | 적응 속도 | 노이즈 흡수 |
|---|---|---|---|
| 0.99 | 100 | 매우 느림 | 매우 강함 |
| 0.95 | 20 | 적당 | 강함 |
| 0.90 | 10 | 빠름 | 중간 |
| 0.80 | 5 | 매우 빠름 | 약함 |

**Decision: α=0.95 (정상), α=0.85 warmup (첫 100 verdicts)**. 크립토 regime shift 주기 ~30일 = 50–80 verdicts (4h scan) → 적응 속도 적합.

### M5: Block weight gain β

`w_eff = clip(1 + β * raw, 0.1, 2.0)`, `β=0.5`. raw=±1 이면 w_eff = 1.5 / 0.5. β=1.0 으로 하면 [0.0, 2.0] 양극화 → 작은 샘플로 학습한 블록이 0으로 죽을 위험. **Decision: β=0.5**.

## Implementation Plan

### Phase 1: Calibration + Layer C trigger (Day 1–2)

```python
# Step 1: engine/scoring/calibration.py
class IsotonicCalibrator: ...

# Step 2: engine/scoring/lightgbm_engine.py
class LightGBMEngine:
    def calibrator_path(self) -> Path:
        return self._model_dir / "calibrator.pkl"

    def predict_one_calibrated(self, snap) -> Optional[float]:
        raw = self.predict_one(snap)
        if raw is None or not hasattr(self, "_calibrator"):
            return raw
        return self._calibrator.transform(raw)

# Step 3: engine/scoring/trainer_trigger.py
def maybe_trigger_layer_c_training(...): ...

# Step 4: engine/ledger/store.py (hook)
def append_verdict(self, ...):
    ...
    if self._verdict_count(pattern_slug) % 10 == 0:
        threading.Thread(
            target=maybe_trigger_layer_c_training,
            args=(pattern_slug,), daemon=True
        ).start()
```

### Phase 2: Block weight learning (Day 2–3)

```python
# Step 1: engine/scoring/block_weights.py — BlockWeightStore
# Step 2: engine/scoring/ensemble.py
from scoring.block_weights import BlockWeightStore
_BWS = BlockWeightStore()

def _compute_block_score(analysis: BlockAnalysis) -> float:
    weights = _BWS.all_effective()
    fired = analysis.entries + analysis.triggers + analysis.confirmations
    weighted_count = sum(weights.get(b, 1.0) for b in fired)
    base = min(weighted_count / 5.0, 1.0)
    diversity = analysis.n_categories_active / 3.0
    return base * 0.6 + diversity * 0.4

# Step 3: engine/ledger/store.py append_verdict hook
_BWS.update_from_verdict(verdict, blocks_triggered, all_blocks=_BLOCK_CATEGORIES.keys())
```

### Phase 3: Layer A learned weights + Layer B order penalty (Day 3–4)

```python
# Step 1: engine/search/feature_importance.py — derive_layer_a_weights()
# Step 2: engine/search/_signals.py
_LEARNED_CACHE: tuple[float, dict[str, float]] | None = None

def get_active_weights() -> dict[str, float]:
    global _LEARNED_CACHE
    if _LEARNED_CACHE and time.time() - _LEARNED_CACHE[0] < 3600:
        return _LEARNED_CACHE[1]
    from search.feature_importance import derive_layer_a_weights
    w = derive_layer_a_weights()
    _LEARNED_CACHE = (time.time(), w)
    return w

# Step 3: engine/search/similar.py _layer_b
def _layer_b(query_path, candidate_path) -> float:
    if not query_path or not candidate_path:
        return 0.0
    lcs_len = _lcs(query_path, candidate_path)
    base = lcs_len / max(len(query_path), len(candidate_path))
    inv = _inversion_count(query_path, candidate_path)
    n = len(query_path)
    if n < 2:
        return base
    penalty = 0.15 * inv / (n * (n - 1) / 2)
    return max(0.0, base - penalty)
```

### Phase 4: AutoResearch gate + tests (Day 4–5)

```python
# Step 1: engine/research/autoresearch_loop.py
GATE_MIN_SHARPE = float(os.environ.get("WTD_GATE_MIN_SHARPE", "0.3"))
PROMOTE_SHARPE  = float(os.environ.get("WTD_PROMOTE_SHARPE", "0.7"))
GATE_MIN_T_STAT = 1.5
GATE_MIN_SIGNALS = 10

# Step 2: deflated Sharpe integration
from research.validation.deflated_sharpe import deflated_sharpe_ratio
def _apply_stats_gate(df):
    ...
    df["sharpe_deflated"], df["sharpe_p"] = zip(*df.apply(
        lambda r: deflated_sharpe_ratio(
            r.sharpe, n_trials=len(df), skew=r.get("skew", 0), kurt=r.get("kurt", 3)
        ), axis=1))
    mask = (df["sharpe_p"] >= 0.05)
    df.loc[mask, "gate_passed"] = False
```

### Phase 5: API + UI surfacing (Day 5)

```python
# engine/api/algorithm.py
@router.get("/algorithm/calibration/report")
def get_calibration_report():
    engine = get_engine()
    cal = getattr(engine, "_calibrator", None)
    if not cal: return {"trained": False}
    return {
        "trained": True,
        "auc": engine.auc,
        "ece_before": cal.ece_before, "ece_after": cal.ece_after,
        "brier_before": cal.brier_before, "brier_after": cal.brier_after,
    }

@router.get("/algorithm/block_weights")
def get_block_weights():
    return BlockWeightStore().all_effective()
```

## Exit Criteria

- [ ] **AC1**: verdicts 50개 → `maybe_trigger_layer_c_training()` 자동 실행 → `engine.is_trained == True` → `_layer_c(snap) is not None`. 테스트: `test_layer_c_trigger.py::test_50_verdicts_triggers_train`.
- [ ] **AC2**: Held-out test set에서 `ECE_after < 0.05` AND `Brier_after ≤ Brier_before`. 테스트: `test_calibration.py::test_isotonic_reduces_ece`.
- [ ] **AC3**: 50-query eval set (`tests/fixtures/recall_eval.json`)에서 `recall@10 ≥ 0.70` (baseline 측정 후 절대값 갱신, regression guard ≥ baseline + 0.05). 테스트: `test_recall_at_k.py::test_recall_at_10_meets_target`.
- [ ] **AC4**: synthetic 100 verdicts (`funding_extreme` valid:100%, invalid:10%) → `w_eff(funding_extreme) ∈ [1.4, 1.6]`. 테스트: `test_block_weight_learning.py::test_ewm_converges_on_synthetic`.
- [ ] **AC5**: 새 테스트 20+ 추가 PASS, 기존 테스트 0 regression.
- [ ] **AC6**: `GATE_MIN_SHARPE` 0.3 적용 후 `cycle_smoke` 가 promoted 1+ 또는 reasoned reject (cold-start 가드).
- [ ] **AC7**: `/algorithm/calibration/report` 200 OK, `/algorithm/block_weights` 200 OK.
- [ ] CI green (engine pytest + ruff).

## Facts

- 현 `LightGBMEngine` 는 `predict_proba` 기반 — calibration 없이는 over-confident 일 가능성 높음 (small-sample LightGBM 일반적 문제).
- `ledger/types.py:18` LedgerRecordType 에 `"verdict"` 존재 → trigger 데이터 source 확정.
- `ledger/types.py:54` `user_verdict` enum: valid/invalid/near_miss/too_early/too_late — 학습은 `valid` vs `invalid` 만 사용 (5-class → binary 압축).
- `search/_signals.py:22` `SIGNAL_WEIGHTS` 가 정적 가중치 SSOT.
- `search/quality_ledger.py:46` `_DEFAULT_WEIGHTS = {a:0.45, b:0.30, c:0.25}` — already 목표값.
- `autoresearch_loop.py:49` `GATE_MIN_SHARPE = 0.1` 실측 — 변경 대상.
- `scoring/feature_matrix.py` `FEATURE_NAMES = FEATURE_COLUMNS` 외부 ops module — `FEATURE_COLUMNS` 를 학습 트리거 X build 시 그대로 사용.
- `scoring/ensemble.py:106` `W_ML=0.50, W_BLOCK=0.35, W_REGIME=0.15` — block weight 학습은 `W_BLOCK` 내부 분배에만 영향, 외곽 가중치 불변.

## Assumptions

- verdict 50개 도달 시점에 verdict ledger에 `feature_snapshot` 또는 capture_id 가 함께 기록되어 있다 (`ledger/types.py:54` 가 verdict-to-entry mapping을 보장한다고 가정). **검증 필요** — Phase 1 Step 1 시작 시 spot check.
- verdict가 단일 user 또는 hybrid scheduler 인스턴스에서 통합 기록된다 — 분산 ledger인 경우 `LEDGER_RECORD_STORE.list()` 가 모두 합산해야 함.
- LightGBM `feature_importance(gain)` 이 50 sample에서 unstable 하지만 100 sample에서는 stable — Hou et al. 2014 (gain importance variance scales as 1/√n).
- Block coverage가 imbalanced (e.g. `volume_spike` 가 80%+ 케이스에서 fired) — synthetic test로 검증 필요.

## Canonical Files

- `engine/search/similar.py` — Layer A/B/C blending
- `engine/search/_signals.py` — `SIGNAL_WEIGHTS` SSOT
- `engine/search/quality_ledger.py` — verdict 기반 layer 가중치 (이미 존재, Sub-1과 통합)
- `engine/scoring/lightgbm_engine.py` — Layer C engine
- `engine/scoring/ensemble.py` — block ensemble
- `engine/scoring/block_evaluator.py` — block firing logic
- `engine/research/autoresearch_loop.py` — gate thresholds
- `engine/ledger/types.py:18` — LedgerRecordType (verdict)
- `engine/ledger/store.py:899` — `LEDGER_RECORD_STORE` factory
- `engine/research/validation/deflated_sharpe.py` (W-0290) — n_trials adjustment

## Next Steps

1. **Day 1 AM**: Issue 생성 + worktree 진입. `feat/W-0313-algorithm-hardening` rename.
2. **Day 1 PM**: Phase 1 Step 1–3 (`calibration.py`, `lightgbm_engine.py` 확장, `trainer_trigger.py`). Unit tests for `IsotonicCalibrator`.
3. **Day 2**: Phase 1 Step 4 (ledger hook) + Phase 2 (`block_weights.py`). 동기 verdict 학습 e2e.
4. **Day 3**: Phase 3 (Layer A learned + Layer B order). `feature_importance.py` cache.
5. **Day 4**: Phase 4 (gate update) + recall@10 fixture 빌드 (50 query).
6. **Day 5**: Phase 5 (API). PR open.
7. **Post-merge**: production verdict ledger 백필 → first auto-train trigger 모니터링 (Cloud Run logs).

## Handoff Checklist

- [ ] Issue 생성 + 본 문서 링크
- [ ] `feat/W-0313-algorithm-hardening` worktree
- [ ] 50-query recall eval fixture (`engine/tests/fixtures/recall_eval.json`) — 별도 PR로 분리 가능
- [ ] Synthetic verdict generator for AC4 (`tests/fixtures/synthetic_verdicts.py`)
- [ ] CURRENT.md `In Progress` 추가
- [ ] state/inventory.md 신규 module 등록 (calibration, block_weights, feature_importance)
- [ ] 머지 후: production 1주일 ECE 모니터링 + block weight drift report
