# 09 — Reranker Training Specification

**Owner:** Research Core
**Depends on:** `01_PATTERN_OBJECT_MODEL.md`, `03_SEARCH_ENGINE.md`, `08_PHASE_PATH_EDIT_DISTANCE_SPEC.md`
**Status:** Build-ready (Slice 9 precondition)
**Type:** Algorithm spec — `03_SEARCH_ENGINE.md` §5의 완전 구체화

> **이 문서의 목적:** `03 §5`의 LightGBM lambdarank를 **데이터 0에서 NDCG@5 baseline + 0.05까지** 가는 완전한 학습 절차. Cold-start, feature engineering, calibration, negative sampling, promotion gate, rollback까지.

---

## 0. 갭 진단

`03_SEARCH_ENGINE.md` §5가 정의 안 한 것:

| 갭 | 위험 |
|---|---|
| Cold-start (label < 50) | "50+ verdict 이후 supervised"라는데 그 전엔? |
| Feature normalization / encoding | RankFeatures 14개 → 실제 numpy array 어떻게? |
| Negative sampling 비율 | positive : hard_neg : near_miss = ? |
| Bootstrap → supervised 전환 트리거 | "50+" 이후 어떻게? 점진적? 즉시 교체? |
| Train/val/test split 방법 | Time-based? Query-based? |
| Hyperparameter tuning | num_leaves 31, lr 0.05 임의값처럼 보임 |
| Calibration learning data 분리 | Platt/Isotonic eval data leakage 막기 |
| Promotion gate (shadow → prod) | "+0.05 NDCG" 어떻게 측정? |
| Rollback 절차 | 새 모델 악화 시 |
| Per-pattern vs cross-pattern 모델 | 하나로? family당 하나? |
| Online learning 빈도 | 매일? 주간? trigger? |
| Failure mode (verdict 매우 imbalanced) | INVALID 95% / VALID 5% 같은 케이스 |

이 12개 갭을 다 메꾼다.

---

## 1. 모델 정의 (재명시)

### 1.1 Task definition

**Learning to Rank (pairwise/listwise).**

각 query에 대해 candidate들의 순위를 매김. NDCG@5 최대화.

```python
# Input
queries = [
    {"query_id": "q_001", "candidates": [c1, c2, c3, ..., c20]},
    {"query_id": "q_002", "candidates": [c1, ..., c15]},
    ...
]

# Each candidate has features + label (ground truth relevance)
# Goal: predict ranking that matches ground truth top-K
```

### 1.2 Model 선택

**LightGBM LambdaRank 채택.** `03 §5.3` 정합.

대안 검토:
| 대안 | Reject 사유 |
|---|---|
| XGBoost ranker | LightGBM과 거의 동일. Stack 통일 위해 LightGBM. |
| Neural ranker | 학습 데이터 1000+ 필요. 현재 0. |
| Rule-based | 해석 가능하지만 weight tuning 수동 비용 큼 |
| Cross-encoder LLM | latency 3-8s, 100 candidate × 8s = 800s. 불가능 |

### 1.3 Output

```python
@dataclass
class RankPrediction:
    candidate_id: str
    raw_score: float           # LightGBM 직접 출력
    calibrated_prob: float     # Platt/Isotonic 후 [0, 1]
    feature_importances: dict[str, float]  # SHAP 등 (optional)
```

---

## 2. Feature Engineering

### 2.1 Feature 14개 재명시 (`03 §5.1`)

| Group | Feature | Type | Range |
|---|---|---|---|
| **Similarity** | `phase_path_sim` | float | [0, 1] |
| | `duration_sim` | float | [0, 1] |
| | `feature_vec_sim` | float | [-1, 1] |
| **Absolute** | `peak_return_pct` | float \| null | [-0.5, 1.0] |
| | `hit_rate_for_family` | float | [0, 1] |
| | `regime_match` | float | [0, 1] |
| **Phase** | `phase_reached_max` | int | [0, N] |
| | `current_phase_index` | int | [0, N] |
| | `breakout_confirmed` | bool | {0, 1} |
| **Negative** | `forbidden_signals_hit` | int | [0, ∞] |
| | `failed_candidate_history` | int | [0, ∞] |
| **Recency** | `days_since_pattern` | float | [0, 365] |
| | `is_current_live` | bool | {0, 1} |
| | `phase_completeness` | float | [0, 1] (추가) |

### 2.2 Encoding 결정

