# 03 — Search Engine (4-Stage Pipeline)

**Owner:** Research Core
**Depends on:** `01_PATTERN_OBJECT_MODEL.md`, `02_ENGINE_RUNTIME.md`

## 0. 왜 검색이 가장 어려운가

경쟁 제품(Surf, CoinGlass, Hyblock)은 **데이터 요약**은 강해도 **sequence 기반 검색**은 하지 않는다. "이거랑 비슷한 패턴 찾아줘"가 핵심 가치고, 이건 4단 파이프라인 없이는 못 만든다.

---

## 1. 전체 파이프라인

```
User Intent (자연어 또는 capture range)
  │
  ▼
┌──────────────────────────────────┐
│ Stage 0. Intent Classifier       │  AI (cheap)
│  → WHY/STATE/COMPARE/SEARCH/...  │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│ Stage 1. Candidate Generation    │  SQL hard filter
│  → top 100–500                   │  pgvector optional
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│ Stage 2. Sequence Matching       │  custom DP / phase-path edit distance
│  → top 20–50                     │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│ Stage 3. Reranker (LightGBM)     │  supervised on user judgments
│  → top 5–10                      │
└──────────────────────────────────┘
  │
  ▼
┌──────────────────────────────────┐
│ Stage 4. [Optional] LLM Judge    │  Claude/GPT on top 3–5
│  → final ranked + explanation    │
└──────────────────────────────────┘
```

각 단계는 입력 수를 **10분의 1로 줄인다**. 한 단계라도 생략하면 전체 품질 붕괴.

---

## 2. Stage 0 — Intent Classifier

자세한 intent table은 `05_VISUALIZATION_ENGINE.md` §2 참조.

검색 경로 intent는 4개:
- `SEARCH` — "비슷한 거 찾아줘"
- `COMPARE` — "TRADOOR랑 비교"
- `STATE` — "지금 이 심볼 뭐냐"
- `FLOW` — "OI 흐름 비슷한 거"

WHY/EXECUTION은 검색을 유발하지 않고 현재 심볼에 대한 시각화만 바꾼다.

### 2.1 Classifier 구현

```python
@dataclass
class IntentClassification:
    intent: Literal["WHY", "STATE", "COMPARE", "SEARCH", "FLOW", "EXECUTION"]
    confidence: float
    target_symbol: str | None
    target_timeframe: str | None
    reference_pattern: str | None         # COMPARE 시
    reference_capture_id: str | None
    extra_signals: list[str]              # parser가 뽑은 signal ids
```

LLM parser (§ `04_AI_AGENT_LAYER.md` §2)가 이걸 생성. 실패 시 default = SEARCH.

---

## 3. Stage 1 — Candidate Generation

### 3.1 목적

전체 검색 공간(`300 symbols × 1 year × 4 timeframes ≈ 수백만 window`)을 **1차로 거른다**. 여기서 정확성보다 **recall**이 중요. Precision은 뒤 단계들이 처리.

### 3.2 Input

```python
@dataclass
class SearchQuerySpec:
    pattern_family: str | None
    timeframe: str
    phase_path: list[str]                  # e.g. ["real_dump", "accumulation", "breakout"]
    must_have_signals: list[str]
    preferred_timeframes: list[str]
    exclude_patterns: list[str]
    similarity_focus: list[str]            # ["sequence", "oi_behavior", "funding_transition"]
    symbol_scope: list[str] = field(default_factory=list)   # 제한 시
    lookback_days: int = 365
```

### 3.3 SQL Hard Filter

```sql
-- feature_windows 테이블 가정
-- (symbol, timeframe, window_end_ts, {oi_spike_flag, higher_low_count, ...})

with signal_met as (
  select
    symbol, timeframe, window_end_ts, features
  from feature_windows
  where timeframe = any(:preferred_timeframes)
    and window_end_ts > now() - (:lookback_days * interval '1 day')
    and (
      -- must_have_signals 모두 만족
      (features->>'oi_spike_flag')::bool = true
      and (features->>'higher_low_count')::int >= 2
      -- ... 동적 생성
    )
)
select * from signal_met
limit 500;
```

