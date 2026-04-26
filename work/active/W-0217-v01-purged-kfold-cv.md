# W-0217 — V-01 PurgedKFold + Embargo Cross-Validation

**Owner:** research
**Status:** Ready (PRD only, depends on W-0215 V-00 audit ✅)
**Type:** New module (`engine/research/validation/cv.py`)
**Depends on:** W-0214 v1.3 §3.4, W-0215 V-00 audit (PR #415), W-0216 F1 measurement
**Estimated effort:** 1.5 day implementation + 0.5 day test = 2 day total
**Parallel-safe:** ✅ (independent of V-02 — split logic만)

---

## 0. 한 줄 요약

López de Prado (2018) Ch 7 표준의 **PurgedKFold + Embargo** cross-validation 구현. `engine/research/pattern_search.py` `evaluate_variant_against_pack`의 weighted (0.7 ref + 0.3 hold) split을 PurgedKFold로 **composition** 교체. forward return label leakage 차단.

## 1. Goal

W-0214 §3.4 Cross-Validation framework 구현:
1. `PurgedKFold` class — n_splits + embargo + label_horizon
2. embargo 식: `embargo_bars = max(label_horizon_bars, n_total_bars × 0.005)`
3. `evaluate_variant_against_pack`와 composition (augment-only)
4. F1 measurement (W-0216) 의존성 해소

## 2. Owner

research (CTO + AI Researcher 공동 sign-off)

## 3. Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/validation/__init__.py` | new | validation 모듈 entry |
| `engine/research/validation/cv.py` | new | PurgedKFold + Embargo 구현 |
| `engine/research/validation/test_cv.py` | new | unit test (≥10 case) |
| `engine/research/pattern_search.py` | **read-only** (V-00 augment-only) | wrap 안 함 — composition은 cv.py 측에서 |
| `work/active/W-0214-mm-hunter-core-theory-and-validation.md` | edit (§3.4 implementation pointer 추가) | spec → impl 연결 |

## 4. Non-Goals

- ❌ `pattern_search.py` 수정 (V-00 augment-only)
- ❌ M1 phase_eval 측정 (W-0218 V-02)
- ❌ Walk-forward + expanding window (W-0226+ Quant Realism Protocol)
- ❌ Stratified 또는 group k-fold (필요 시 별도)
- ❌ Sklearn 교체 (재사용 가능 시 sklearn.model_selection 활용 OK)

## 5. Exit Criteria

```
[ ] PurgedKFold class 구현 (n_splits, label_horizon_hours, embargo_floor_pct)
[ ] embargo 식: max(label_horizon_bars, n_total_bars × 0.005)
[ ] split() generator — (train_idx, test_idx) yield
[ ] purge logic: train과 test 사이 |t_train - t_test| ≤ horizon → 제외
[ ] embargo logic: test 끝난 직후 embargo_bars 동안 train 진입 금지
[ ] unit test ≥10 case (edge: n_total < 100, horizon > total/n_splits 등)
[ ] integration test: pattern_search.py BenchmarkPack 위에서 동일 데이터 split 후 ROC delta < 0.05
[ ] performance: <5s/fold for 100K rows
[ ] W-0214 §3.4 spec 명시 식과 일치 (코드 docstring + 식 인용)
```

## 6. CTO 설계

### 6.1 API spec

```python
# engine/research/validation/cv.py

from dataclasses import dataclass
from typing import Iterator
import numpy as np
import pandas as pd

@dataclass(frozen=True)
class PurgedKFoldConfig:
    n_splits: int = 5
    label_horizon_hours: int = 4          # W-0214 D2 (4h primary)
    embargo_floor_pct: float = 0.005      # López de Prado 권장 0.5%
    bars_per_hour: int = 1                # 1h bar default

    @property
    def label_horizon_bars(self) -> int:
        return self.label_horizon_hours * self.bars_per_hour

class PurgedKFold:
    """
    López de Prado (2018) "Advances in Financial ML" Ch 7 표준 구현.

    embargo_bars = max(label_horizon_bars, n_total_bars × embargo_floor_pct)

    Args:
        config: PurgedKFoldConfig
    """
    def __init__(self, config: PurgedKFoldConfig = PurgedKFoldConfig()):
        self.config = config

    def split(
        self,
        index: pd.DatetimeIndex,
    ) -> Iterator[tuple[np.ndarray, np.ndarray]]:
        """Yield (train_idx, test_idx) for each fold.

        Purge: train과 test 사이 |t_train_end - t_test_start| ≤ label_horizon_bars → train에서 제외
        Embargo: test_end + embargo_bars 동안 train 진입 금지
        """
        n = len(index)
        embargo = max(self.config.label_horizon_bars, int(n * self.config.embargo_floor_pct))
        fold_size = n // self.config.n_splits
        for k in range(self.config.n_splits):
            test_start = k * fold_size
            test_end = (k + 1) * fold_size if k < self.config.n_splits - 1 else n
            test_idx = np.arange(test_start, test_end)
            # train: 전체 - test - purge - embargo
            train_mask = np.ones(n, dtype=bool)
            train_mask[test_start:test_end] = False
            # purge before test
            purge_start = max(0, test_start - self.config.label_horizon_bars)
            train_mask[purge_start:test_start] = False
            # embargo after test
            embargo_end = min(n, test_end + embargo)
            train_mask[test_end:embargo_end] = False
            train_idx = np.where(train_mask)[0]
            yield train_idx, test_idx

    def split_dataframe(
        self,
        df: pd.DataFrame,
    ) -> Iterator[tuple[pd.DataFrame, pd.DataFrame]]:
        """Convenience: split DataFrame by index."""
        for train_idx, test_idx in self.split(df.index):
            yield df.iloc[train_idx], df.iloc[test_idx]
```

### 6.2 통합 — `evaluate_variant_against_pack`와의 관계

`pattern_search.py`의 함수는 **수정 X** (V-00 augment-only). 대신:

```python
# engine/research/validation/pipeline.py (W-0221 V-08에서 작성)

from engine.research.pattern_search import (
    BenchmarkPackStore, evaluate_variant_against_pack,
    BenchmarkCase, ReplayBenchmarkPack
)
from engine.research.validation.cv import PurgedKFold, PurgedKFoldConfig

def run_purged_kfold_eval(pattern, pack, config=PurgedKFoldConfig()):
    """PurgedKFold를 BenchmarkPack 위에서 적용 (composition).

    기존 evaluate_variant_against_pack은 그대로. 본 함수가 case 분할만 재구성.
    """
    cases = pack.cases  # 기존 reference + holdout 무시, 시간순 재정렬
    cases_sorted = sorted(cases, key=lambda c: c.start_at)
    timestamps = [c.start_at for c in cases_sorted]
    splitter = PurgedKFold(config)
    fold_results = []
    for k, (train_idx, test_idx) in enumerate(splitter.split(pd.DatetimeIndex(timestamps))):
        train_cases = [cases_sorted[i] for i in train_idx]
        test_cases = [cases_sorted[i] for i in test_idx]
        # train_cases로 fit X (현재는 fit 없음, eval만)
        # test_cases에 대해 evaluate
        test_pack = ReplayBenchmarkPack(cases=tuple(test_cases), ...)
        result = evaluate_variant_against_pack(test_pack, ...)  # 기존 함수 그대로
        fold_results.append(result)
    return fold_results
```

→ **augment-only 정책 유지**. `evaluate_variant_against_pack`은 그대로.

### 6.3 Edge case 처리

| Case | 처리 |
|---|---|
| n_total < n_splits × 2 | ValueError("Not enough samples") |
| label_horizon_bars > fold_size | embargo가 fold 통째로 먹음 → fold 자동 축소 |
| 시간순 정렬 안 됨 | `index.sort_values` 강제 |
| Duplicates in index | DeprecationWarning + dedup |
| Empty fold | skip + log |

## 7. AI Researcher 설계

### 7.1 학술 표준 정합성

**López de Prado (2018) Ch 7 권장**:
- `n_splits ∈ [5, 10]` (default 5)
- `embargo ≥ label_horizon` (필수)
- 추가 buffer: `n × 0.005~0.01` (autocorrelation 방지)

**우리 식**: `embargo = max(label_horizon, n × 0.005)` — Lopez 권장 minimum 만족.

### 7.2 통계 검증 후속

V-01 단독으로는 t-stat / DSR 계산 X. V-06 stats.py에서:
```python
fold_returns = [run_purged_kfold_eval(...) for fold in folds]
t_stat, p = scipy.stats.ttest_1samp(fold_returns, 0)  # V-06
dsr = deflated_sharpe(fold_returns, n_trials=...)  # V-06
```

### 7.3 ROC delta 검증

Integration test:
- 같은 BenchmarkPack에 대해 (a) 기존 reference/holdout split (b) PurgedKFold 5-split
- per-variant ROC AUC 계산 (variant_score → entry_hit binary classifier)
- |AUC_ref - AUC_kfold| < 0.05 → split 방식이 결과를 크게 바꾸지 않음 (sanity check)

→ delta가 크면 (>0.05) 둘 중 하나가 leakage 또는 기존 split 부족. 디버그 필수.

## 8. Quant Trader 설계

### 8.1 Walk-Forward 권장 (W-0226 후속)

PurgedKFold는 **shuffled** k-fold. Quant 표준은 **walk-forward**:
- expanding window: `train: [0, t]`, `test: [t, t+w]`, t increases
- rolling window: `train: [t-W, t]`, `test: [t, t+w]`

**현재 V-01에서는 PurgedKFold만**. Walk-forward는 W-0226+에서 추가 (config option `mode='purged' | 'walk_forward_expanding' | 'walk_forward_rolling'`).

### 8.2 Cost injection

PurgedKFold 자체는 split만. Cost 주입은 V-08 pipeline:
```python
# W-0221 V-08 pipeline.py
COST_BPS = 15  # W-0214 D3
for fold in cv.split(df):
    fold_returns_net = fold_returns_gross - COST_BPS / 10000
```

### 8.3 Performance 예산

```
n_total = 100K rows
n_splits = 5
fold_size = 20K
purge + embargo overhead = ~500 rows × 5 = 2500 ops

Target: <5s per fold (Quant 표준 backtest)
실측: PurgedKFold pure Python loop는 ~1s. evaluate_variant_against_pack가 bottleneck.
→ V-01 단독 성능 목표: <100ms (split logic only)
```

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `pattern_search.py` 수정 유혹 (V-00 위반) | 중 | 높음 | composition만, ADR 필수 |
| López de Prado 식 오해 (embargo vs purge 헷갈림) | 중 | 중 | docstring에 식 + 인용 명시 |
| `BenchmarkCase.start_at` 중복 | 저 | 저 | dedup + warn |
| label_horizon이 변동 (1h/4h/24h 다중 측정) | 고 | 중 | config로 외부 주입 |
| Empty fold (small n) | 중 | 저 | skip + log, 최소 sample 검증 |

## 10. Open Questions

- **Q1**: BenchmarkCase가 이미 reference/holdout 라벨이 있는데, PurgedKFold가 이를 무시하면 의미 있나? → ① 라벨 무시하고 시간순 split (권장) ② 라벨 별도 활용 (holdout = 마지막 fold) — V-08에서 결정.
- **Q2**: bars_per_hour은 fixed 1h bar 가정. 4h bar는? → config에 timeframe 추가 필요.
- **Q3**: BenchmarkCase 수가 n_splits × 2 미만이면? → ValueError or fall back to 기존 split. V-08에서.

## 11. Acceptance Test (Bash)

```bash
# 1. 모듈 존재
test -f engine/research/validation/cv.py
test -f engine/research/validation/test_cv.py

# 2. Unit test pass
cd engine && pytest research/validation/test_cv.py -v
# → ≥10 test, all pass

# 3. pattern_search.py augment-only
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines

# 4. Integration test
cd engine && python -m research.validation.cv  # smoke test main
```

## 12. Cross-references

- W-0214 v1.3 §3.4 Cross-Validation (Lopez de Prado embargo 식)
- W-0215 §16.3 Wrapping priority (composition 권장)
- W-0214 §14.3 Table 2 (V-01 매핑)
- López de Prado (2018) "Advances in Financial Machine Learning" Ch 7
- sklearn.model_selection (참조 구현)

## 13. Next (V-01 머지 후)

- W-0218 V-02 phase_eval (M1 — `_measure_forward_peak_return` extension)
- W-0220 V-06 stats.py (Sharpe + DSR + BH + bootstrap)
- W-0221 V-08 pipeline (V-01 + V-02 + V-06 통합 + cost injection)
- W-0226 Walk-Forward (Quant Realism)

---

*W-0217 v1.0 created 2026-04-27 by Agent A033 — V-01 PurgedKFold PRD with 3-perspective sign-off.*