```python
def encode_features(rf: RankFeatures) -> np.ndarray:
    """Convert RankFeatures to fixed numpy array for LightGBM."""
    return np.array([
        # Similarity (0-2)
        rf.phase_path_sim,
        rf.duration_sim,
        (rf.feature_vec_sim + 1) / 2,           # [-1, 1] → [0, 1]
        
        # Absolute (3-5)
        rf.peak_return_pct if rf.peak_return_pct is not None else 0.0,
        rf.hit_rate_for_family,
        rf.regime_match,
        
        # Phase (6-8)
        rf.phase_reached_max / 5.0,             # normalize to [0, 1] (5 phases max)
        rf.current_phase_index / 5.0,
        float(rf.breakout_confirmed),
        
        # Negative (9-10): clip + log scale (long tail)
        np.log1p(min(rf.forbidden_signals_hit, 10)),
        np.log1p(min(rf.failed_candidate_history, 20)),
        
        # Recency (11-13)
        np.exp(-rf.days_since_pattern / 30),    # 30-day decay
        float(rf.is_current_live),
        rf.phase_completeness,
    ], dtype=np.float32)
```

### 2.3 Missing value 처리

| Feature | null 발생 조건 | 대체값 |
|---|---|---|
| `peak_return_pct` | ledger outcome 미생성 (72h 미경과) | 0.0 (neutral) |
| `feature_vec_sim` | feature snapshot 미수집 | -1 (worst — 비교 불가) |
| `regime_match` | BTC regime 미계산 | 0.5 (neutral) |
| `hit_rate_for_family` | family에 outcome 0 | 0.5 (neutral, prior) |

**미싱 indicator 별도 feature 추가:**
```python
# Missing flags as additional features (15-17)
np.array([
    1.0 if rf.peak_return_pct is None else 0.0,
    1.0 if rf.regime_match_missing else 0.0,
    1.0 if rf.hit_rate_for_family_default else 0.0,
])
```

총 **17 features** (14 + 3 missing flags).

### 2.4 Feature scaling

LightGBM은 tree-based라 scale 불필요. **단 isotonic calibration 시 raw score는 unbounded** → §6에서 처리.

---

## 3. Training Data

### 3.1 Label scheme

**User verdict (primary) / auto verdict (bootstrap):**

```python
USER_VERDICT_LABEL = {
    "VALID":     1.0,
    "NEAR_MISS": 0.6,
    "TOO_EARLY": 0.4,
    "TOO_LATE":  0.3,
    "INVALID":   0.0,
}

AUTO_VERDICT_LABEL = {
    "HIT":     1.0,
    "EXPIRED": 0.5,
    "MISS":    0.0,
}
```

`03 §5.2` 정합.

### 3.2 Query Group

LambdaRank는 group 단위로 학습. **Group 정의:**

```python
@dataclass
class QueryGroup:
    query_id: str           # search_query_hash
    timestamp: datetime
    candidates: list[Candidate]   # 같은 search call의 top-N
    user_id: str | None
```

**Group 크기:** 5-50 candidates per query. Stage 2 출력의 top 20-50.

**Min group size for training:** 5. 5 미만은 drop (LambdaRank 의미 없음).

### 3.3 Bootstrap label generation (verdict < 50)

User verdict이 누적되기 전. **Auto verdict + heuristic으로 synthetic label.**

```python
def bootstrap_label(candidate: Candidate) -> float:
    # Priority 1: ledger outcome 있으면 auto_verdict
    if candidate.ledger_outcome:
        return AUTO_VERDICT_LABEL[candidate.ledger_outcome.auto_verdict]
    
    # Priority 2: phase completeness
    if candidate.phase_reached_max >= 4:  # accumulation 이상
        return 0.7
    if candidate.phase_reached_max >= 3:  # real_dump
        return 0.4
    if candidate.phase_reached_max >= 1:  # fake_dump only
        return 0.2
    return 0.1  # idle
```

이 레이블은 weak supervision. NDCG metric으로는 부족함. **bootstrap 목적: Stage 2 fallback보다 안 떨어지게 보장만.**

### 3.4 Training data table