### 3.4 Why SQL first (not vector)

- pgvector로 모든 feature window을 검색하면 false positive 폭증
- 사람이 정한 hard filter가 **recall이 더 높다**
- 벡터는 stage 2로 내려야 효과적

### 3.5 pgvector as boosting (선택적)

Stage 1이 너무 많이 걸러내면 (e.g. 500개 미달 시):

```python
# Relax filter → add vector similarity to broader pool
supplementary = pgvector_search(
    table="feature_window_embeddings",
    query_vec=embed(query_features),
    k=200,
    filter={"timeframe": spec.timeframe}
)
candidates = sql_filtered ∪ supplementary
```

Embedding은 28-feature normalized vector. Embedding compute는 feature write 시점에 precompute.

---

## 4. Stage 2 — Sequence Matching

**이게 가장 핵심이고 가장 차별화된다.**

### 4.1 문제

Query: `[fake_dump, real_dump, accumulation, breakout]`

Candidates:
- A: `[fake_dump, real_dump, accumulation, breakout]` → 완전 일치
- B: `[real_dump, accumulation, breakout]` → fake_dump 생략
- C: `[fake_dump, real_dump, accumulation]` → breakout 없음
- D: `[real_dump, breakout]` → accumulation skip (위험)
- E: `[fake_dump, real_dump, accumulation, fresh_low, accumulation, breakout]` → noisy

어떻게 점수화할 것인가.

### 4.2 Phase-Path Edit Distance

```python
def phase_path_similarity(
    query_path: list[str],
    candidate_path: list[str],
    phase_weights: dict[str, float] | None = None,
) -> float:
    """
    Modified Levenshtein with:
    - insertion penalty (0.15): extra phases candidate 가 가짐
    - deletion penalty (0.4): query 에 있는 phase candidate 에 없음
    - substitution penalty (1.0): 다른 phase
    - ordering violation penalty (0.5): phase 순서 뒤바뀜
    
    Returns similarity in [0, 1].
    """
    phase_weights = phase_weights or {}
    dp = [[0.0] * (len(candidate_path) + 1) for _ in range(len(query_path) + 1)]
    
    for i in range(len(query_path) + 1):
        dp[i][0] = i * 0.4   # deletion cost
    for j in range(len(candidate_path) + 1):
        dp[0][j] = j * 0.15  # insertion cost
    
    for i in range(1, len(query_path) + 1):
        for j in range(1, len(candidate_path) + 1):
            if query_path[i-1] == candidate_path[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                cost = phase_weights.get(query_path[i-1], 1.0)
                dp[i][j] = min(
                    dp[i-1][j] + 0.4 * cost,   # deletion
                    dp[i][j-1] + 0.15,          # insertion
                    dp[i-1][j-1] + 1.0 * cost, # substitution
                )
    
    max_possible = max(len(query_path), len(candidate_path)) * 1.0
    distance = dp[len(query_path)][len(candidate_path)]
    return max(0.0, 1.0 - distance / max_possible)
```

`phase_weights`로 critical phase(REAL_DUMP 등)를 무겁게. pattern definition의 `importance` 필드가 곧 weight.

### 4.3 Duration-Aware Score

Phase 순서만 맞으면 안 됨. 머무른 시간도 봐야 함.

```python
def duration_similarity(
    query_durations: dict[str, int],    # {phase_id: bars}
    candidate_durations: dict[str, int],
    tolerance: float = 0.5,
) -> float:
    """
    log-ratio 기반. 2배 차이면 0.5, 동일하면 1.0.
    """
    scores = []
    for phase_id, q_dur in query_durations.items():
        c_dur = candidate_durations.get(phase_id, 0)
        if c_dur == 0:
            scores.append(0.0)
        else:
            log_ratio = abs(math.log(q_dur / c_dur))
            scores.append(math.exp(-log_ratio / tolerance))
    return sum(scores) / len(scores) if scores else 0.0
```

