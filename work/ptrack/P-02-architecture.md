# ML Pattern Intelligence — Architecture v1.0

> Track: ML-INTEL | Status: 🟡 Design Draft
> Created: 2026-04-30
> Index: [P-00-master.md](P-00-master.md)

---

## 1. 전체 ML Loop

```
┌──────────────────────────────────────────────────────────────────┐
│  TRAIN                                                           │
│  POST /train → training_service.py → AUC ≥ 0.65 (강화)         │
│    → MODEL_REGISTRY_STORE.register(slug, model_key, "candidate")│
│    → 수동 promote → rollout_state = "active"                    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ MODEL_REGISTRY_STORE.get_preferred_scoring_model(slug)
        ┌──────────────┴──────────────┐
        │                             │
┌───────▼──────────────┐    ┌────────▼─────────────────────┐
│ RESEARCH SCANNER     │    │ LIVE SCANNER                  │
│ scanner.py           │    │ alerts_pattern.py             │
│ predicted_prob =     │    │ ✅ 이미 registry 사용          │
│  engine.predict_     │    │ P_WIN_GATE → threshold_policy │
│   feature_row(snap)  │    └──────────────────────────────┘
│ fallback: 0.6        │
└───────┬──────────────┘
        │ EntrySignal(predicted_prob=실제값)
┌───────▼──────────────────────────┐
│ PIPELINE (pipeline.py)           │
│ Stage 1-5: BH-FDR               │
│ Stage 6: run_paper_verification  │  ← W-0348 ✅
│   → n_trades, win_rate, sharpe   │
│ Stage 7: compute_composite_score │  ← W-0314 ✅
│   → composite 0~100, grade S/A/B/C│
│ → PipelineResult.top_patterns    │
└───────┬──────────────────────────┘
        │ parquet + PipelineResult
┌───────▼──────────────────────────┐
│ API (engine/api/routes/research) │  ← W-0352 NEW
│ GET /research/top-patterns       │
│   ?limit=20&min_grade=B          │
│ → TopPatternResponse[]           │
└───────┬──────────────────────────┘
        │ fetch
┌───────▼──────────────────────────┐
│ FRONTEND                         │  ← W-0353 NEW
│ IntelPanel: TopPatternsPanel     │
│   composite_score DESC 정렬      │
│   quality_grade 배지 S/A/B/C     │
│   paper 메트릭 세부 수치           │
└──────────────────────────────────┘
```

---

## 2. 하드코딩 제거 계획

### 2.1 Research Scanner (W-0358)

```python
# BEFORE: scanner.py:392
predicted_prob=0.6

# AFTER:
from engine.patterns.model_registry import (
    MODEL_REGISTRY_STORE,
    current_definition_id,
    resolve_threshold,
)
from engine.scoring.lightgbm_engine import get_engine

model_ref = MODEL_REGISTRY_STORE.get_preferred_scoring_model(
    combo.name,
    definition_id=current_definition_id(combo.name),
)
if model_ref is not None:
    engine = get_engine(model_ref.model_key)
    p_win = engine.predict_feature_row(feature_snapshot)  # dict → float | None
    if p_win is not None:
        predicted_prob = p_win
        threshold = resolve_threshold(model_ref.threshold_policy_version)
        model_source = "registry"
    else:
        predicted_prob = 0.6   # model not yet trained
        threshold = 0.55
        model_source = "fallback"
else:
    predicted_prob = 0.6   # no registry entry
    threshold = 0.55
    model_source = "fallback"
```

### 2.2 Live Scanner (alerts_pattern.py:43) — W-0358 포함

```python
# BEFORE:
P_WIN_GATE = 0.55

# AFTER: threshold_policy_version 기반 동적 조회
threshold = resolve_threshold(registry_entry.threshold_policy_version)
```

### 2.3 AUC 기준 강화 (training_service.py)

```python
# BEFORE:
_AUTO_PROMOTE_MIN_AUC = 0.60  # 무작위 예측 + 3%

# AFTER:
_AUTO_PROMOTE_MIN_AUC = 0.65  # 통계적 유의성 확보
```

---

## 3. resolve_threshold 설계

```python
# engine/patterns/model_registry.py 신규 추가
_THRESHOLD_POLICY: dict[int, float] = {
    1: 0.55,   # v1 기본
    2: 0.60,   # v2 강화
    3: 0.50,   # v3 recall 최대화
}

def resolve_threshold(policy_version: int, default: float = 0.55) -> float:
    return _THRESHOLD_POLICY.get(policy_version, default)
```

---

## 4. API 스키마

```python
# GET /research/top-patterns?limit=20&min_grade=B
class TopPatternItem(BaseModel):
    pattern_slug: str
    composite_score: float
    quality_grade: str              # S / A / B / C
    n_trades_paper: int | None
    win_rate_paper: float | None
    sharpe_paper: float | None
    max_drawdown_pct_paper: float | None
    expectancy_pct_paper: float | None
    model_source: str | None        # registry / fallback / None

class TopPatternsResponse(BaseModel):
    patterns: list[TopPatternItem]
    generated_at: str | None        # ISO8601 UTC
    pipeline_run_id: str | None
```

---

## 5. Personalization Loop (W-0346/W-0351)

```
verdict(user_id, pattern_slug, context_tag, label)
  → apply_verdict_feedback()
    → per-user weight delta: valid +0.1, invalid -0.2 (clip ±1.0)
    → cold start: n<5 무시, 5≤n<20 half, n≥20 full
  → reranker 다음 호출 시 반영
```

context_tag = f"{symbol}_{timeframe}_{intent}"

---

## 6. 파일 매핑

| 파일 | 변경 | W-# |
|---|---|---|
| `engine/api/routes/research.py` | GET /research/top-patterns 추가 | W-0352 |
| `engine/pipeline.py` | `latest_top_patterns_path()` helper | W-0352 |
| `engine/research/pattern_scan/scanner.py` | predicted_prob, threshold 동적화 | W-0358 |
| `engine/patterns/model_registry.py` | `resolve_threshold()` 추가 | W-0358 |
| `engine/memory/rerank.py` | `apply_verdict_feedback()` 추가 | W-0346 |
| `engine/memory/state_store.py` | per-user weight 저장 | W-0346 |
| `app/src/lib/components/intel/TopPatternsPanel.svelte` | 신규 | W-0353 |
| `app/src/lib/engine/cogochiTypes.ts` | TopPattern 타입 활성화 | W-0353 |
| `app/src/components/cogochi/QuickPanel.svelte` | SECTOR 필터 탭 | W-0347 |
| `app/src/components/terminal/SingleAssetBoard.svelte` | sector 배지 | W-0347 |

---

## 7. 의존 관계

```
W-0348 (✅ 완료) ──→ W-0352 (API 노출) ──→ W-0353 (frontend)
                                   ↑
W-0314 (✅ 완료) ─────────────────┘

MODEL_REGISTRY (기존) ──→ W-0358 (research scanner inference)
                  └──→ alerts_pattern.py threshold 동적화 (W-0358 포함)

W-0341 (배포) ──→ W-0346 (verdict feedback) ──→ W-0347 (sector surface)
```