```sql
create materialized view reranker_training_view as
select
    -- Group key
    rs.query_id,
    rs.created_at as query_timestamp,
    
    -- Candidate features (encoded)
    rs.feature_vector,                  -- jsonb of 17 floats
    
    -- Label
    coalesce(
        case lv.verdict
            when 'VALID'     then 1.0
            when 'NEAR_MISS' then 0.6
            when 'TOO_EARLY' then 0.4
            when 'TOO_LATE'  then 0.3
            when 'INVALID'   then 0.0
        end,
        case lo.auto_verdict
            when 'HIT'     then 1.0
            when 'EXPIRED' then 0.5
            when 'MISS'    then 0.0
        end,
        0.3  -- fallback (bootstrap, neutral)
    ) as label,
    
    -- Source (for reweighting)
    case
        when lv.verdict_id is not null then 'user'
        when lo.outcome_id is not null then 'auto'
        else 'bootstrap'
    end as label_source,
    
    -- Feature mapping
    rs.candidate_id,
    rs.symbol,
    rs.pattern_id
from reranker_scoring_log rs
left join ledger_verdicts lv on lv.entry_id = rs.linked_entry_id
left join ledger_outcomes lo on lo.entry_id = rs.linked_entry_id;
```

### 3.5 Data volume targets

| Stage | User verdicts | Auto verdicts | Bootstrap | 모델 단계 |
|---|---|---|---|---|
| **Day-1** | 0 | 0 | 0 | **No model. Stage 2 통과** |
| **Week 4** | 5-10 | 50-100 | 200-500 | **Bootstrap-only LightGBM (shadow)** |
| **Week 6** | 20-30 | 100-200 | 500-1k | **Mixed labels (shadow)** |
| **Week 9** | 50+ | 200+ | 1k+ | **Promotion candidate (`07 §5.2` Slice 9 precondition)** |
| **Week 12** | 150+ | 500+ | 2k+ | **Production (replaces Stage 2 sole ranking)** |

`07 §2 Slice 9`의 "50+ verdicts" 정합.

---

## 4. Train / Val / Test Split

### 4.1 분할 방법: **Time-based**

```
| training data: query_timestamp ≤ T-30d                |
| validation:    T-30d < query_timestamp ≤ T-7d         |
| test:          T-7d < query_timestamp ≤ T (most recent)|
```

**왜 time-based:**
- Random split = data leakage (같은 user, 같은 pattern, 다른 시점)
- 패턴 시장 regime 따라 변함. 시간 leak 방치하면 prod에서 깨짐
- LambdaRank의 query group이 시간 인접하므로 random split 시 group이 잘림

### 4.2 분할 비율 (data 누적 단계별)

| 누적 query | Train | Val | Test |
|---|---|---|---|
| 50 | 30 | 10 | 10 |
| 200 | 140 | 30 | 30 |
| 500+ | 70% | 15% | 15% |

**Test set은 lock-in.** 새 모델 비교용으로만 사용. Train/val에 사용 금지.

### 4.3 Cross-validation (data > 200)

Time-series CV:
```python
from sklearn.model_selection import TimeSeriesSplit

tscv = TimeSeriesSplit(n_splits=5, test_size=20)
for fold, (train_idx, val_idx) in enumerate(tscv.split(query_groups)):
    train_groups = [query_groups[i] for i in train_idx]
    val_groups = [query_groups[i] for i in val_idx]
    # train and eval per fold
```

### 4.4 Group integrity

**같은 query_id의 candidates는 절대 train/val 분리 금지.** Query 단위로 split:

```python
def split_by_query_time(queries, train_until, val_until):
    train = [q for q in queries if q.timestamp <= train_until]
    val   = [q for q in queries if train_until < q.timestamp <= val_until]
    test  = [q for q in queries if q.timestamp > val_until]
    return train, val, test
```

---

## 5. LightGBM 학습

### 5.1 Hyperparameters (Day-1 baseline)

```python
LGBM_PARAMS_BASELINE = {
    "objective": "lambdarank",
    "metric": ["ndcg"],
    "ndcg_at": [5, 10],
    
    # Tree structure
    "num_leaves": 31,                   # default
    "max_depth": -1,                    # no limit
    "min_data_in_leaf": 20,             # smoothing for sparse data
    
    # Learning
    "learning_rate": 0.05,
    "num_iterations": 200,              # early stopping enabled
    
    # Regularization
    "lambda_l1": 0.1,
    "lambda_l2": 0.1,
    "feature_fraction": 0.9,            # 17 → ~15 features per tree
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    
    # Misc
    "verbose": -1,
    "force_col_wise": True,             # 17 features small, col-wise faster
    "seed": 42,
}
```

### 5.2 Hyperparameter tuning (data > 200)

**Optuna grid (Phase 2):**
```python
SEARCH_SPACE = {
    "num_leaves":       trial.suggest_int("num_leaves", 15, 63),
    "max_depth":        trial.suggest_int("max_depth", 3, 10),
    "learning_rate":    trial.suggest_loguniform("learning_rate", 0.01, 0.1),
    "min_data_in_leaf": trial.suggest_int("min_data_in_leaf", 10, 50),
    "lambda_l1":        trial.suggest_loguniform("lambda_l1", 1e-3, 1.0),
    "lambda_l2":        trial.suggest_loguniform("lambda_l2", 1e-3, 1.0),
    "feature_fraction": trial.suggest_uniform("feature_fraction", 0.5, 1.0),
}
```