### 4.4 Combined Sequence Score

```python
sequence_score = (
    0.6 * phase_path_similarity(q, c) +
    0.3 * duration_similarity(q, c) +
    0.1 * direction_match(q, c)    # long/short 일치
)
```

### 4.5 Forbidden Signal Check

Candidate path에 query가 `exclude_patterns`에 명시한 phase가 있으면:
```python
if any(p in candidate_path for p in spec.exclude_patterns):
    sequence_score *= 0.2   # heavy penalty, not hard exclude
```

완전 exclude가 아니라 penalty인 이유: 유저가 near-miss를 보고 싶어할 수 있음.

---

## 5. Stage 3 — Reranker (LightGBM)

### 5.1 Feature Set for Ranking

Stage 2가 준 top 20~50 candidate 각각에 대해:

```python
@dataclass
class RankFeatures:
    # similarity metrics
    phase_path_sim: float
    duration_sim: float
    feature_vec_sim: float          # cosine on normalized features
    
    # absolute candidate quality
    peak_return_pct: float | None   # ledger outcome 있을 시
    hit_rate_for_family: float
    regime_match: float              # BTC regime similarity
    
    # phase completeness
    phase_reached_max: int
    current_phase_index: int
    breakout_confirmed: bool
    
    # negative signals
    forbidden_signals_hit: int
    failed_candidate_history: int    # 같은 symbol의 최근 MISS 수
    
    # recency
    days_since_pattern: float
    is_current_live: bool            # 지금 actionable?
```

### 5.2 Training Data

```
label = user_verdict from ledger_verdicts
  VALID    → 1.0
  NEAR_MISS → 0.6
  TOO_EARLY → 0.4
  TOO_LATE  → 0.3
  INVALID  → 0.0
```

학습 데이터가 부족하면 (bootstrap):
```
label = auto_verdict
  HIT      → 1.0
  EXPIRED  → 0.5
  MISS     → 0.0
```

50+ user verdict 이후 supervised로 전환.

### 5.3 LightGBM Ranker

```python
import lightgbm as lgb

params = {
    "objective": "lambdarank",
    "metric": ["ndcg"],
    "ndcg_at": [5, 10],
    "num_leaves": 31,
    "learning_rate": 0.05,
    "min_data_in_leaf": 20,
    "verbose": -1,
}

train_data = lgb.Dataset(
    X_train,
    label=y_train,
    group=group_train,   # 한 query 안의 candidates
)

model = lgb.train(params, train_data, num_boost_round=200, valid_sets=[val_data])
```

Query grouping: 같은 user query에 딸린 candidates = 1 group. NDCG@5를 validation metric으로.

### 5.4 Calibration

LightGBM raw score는 비확률. Platt scaling으로 calibrate:

```python
from sklearn.isotonic import IsotonicRegression
calibrator = IsotonicRegression(out_of_bounds='clip')
calibrator.fit(raw_scores_val, y_val)
prob_win = calibrator.transform(raw_scores_test)
```

---

## 6. Stage 4 — LLM Judge (Optional)

### 6.1 언제 쓰나

- Stage 3 top 5의 reranker score가 비슷할 때 (σ < 0.1)
- 유저가 "설명해줘" 요청
- `SEARCH` intent with `similarity_focus` = "sequence+chart"

기본은 **skip**. Token 비용과 latency (3-8s) 때문에.

### 6.2 Input 구성