100 trials, 5-fold CV. **시간:** 100 × 5 × 30s ≈ 4시간.

### 5.3 Training loop

```python
import lightgbm as lgb

def train_reranker(
    train_groups: list[QueryGroup],
    val_groups: list[QueryGroup],
    params: dict,
) -> lgb.Booster:
    X_train, y_train, group_train = encode_groups(train_groups)
    X_val, y_val, group_val = encode_groups(val_groups)
    
    train_data = lgb.Dataset(
        X_train,
        label=y_train,
        group=group_train,
    )
    val_data = lgb.Dataset(
        X_val,
        label=y_val,
        group=group_val,
        reference=train_data,
    )
    
    model = lgb.train(
        params,
        train_data,
        valid_sets=[val_data],
        valid_names=["val"],
        callbacks=[
            lgb.early_stopping(stopping_rounds=20),
            lgb.log_evaluation(period=10),
        ],
    )
    return model

def encode_groups(groups: list[QueryGroup]):
    X = np.vstack([encode_features(c.features) for g in groups for c in g.candidates])
    y = np.array([c.label for g in groups for c in g.candidates], dtype=np.float32)
    group_sizes = np.array([len(g.candidates) for g in groups], dtype=np.int32)
    return X, y, group_sizes
```

### 5.4 Class weighting (imbalanced labels 해결)

INVALID:VALID = 95:5 같은 imbalance에서 lambdarank 성능 저하. **Sample weight:**

```python
def compute_sample_weights(labels, source):
    """
    User verdict labels: weight 1.0
    Auto verdict labels: weight 0.5 (less reliable)
    Bootstrap labels: weight 0.2 (least reliable)
    """
    weights = np.ones_like(labels)
    weights[source == 'auto'] = 0.5
    weights[source == 'bootstrap'] = 0.2
    return weights

train_data = lgb.Dataset(X_train, label=y_train, group=group_train, weight=weights_train)
```

### 5.5 Early stopping

`stopping_rounds=20` on val NDCG@5. 200 iterations cap.

**Reasoning:** 적은 데이터에서 200 rounds 다 돌면 overfit. Val 향상 없으면 일찍 멈춤.

---

## 6. Calibration

### 6.1 Why calibration

LightGBM raw score는 **unbounded**. UI에서 "82% 유사도"로 보여주려면 [0, 1] probability 필요.

### 6.2 Isotonic Regression (선택)

```python
from sklearn.isotonic import IsotonicRegression

def fit_calibrator(model, val_groups):
    """Fit on val set, NOT train set (avoid leakage)."""
    X_val, y_val, _ = encode_groups(val_groups)
    raw_scores = model.predict(X_val)
    
    calibrator = IsotonicRegression(
        out_of_bounds='clip',
        y_min=0.0,
        y_max=1.0,
    )
    calibrator.fit(raw_scores, y_val)
    return calibrator

def predict_calibrated(model, calibrator, X_test):
    raw = model.predict(X_test)
    return calibrator.transform(raw)
```

### 6.3 Calibration data leakage 방지

**3-way split 필수:**

```
Train (model fit)        →  X_train, y_train
Val (calibration fit)    →  X_val, y_val   ← Isotonic 학습
Test (final eval)        →  X_test, y_test ← 모델 + calibrator 평가
```

같은 데이터로 model + calibrator 학습 시 calibration이 학습 데이터 분포 외워서 prod에서 깨짐.

### 6.4 Calibration validation

**Reliability diagram (10 bins):**

```python
def reliability_curve(prob_pred, y_true, n_bins=10):
    bin_edges = np.linspace(0, 1, n_bins + 1)
    bin_centers = (bin_edges[:-1] + bin_edges[1:]) / 2
    
    bin_means = []
    bin_actuals = []
    for i in range(n_bins):
        mask = (prob_pred >= bin_edges[i]) & (prob_pred < bin_edges[i+1])
        if mask.sum() > 0:
            bin_means.append(prob_pred[mask].mean())
            bin_actuals.append(y_true[mask].mean())
    return bin_means, bin_actuals
```

Diagonal에 가까우면 well-calibrated. 떨어지면 isotonic 부족 → Platt scaling 시도.

**Acceptance:** ECE (Expected Calibration Error) < 0.10.

---

## 7. Negative Sampling

### 7.1 Problem

각 query에 candidate 20-50. 그 중 valid (label > 0.5) 비율 보통 10-30%. **Imbalance 문제 + 진짜 hard negative 부족.**

### 7.2 Active hard negative mining

```python
def mine_hard_negatives(
    candidates: list[Candidate],
    current_model: lgb.Booster,
    target_ratio: float = 2.0,  # negative:positive
) -> list[Candidate]:
    """
    Negative 중에서 model이 잘못 score한 것 (false positive 후보) 추출.
    """
    pos = [c for c in candidates if c.label > 0.5]
    neg = [c for c in candidates if c.label <= 0.5]
    
    if not neg:
        return pos
    
    # Score all negatives, sort by predicted score (high score = model 잘못 봄)
    neg_scores = current_model.predict(np.vstack([encode_features(c.features) for c in neg]))
    neg_with_score = list(zip(neg, neg_scores))
    neg_with_score.sort(key=lambda x: x[1], reverse=True)
    
    n_negatives = min(int(len(pos) * target_ratio), len(neg))
    hard_negatives = [c for c, _ in neg_with_score[:n_negatives]]
    return pos + hard_negatives
```

### 7.3 Negative sources (`03 §8` 정합)

```python
@dataclass
class NegativeSource:
    type: Literal["hard_negative", "near_miss", "fake_hit", "auto_miss"]
    weight_in_training: float

NEGATIVE_SOURCES = {
    "hard_negative": NegativeSource("hard_negative", 1.0),    # feature similar but MISS
    "near_miss":     NegativeSource("near_miss", 0.8),        # phase similar but mid-fail
    "fake_hit":      NegativeSource("fake_hit", 1.2),         # auto HIT but user INVALID (강한 신호)
    "auto_miss":     NegativeSource("auto_miss", 0.5),        # 그냥 MISS (weak)
}
```

### 7.4 Sampling ratio

**Per-query 비율:**
```
positive : hard_negative : near_miss : random = 1 : 1.5 : 0.5 : 1
```

예: positive 4개 query → hard_neg 6, near_miss 2, random 4 → 총 16 candidate.

**근거:** 
- hard_negative > positive: model이 가장 헷갈리는 케이스 우선 학습
- near_miss < positive: 너무 많으면 boundary 흐려짐
- random: regularization (overfit hard negative만 외우는 거 방지)

---

## 8. Evaluation Metrics

### 8.1 Primary: NDCG@5

```python
def ndcg_at_k(predictions, labels, group_sizes, k=5):
    """
    predictions: model output, sorted by score within each group
    labels: ground truth relevance
    group_sizes: candidates per query
    """
    ndcg_scores = []
    offset = 0
    for size in group_sizes:
        group_pred = predictions[offset:offset+size]
        group_label = labels[offset:offset+size]
        
        # Sort by predicted score, take top-k
        sorted_idx = np.argsort(group_pred)[::-1][:k]
        top_k_labels = group_label[sorted_idx]
        
        dcg = sum(rel / np.log2(i + 2) for i, rel in enumerate(top_k_labels))
        ideal = sorted(group_label, reverse=True)[:k]
        idcg = sum(rel / np.log2(i + 2) for i, rel in enumerate(ideal))
        
        ndcg_scores.append(dcg / idcg if idcg > 0 else 0.0)
        offset += size
    
    return np.mean(ndcg_scores)
```

**Target:** Test set NDCG@5 ≥ 0.65 (Slice 9 precondition).

### 8.2 Secondary: NDCG@10, MRR, Precision@5

```python
def mean_reciprocal_rank(predictions, labels, group_sizes):
    """Position of first relevant (label > 0.5) candidate."""
    mrrs = []
    offset = 0
    for size in group_sizes:
        group_pred = predictions[offset:offset+size]
        group_label = labels[offset:offset+size]
        sorted_idx = np.argsort(group_pred)[::-1]
        for i, idx in enumerate(sorted_idx):
            if group_label[idx] > 0.5:
                mrrs.append(1.0 / (i + 1))
                break
        else:
            mrrs.append(0.0)
        offset += size
    return np.mean(mrrs)

def precision_at_k(predictions, labels, group_sizes, k=5):
    """Top-k 중 label > 0.5 비율."""
    precisions = []
    offset = 0
    for size in group_sizes:
        sorted_idx = np.argsort(predictions[offset:offset+size])[::-1][:k]
        relevant = sum(1 for idx in sorted_idx if labels[offset + idx] > 0.5)
        precisions.append(relevant / k)
        offset += size
    return np.mean(precisions)
```