```python
def build_judge_input(query_spec, candidate):
    return {
        "query_summary": summarize_query(query_spec),
        "candidate_summary": {
            "symbol": candidate.symbol,
            "timeframe": candidate.timeframe,
            "phase_path_actual": candidate.phase_path,
            "key_features": extract_top_features(candidate),
            "outcome": candidate.ledger_outcome,
        },
        "chart_image": render_chart_png(candidate, width=800),   # optional
    }
```

차트 이미지는 선택. 텍스트만으로도 가능하면 싸게 감.

### 6.3 Structured Output

```json
{
  "similarity": 0.82,
  "reason": "oi behavior and accumulation structure match",
  "main_difference": "breakout timing earlier than reference",
  "confidence": 0.75,
  "novel_insight": null
}
```

JSON mode 강제. 자유 서술 금지.

### 6.4 Judge는 re-rank 불가

Judge는 **설명 생성기**이지 최종 랭킹 결정자가 아니다. Stage 3 순서를 유지하고 설명만 첨부.

(이유: LLM 판정은 재현성 약함. A/B test시 hash collision 유발)

---

## 7. Final Ranking Formula

```python
final_score = (
    0.40 * sequence_score +         # stage 2
    0.40 * reranker_prob +          # stage 3
    0.15 * feature_vec_similarity + # stage 1 보조
    0.05 * llm_judge_similarity     # stage 4, 있을 시
)
```

Weight는 유저별 `similarity_focus`에 따라 shift. 예: `similarity_focus=["oi_behavior"]`면 feature vec 비중 ↑.

---

## 8. Negative Set 관리

Reranker 강화의 핵심.

### 8.1 유형

- `hard_negative`: 같은 feature 조건 충족했는데 MISS
- `near_miss`: phase path 유사 but 중간에 실패
- `fake_hit`: HIT이지만 사용자가 INVALID 판정

### 8.2 저장

```sql
ledger_negatives (
  neg_id       uuid,
  entry_id     uuid references ledger_entries,
  negative_type text,  -- 'hard_negative' | 'near_miss' | 'fake_hit'
  reason       text,
  curated_by   text,
  curated_at   timestamptz
)
```

Curation은 초기에는 수동. Phase 2에서 자동 rule (MISS & high feature_sim → hard_negative 후보).

---

## 9. Benchmark Packs

`multi-timeframe-autoresearch-search.md`의 개념 승계:

```python
@dataclass
class BenchmarkPack:
    pack_id: str
    pattern_family: str
    reference_captures: list[str]   # 정답 케이스들
    holdout_captures: list[str]     # 학습 금지
    evaluation_window_days: int
    score_thresholds: dict          # {"sequence_sim_min": 0.6, ...}
```

Reranker 변경, threshold 조정, 새 variant 발행 전 반드시 pack 평가 통과해야 함.

---

## 10. API Surface

```
POST /api/search/patterns
  body: SearchQuerySpec
  response: {candidates: [...], stats: {stage1_count, stage2_count, ...}}

POST /api/search/similar-to-capture
  body: {capture_id, top_k}
  response: candidates

GET /api/search/benchmark/{pack_id}/run
  response: streaming evaluation result
```

상세 계약은 `06_DATA_CONTRACTS.md`.

---

## 11. Performance Budget

| Stage | Target | Limit |
|---|---|---|
| Stage 0 (intent) | 200ms | 1s |
| Stage 1 (SQL) | 500ms | 2s |
| Stage 2 (sequence) | 200ms | 1s |
| Stage 3 (reranker) | 100ms | 500ms |
| Stage 4 (LLM judge) | 3s | 10s (optional) |
| **Total (no LLM)** | **< 2s** | **5s** |
| **Total (with LLM)** | **< 8s** | **20s** |

Limit 초과 시 cache aggressive, pre-compute window features.

---

## 12. Non-Goals

- End-to-end neural ranker: 데이터 부족
- Real-time sequence matching on raw bars: 너무 비쌈, feature window만
- Cross-asset correlation in ranking: Phase 2+
- 100% recall: precision 우선