### 8.3 Baseline 정의

**Baseline = Sequence matcher only (Stage 2 단독, no reranker).**

```python
def baseline_ranking(candidates):
    """Stage 2 sequence_score 단독 정렬."""
    return sorted(candidates, key=lambda c: c.sequence_score, reverse=True)
```

**Reranker 모델은 baseline보다 NDCG@5 +0.05 이상 향상해야 promotion.**

`07 §5.2` 정합.

### 8.4 Metric reporting

```python
@dataclass
class EvalMetrics:
    ndcg_at_5: float
    ndcg_at_10: float
    mrr: float
    precision_at_5: float
    ece: float                              # calibration error
    n_queries: int
    n_candidates: int
    label_distribution: dict[str, int]      # {VALID: 30, INVALID: 200, ...}
    feature_importances: dict[str, float]   # top 10
```

매 학습 후 자동 생성. DB `reranker_eval_log` 테이블에 저장.

---

## 9. Versioning & Storage

### 9.1 Model registry

```sql
reranker_models (
    model_id           uuid primary key,
    version            int not null unique,    -- v1, v2, ...
    pattern_family     text,                   -- nullable: NULL = cross-family
    
    -- Artifacts (S3/R2 URI)
    model_uri          text not null,           -- LightGBM .txt
    calibrator_uri     text,                    -- pickled IsotonicRegression
    feature_schema     jsonb not null,         -- 17 features definition
    
    -- Training metadata
    train_data_hash    text,                    -- query_ids hash
    train_size         int,
    val_size           int,
    test_size          int,
    hyperparams        jsonb,
    
    -- Eval results
    eval_metrics       jsonb,                   -- EvalMetrics serialized
    baseline_metrics   jsonb,                   -- Stage 2 baseline 비교
    promotion_eligible boolean,
    
    -- Lifecycle
    created_at         timestamptz default now(),
    shadow_started_at  timestamptz,             -- shadow mode 진입
    promoted_at        timestamptz,             -- prod 활성
    deprecated_at      timestamptz              -- 후속 모델로 대체
)

create index on reranker_models (pattern_family, promoted_at desc);
```

### 9.2 Per-pattern vs cross-family decision

**Day-1 ~ Week 12: Single cross-family model.**
- 데이터 부족 시 family별 분할 → 각 모델 데이터 < 30 query → overfit

**Week 12 이후 (data > 1k per family):**
- Per-pattern_family model
- `pattern_family` 컬럼으로 라우팅
- Fallback: cross-family model

**Promotion gate:** Per-family 모델이 cross-family보다 NDCG@5 +0.03 이상 향상 시에만.

---

## 10. Promotion Gate

### 10.1 Shadow → Production 절차

```
Stage 1: Shadow mode (7 days)
  ├── Production response = current_model
  ├── Shadow compute = new_model (logged, not exposed)
  ├── Compare metrics 매일
  └── Pass if 7-day rolling NDCG@5 (new) ≥ NDCG@5 (current) + 0.05

Stage 2: A/B test (3 days, 10% traffic)
  ├── 90% users → current
  ├── 10% users → new
  ├── Compare CTR, dwell time, verdict rate
  └── Pass if no regression > 5% on user metrics

Stage 3: Gradual rollout (4 days)
  ├── Day 1: 25% → new
  ├── Day 2: 50% → new
  ├── Day 3: 75% → new
  └── Day 4: 100% → new

Stage 4: Deprecate old model (T+30d)
  └── Keep artifact in registry for rollback
```

### 10.2 Acceptance gate (모든 조건 만족)

| Metric | Threshold |
|---|---|
| NDCG@5 (test set) | ≥ baseline + 0.05 |
| NDCG@10 (test set) | ≥ baseline + 0.03 (regression 없음) |
| Precision@5 | ≥ 60% |
| ECE | < 0.10 |
| Latency p99 | < 100ms (`03 §11`) |
| Shadow NDCG@5 7-day rolling | ≥ baseline + 0.05 |

`03 §11` Stage 3 latency 100ms 정합.

### 10.3 Auto rollback trigger

Production 활성 후 3일 이내 다음 발생 시 자동 rollback:

```python
ROLLBACK_TRIGGERS = {
    "ndcg5_drop":              "current vs prev 1-day NDCG@5 < -0.10",
    "verdict_rate_drop":       "1-day verdict_rate < 0.7 × prev avg",
    "user_complaint_spike":    "1-day complaint count > 3× prev avg",
    "latency_p99_breach":      "p99 > 200ms for 30+ min",
    "feature_corruption":      "feature schema mismatch > 1% requests",
}
```

Rollback = registry에서 `promoted_at` desc로 second 모델 활성. 5초 내 완료.

---

## 11. Online / Continuous Learning

### 11.1 Training cadence

```
Day-1 ~ Week 4:  No model (Stage 2 only)
Week 4:          First bootstrap-only model (shadow)
Week 5+:         매일 야간 재학습 (data 누적 시)
Week 9+:         주간 학습 + monthly hyperparameter tuning
Week 12+ stable: 주간 학습 + quarterly hyperparameter tuning
```

### 11.2 Trigger 조건

```python
def should_retrain():
    new_user_verdicts = count_verdicts_since(last_train_at)
    new_outcomes = count_outcomes_since(last_train_at)
    
    if new_user_verdicts >= 20:
        return True   # 새 user signal 충분
    if new_outcomes >= 100:
        return True   # auto label 충분
    
    days_since_last = (now - last_train_at).days
    if days_since_last >= 7:
        return True   # 정기 재학습
    
    return False
```

### 11.3 Training job

```python
@scheduled(cron="0 2 * * *")  # 매일 새벽 2시
def reranker_retrain_job():
    if not should_retrain():
        log("skip: no significant new data")
        return
    
    queries = load_queries_for_training(window_days=180)
    if len(queries) < 50:
        log("skip: insufficient queries")
        return
    
    train, val, test = split_by_query_time(queries, ...)
    
    model = train_reranker(train, val, LGBM_PARAMS_BASELINE)
    calibrator = fit_calibrator(model, val)
    
    metrics = evaluate(model, calibrator, test, baseline=baseline_ranking)
    save_to_registry(model, calibrator, metrics)
    
    if metrics.promotion_eligible:
        enter_shadow_mode(model)
```

### 11.4 Concept drift 감지

Market regime 변하면 옛 데이터 valid → invalid. **Drift 모니터링:**

```python
def detect_drift():
    """30일 NDCG@5 vs 90일 평균. -0.05 이상 drop이면 alert."""
    recent_ndcg = rolling_ndcg(window_days=30)
    historical_ndcg = rolling_ndcg(window_days=90)
    
    if recent_ndcg < historical_ndcg - 0.05:
        emit_alert("reranker_drift_detected")
        # Force immediate retrain with recent-weighted data
```

---

## 12. Failure Modes

### 12.1 Imbalanced labels

| 조건 | 증상 | 대응 |
|---|---|---|
| INVALID > 95% | Model이 모두 INVALID 예측 | Class weight + minority oversampling |
| User verdict < 10 / week | 학습 중단 | Bootstrap labels 비중 ↑ |
| One pattern_family dominates | Cross-family model이 minority family 무시 | Per-family fallback (§9.2) |

### 12.2 Feature corruption

```python
def validate_feature_vector(fv: np.ndarray) -> bool:
    if len(fv) != 17:
        return False
    if np.any(np.isnan(fv)):
        return False
    if np.any(np.isinf(fv)):
        return False
    return True

# Pipeline에서:
if not validate_feature_vector(features):
    log_error(...)
    return baseline_ranking(candidate)  # graceful fallback
```

### 12.3 Latency breach

```python
@timeout(seconds=0.1)  # 100ms
def rerank_with_timeout(model, candidates):
    try:
        return model.predict(...)
    except TimeoutError:
        return baseline_scores(candidates)
```

100ms 초과 시 baseline 반환. Alert 발생.

### 12.4 Cold start failure (Week 4)

50 query 미만이면 학습 자체 안 됨:
```python
if len(train_queries) < 50:
    log("Insufficient data for training. Falling back to Stage 2 only.")
    return None
```

NOW.md (Week 4)에 "reranker not yet active" 명시.

---

## 13. Performance Budget

### 13.1 Inference latency

| Operation | Target | Limit |
|---|---|---|
| Feature encoding (17 floats) | < 1ms | 5ms |
| LightGBM predict (50 candidates) | < 30ms | 100ms |
| Calibration (Isotonic) | < 5ms | 20ms |
| **Total Stage 3** | **< 50ms** | **100ms** |

`03 §11` Stage 3 100ms 정합.

### 13.2 Training latency

| Data size | Train time |
|---|---|
| 50 queries | < 1 min |
| 500 queries | < 5 min |
| 5000 queries | < 30 min |

야간 재학습 budget < 1시간.

### 13.3 Model size

| Component | Size |
|---|---|
| LightGBM .txt | < 5MB (200 trees × 17 features) |
| Calibrator pickle | < 100KB |
| Feature schema | < 10KB |

S3/R2 storage 비용 무시 가능.

---

## 14. Build Tasks (Slice 9)

`07 §2 Slice 9`의 sub-tasks:

```
Week 9 (Slice 9 Day 1-3):
[ ] 1. engine/search/reranker/types.py
       - RankFeatures dataclass
       - QueryGroup, RankPrediction
       - EvalMetrics

[ ] 2. engine/search/reranker/encoder.py
       - encode_features() (17-dim)
       - validate_feature_vector()
       - missing value handling

[ ] 3. engine/search/reranker/dataset.py
       - reranker_training_view materialized view
       - load_queries_for_training()
       - split_by_query_time()
       - bootstrap_label() heuristic

Week 9 Day 4-7:
[ ] 4. engine/search/reranker/train.py
       - train_reranker() with LightGBM
       - LGBM_PARAMS_BASELINE
       - sample weights
       - early stopping

[ ] 5. engine/search/reranker/calibrate.py
       - fit_calibrator() Isotonic
       - reliability_curve()
       - ECE computation

[ ] 6. engine/search/reranker/eval.py
       - ndcg_at_k, mean_reciprocal_rank
       - precision_at_k
       - baseline_ranking comparison

Week 10 Day 1-4:
[ ] 7. engine/search/reranker/registry.py
       - reranker_models table CRUD
       - shadow_mode entry/exit
       - promotion_gate() validation

[ ] 8. engine/search/reranker/inference.py
       - load_active_model()
       - rerank() with timeout
       - graceful fallback to baseline

[ ] 9. tools/reranker_train_job.py
       - Scheduled training (cron)
       - should_retrain() logic
       - Drift detection

Week 10 Day 5-7:
[ ] 10. tests/test_reranker_*.py
        - encoder unit tests
        - training reproducibility
        - calibration eval
        - rollback trigger
```

**예상 시간:** 작업 1-3 → 1.5일. 4-6 → 2일. 7-9 → 1.5일. 10 → 1일. 총 6일.

---

## 15. Open Questions

| 질문 | 언제 해결 |
|---|---|
| Per-user reranker 필요한가? (Pro tier 차별화) | Phase 2+ (Slice 10 Personal Variants) |
| LLM judge (Stage 4)와 reranker score 충돌 시 누가 이김? | Slice 12 |
| Auto verdict와 user verdict disagreement (HIT but INVALID) 학습 신호로 어떻게? | 50+ disagreement 누적 시 |
| Cross-family transfer learning (oi_reversal로 학습된 모델이 funding_squeeze에 도움)? | Phase 3+ |
| Ranking vs Classification 둘 다 학습? | Data > 5k 후 ablation |

---

## 16. Non-Goals

- Per-user fine-tuning (Phase 2+ Slice 10)
- LightGBM 외 다른 ranker (XGBoost는 거의 동일, neural은 데이터 부족)
- Multi-task learning (entry score + reranker 동시) — 분리 유지 (`00 §6.1`)
- Embedding-based retrieval — 그건 Stage 1 candidate gen
- Real-time online gradient update (배치 학습으로 충분)

---

## 17. Acceptance Criteria — Slice 9 진입 가능 조건

```
[ ] User verdicts ≥ 50 누적 (Slice 8 완료 결과)
[ ] reranker_training_view materialized view 동작
[ ] Bootstrap label 생성 가능 (auto_verdict + heuristic)
[ ] LightGBM env 셋업 (engine-api Python 3.12 lightgbm package)
[ ] Reranker model registry 테이블 마이그레이션 완료
[ ] Time-based split 함수 구현
[ ] Baseline ranking (sequence_score 단독) 비교 가능
```

---

## 18. Acceptance Criteria — Production 활성 조건

```
[ ] Test set NDCG@5 ≥ baseline + 0.05
[ ] Test set NDCG@10 regression 없음 (≥ baseline)
[ ] Precision@5 ≥ 60%
[ ] ECE < 0.10
[ ] Inference p99 latency < 100ms
[ ] Shadow mode 7일, 일별 NDCG@5 ≥ baseline + 0.03
[ ] Rollback trigger 기능 검증 완료
[ ] A/B test 3일 (10% traffic), regression 없음
```

이 8개 통과 시 100% rollout 가능.

---

*Reranker Training Spec v1.0 | 2026-04-25 | `03_SEARCH_ENGINE.md` §5의 완전 구체화. Slice 9 build precondition.*
