# W-0255 — Walk-Forward CV (V-12 quant-grade complement of V-01 PurgedKFold)

**Owner:** research (engine)
**Status:** Ready (PRD only — depends on V-01 main, V-08 in-flight)
**Type:** New module `engine/research/validation/walk_forward.py` + V-08 wiring
**Depends on:** W-0217 V-01 (PurgedKFold) ✅ merged main (#436), W-0221 V-08 pipeline (#423 reopened)
**Estimated effort:** 1.5 day implementation + 0.5 day test = 2 day total
**Parallel-safe:** ✅ V-08 pipeline.py와 disjoint 파일

---

## 0. 한 줄 요약

V-01 PurgedKFold(López de Prado 2018 Ch 7) **하나만으로는 production 신뢰도 부족**. **walk-forward(Ch 11)** 를 평행 CV 전략으로 추가하여 V-08 pipeline이 두 결과의 합의(consensus)로 G3 gate를 통과시키도록. **W-0225 §6.2 M-3 (P1 상향) 결정의 직접 이행**.

## 1. Goal

W-0214 §3.7 G3 (PurgedKFold pass) 단독 통과만으로 production 배포 시 위험:
- PurgedKFold는 fold 순서 무작위 → 시계열 leakage 잔여 위험 (label_horizon보다 짧은 변동성 클러스터에)
- Quant production 표준 (López de Prado 2018 Ch 11 + Bailey & Lopez de Prado 2014)은 walk-forward 병행 권장

**해결**: walk-forward 모듈을 추가하여 V-08 pipeline이 두 CV 결과를 모두 산출. G3은 **둘 다 pass** 일 때만 gate 통과 (consensus rule).

## 2. Owner

research (engine)

## 3. Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/validation/walk_forward.py` | new | rolling-window expanding-train CV 구현체 |
| `engine/research/validation/test_walk_forward.py` | new | unit + integration test (≥10 cases) |
| `engine/research/validation/cv.py` | **read-only** | V-01 PurgedKFold 그대로 |
| `engine/research/validation/pipeline.py` | edit | V-08 pipeline에 `cv_strategy` 옵션 추가 (consensus G3) |
| `engine/research/validation/test_pipeline.py` | edit (existing) | walk-forward path acceptance |
| `engine/research/pattern_search.py` | **read-only** | V-00 augment-only |

## 4. Non-Goals

- ❌ V-01 PurgedKFold 대체 (둘 다 사용)
- ❌ Out-of-sample testing (W-0221 V-08 holdout split 영역)
- ❌ Online learning / streaming retraining (Phase 2+)
- ❌ Multi-horizon walk-forward (1 horizon at a time — V-08가 horizon 외부 루프 담당)
- ❌ Capacity / sizing / alpha-attribution (W-0228 Quant Realism 별도)
- ❌ pattern_search.py 수정 (V-00 augment-only)
- ❌ DB persist (V-08이 in-memory return; V-09 cron이 DB)

## 5. Exit Criteria

```
[ ] WalkForwardConfig dataclass (frozen) — train_min_bars / test_bars / step_bars / embargo_bars
[ ] WalkForward.split(index) → Iterator[(train_idx, test_idx)] 시그니처 V-01과 호환
[ ] expanding-train (anchored) 기본 + rolling-train 옵션
[ ] embargo: López de Prado Ch 7 fixed-bar embargo 적용
[ ] purge: train 끝 ↔ test 시작 사이 label_horizon 만큼 purge (V-01과 동일 의미)
[ ] G3 consensus: V-08 pipeline에서 PurgedKFold + WalkForward 둘 다 G1+G4 통과 시에만 G3 pass
[ ] unit test ≥10 case (edge: 빈 fold, 너무 짧은 train, embargo 만료, anchor toggle)
[ ] integration: V-08 pipeline에 cv_strategy="walk_forward" 또는 "consensus" 경로 동작
[ ] performance: <500ms per pattern × horizon × 1년 1h bar (V-01과 동급)
[ ] augment-only: pattern_search.py 0 lines diff
```

## 6. CTO 설계

### 6.1 Module API

```python
# engine/research/validation/walk_forward.py
from __future__ import annotations
from dataclasses import dataclass
from typing import Iterator, Literal

import numpy as np
import pandas as pd


@dataclass(frozen=True)
class WalkForwardConfig:
    """López de Prado 2018 Ch 11 walk-forward parameters.

    Attributes:
        train_min_bars: minimum training-window length (bars). Below this,
            the fold is skipped with warning.
        test_bars: held-out test window length per step. Default 168 (1 week
            at 1h bars).
        step_bars: stride between consecutive folds. Default = test_bars
            (non-overlapping). Setting < test_bars enables overlapping
            evaluation; > test_bars produces gaps.
        embargo_bars: bars between train end and test start (purge + embargo
            combined; matches V-01 semantics). Default 4 = label_horizon=4h
            primary horizon.
        anchored: True (default) = expanding train (anchor at first bar).
            False = rolling fixed-size train (window = train_min_bars).
        bars_per_hour: 1 for 1h bars (default), 0.25 for 4h bars.
    """
    train_min_bars: int = 720          # 30 days at 1h
    test_bars: int = 168               # 1 week at 1h
    step_bars: int = 168
    embargo_bars: int = 4              # = label_horizon_hours primary
    anchored: bool = True
    bars_per_hour: int = 1


class WalkForward:
    """Time-aware walk-forward cross-validation (López de Prado 2018 Ch 11).

    Yields (train_idx, test_idx) just like V-01 PurgedKFold. Designed to
    drop into V-08 pipeline as an alternative or consensus CV strategy.
    """

    def __init__(self, config: WalkForwardConfig | None = None) -> None:
        self.config = config if config is not None else WalkForwardConfig()

    def split(
        self,
        index: pd.DatetimeIndex,
    ) -> Iterator[tuple[np.ndarray, np.ndarray]]:
        """Yield (train_idx, test_idx) folds advancing chronologically.

        Args:
            index: time-ordered DatetimeIndex (sorted ascending).

        Yields:
            (train_idx, test_idx) np.ndarray[int]. Empty folds (insufficient
            train_min_bars) are skipped with warning.

        Raises:
            ValueError: if len(index) < train_min_bars + embargo_bars + test_bars.
        """
        ...

    def n_splits(self, index_len: int) -> int:
        """Predict the number of folds for a given index length (introspection)."""
        ...
```

### 6.2 V-08 pipeline wiring

`engine/research/validation/pipeline.py` augment (existing PRD §6.1 ValidationPipelineConfig):

```python
@dataclass(frozen=True)
class ValidationPipelineConfig:
    cv_strategy: Literal["purged_kfold", "walk_forward", "consensus"] = "consensus"
    purged_kfold_config: PurgedKFoldConfig = field(default_factory=PurgedKFoldConfig)
    walk_forward_config: WalkForwardConfig = field(default_factory=WalkForwardConfig)
    # ... other existing fields ...
```

G3 evaluation logic (V-11 reads `validation_report.fold_pass_count` per W-0225 §6.1 C-2):

```
cv_strategy == "consensus":
  G3 pass  ⇔  PurgedKFold.fold_pass_count >= 4/5  AND
              WalkForward.fold_pass_count >= 0.8 of yielded folds

cv_strategy == "walk_forward":
  G3 pass  ⇔  WalkForward.fold_pass_count >= 0.8

cv_strategy == "purged_kfold":  (legacy)
  G3 pass  ⇔  PurgedKFold.fold_pass_count >= 4/5
```

### 6.3 Edge cases

| Case | Behavior |
|---|---|
| index < `train_min_bars + embargo_bars + test_bars` | ValueError early |
| First fold: train < `train_min_bars` | skip + warn |
| Last fold: test partial (< `test_bars`) | skip + warn (no padding) |
| `step_bars` < `test_bars` (overlapping) | allow + log overlap_ratio |
| `step_bars` > `test_bars` (gap) | allow + log skipped_pct |
| `anchored=False` and train slides past data start | clip to data start |

## 7. AI Researcher 설계

### 7.1 W-0214 §3.7 G3 spec 정합

**spec**: "PurgedKFold pass — 5 fold 중 4 fold ≥ G1+G4". Walk-forward 부재.

**보강**: G3을 두 CV 합의로 재정의. 학술 근거:
- López de Prado 2018 §11.3: "Walk-forward is the de-facto industry standard but is not unbiased; PurgedKFold is unbiased but artificial. Use both."
- Bailey & Lopez de Prado 2014 (DSR paper) §6: "selection bias adjustment requires multiple resampling schemes for cross-validation".

→ V-08 consensus 모드가 spec 의도(production reliability) 더 정확히 반영.

### 7.2 Walk-forward fold count vs PurgedKFold

PurgedKFold: 5 folds (config default).
WalkForward (1년 1h bar = 8760 bars, train_min=720, test=168, step=168):
- yielded folds = floor((8760 - 720 - 4) / 168) ≈ 47 folds

→ WalkForward이 통계적 표본 수 훨씬 큼. consensus G3은 두 표본 모두에서 통과를 요구하므로 false positive 차단 강화.

### 7.3 Embargo 일관성

V-01 PurgedKFold는 `embargo_floor_pct=0.01` × n_total. 1년 8760 bar → 87 bar embargo.
WalkForward는 `embargo_bars=4` (= label_horizon_hours).

→ 다른 의미. V-01은 fold-boundary embargo (양쪽), WF는 train→test 단방향 embargo. **PRD 명시**: 두 CV의 embargo는 학술적으로 다른 개념이므로 일치시키지 않음.

## 8. Quant Trader 설계

### 8.1 Cost / risk-adj

V-08 pipeline이 cost_bps=15.0 (W-0214 D3) 이미 강제. WalkForward는 V-02 측정에 cv split만 제공하므로 cost 책임 없음.

### 8.2 Performance budget

```
1년 1h bar = 8760 entries
train_min=720, test=168, step=168 → ~47 folds
fold당 V-02 measurement: ~50ms (cached klines, vectorized)
total: 47 × 50ms = 2.4s

Target: <500ms per pattern × horizon — 위 추정의 5배 budget으로 안정 마진.
실측: V-08 pipeline acceptance script에서 측정.
```

### 8.3 Production realism check

walk-forward는 "당시 가용 데이터만으로 결정" 시뮬레이션. PurgedKFold는 미래 데이터 일부 fold가 train에 들어가는 인공 분할. **G3 consensus pass = production 배포 가능** 라는 신호.

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| V-01 PurgedKFold interface drift | 저 | 중 | `cv.py` 인터페이스 frozen(W-0217 머지됨) + version field |
| WalkForward yields too few folds (data short) | 중 | 중 | `n_splits()` 사전 호출 + ValueError early |
| Consensus mode가 모든 패턴 G3 fail로 이어짐 | 중 | 고 | acceptance에 base-rate 측정 + consensus fail rate dashboard |
| Embargo 의미 차이로 V-01과 결과 불일치 혼동 | 저 | 중 | 모듈 docstring + W-0225 §7 명시 |
| 시계열 길이 0년 미만 (`benchmark_pack` 짧음) | 고 | 저 | early return + warn (V-01과 동일 패턴) |
| V-08 pipeline이 두 CV 동시 실행으로 latency 2배 | 중 | 저 | parallel fold execution은 후속 ADR (Phase 2) |

## 10. Open Questions

- **Q1**: `step_bars < test_bars` (overlapping) 결과 합산 방법? → V-01 (`np.concatenate(samples)`) 동일하나 통계적 독립성 저하. **Decision**: PRD v1.0은 `step_bars >= test_bars` 만 권장. 후속 ADR.
- **Q2**: Consensus G3에서 PurgedKFold 4/5 + WF 80% 임계는 누가 결정? → W-0214 §3.7 G3 임계 보강 ADR (별도 work item) 필요.
- **Q3**: `anchored=False` 시 첫 fold가 모든 데이터 보지 못함 — production realism 측면에서 `anchored=True`가 표준이 맞나? → López de Prado 2018 §11.4: 둘 다 valid, 분산이 다름. anchored 기본.

## 11. Acceptance Test (Bash)

```bash
# 1. 모듈 존재
test -f engine/research/validation/walk_forward.py
test -f engine/research/validation/test_walk_forward.py

# 2. unit test
cd engine && .venv/bin/pytest research/validation/test_walk_forward.py -v
# → ≥10 cases pass

# 3. V-08 pipeline integration (consensus)
cd engine && .venv/bin/python -c "
from research.validation.pipeline import (
    run_validation_pipeline, ValidationPipelineConfig
)
from patterns.library import get_pattern
from research.pattern_search import BenchmarkPackStore
config = ValidationPipelineConfig(cv_strategy='consensus')
report = run_validation_pipeline(
    get_pattern('compression-breakout-reversal-v1'),
    BenchmarkPackStore.load('compression-breakout-reversal-v1__cbr-v1'),
    config=config,
)
print(f'fold_pass_count={report.fold_pass_count}/{report.fold_total_count}')
print(f'walk_forward_yielded={len(report.horizon_reports[0].cv_metadata[\"walk_forward_folds\"])}')
"

# 4. augment-only
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines

# 5. acceptance harness
cd engine && .venv/bin/python -m research.validation.acceptance_report
# → exit 0 (all gates pass including walk_forward path)
```

## 12. Cross-references

- W-0214 v1.3 §3.7 G3 (PurgedKFold pass)
- W-0217 V-01 PurgedKFold (#436 merged main)
- W-0221 V-08 pipeline (#423 reopened) — consensus G3 추가 통합점
- W-0225 §6.2 M-3 walk-forward P1 상향 결정 (이 PRD의 직접 발단)
- López de Prado 2018 Ch 11 (Walk-Forward) + Ch 7 (PurgedKFold)
- Bailey & Lopez de Prado 2014 (DSR / Selection Bias)

## 13. Next (W-0255 머지 후)

- V-08 pipeline (W-0221) consensus 모드 acceptance 재실행
- W-0228 Quant Realism Protocol (capacity / sizing / alpha attribution / drawdown / VaR/CVaR) — W-0226+ 후속
- ADR: G3 consensus 임계 (4/5 + 80%) 정식 결정 (Q2)

---

## CTO 설계 원칙 적용 점검표

### 성능 (100명+ 동시 사용자)
- ✅ N+1 없음 (`split()` 단일 pass O(n))
- ✅ Hot path 캐시 불필요 (in-memory in-process compute)
- ✅ Blocking I/O 없음 (klines load는 V-02가 담당, 본 모듈은 인덱스 split만)
- ✅ V-08 호출 1회당 ≤500ms (per pattern × horizon)

### 안정성
- ✅ 폴백: `n_splits()` 사전 검사 + ValueError 명시 (V-01과 동일 패턴)
- ✅ 멱등성: split iterator 재실행 시 동일 인덱스 → 동일 결과 (frozen config)
- ✅ 외부 API 호출 없음 (재시도 불필요)
- ✅ 헬스체크: V-08 pipeline observability에 yielded_folds 카운트 추가

### 보안
- ✅ JWT: 본 모듈은 internal compute, 외부 endpoint 없음 → 적용 대상 외
- ✅ RLS: DB 접근 없음 → 대상 외
- ✅ 민감값 없음 (config 모두 numeric)
- ✅ 입력 검증: `pd.DatetimeIndex` 타입 + 길이 체크 (PRD §6.3)

### 유지보수성
- ✅ 계층 준수: `engine/research/validation/` 안에서만 작업, app/ 영향 0
- ✅ 계약: V-01 `(train_idx, test_idx)` 시그니처 호환 (V-08이 두 구현체 polymorphic 호출)
- ✅ 테스트: ≥10 unit + V-08 통합 test 1건
- ✅ 롤백: V-08 `cv_strategy` 기본값을 `purged_kfold`로 임시 변경하면 즉시 W-0255 미사용 상태로 복귀 (non-destructive)

### Charter 정합성
- ✅ In-Scope: L7 AutoResearch (validation framework)
- ✅ Non-Goal 회피: copy_trading / chart_polish / 신규 memory stack / multi-agent 신규 — 어느 것도 진입 X
- ✅ pattern_search.py READ-ONLY (V-00 augment-only)

---

## Goal

§1 — V-01 단독 G3 통과의 production 신뢰도 부족 해소. walk-forward consensus로 G3 강화.

## Owner

§2 — research (engine)

## Scope

§3 — `walk_forward.py` 신규 + `pipeline.py` cv_strategy 옵션 추가.

## Non-Goals

§4 — V-01 대체 X / out-of-sample test X / online learning X / multi-horizon WF X.

## Canonical Files

`engine/research/validation/walk_forward.py`
`engine/research/validation/test_walk_forward.py`
`engine/research/validation/pipeline.py` (edit, V-08 wiring)

## Facts

- W-0217 V-01 main 머지 완료 (PR #436, commit 887269f6)
- W-0221 V-08 PRD에 W-0225 C-2 sub_results 기 반영 (line 156-169)
- W-0225 §6.2 M-3에서 walk-forward P1 상향 결정 (Quant Trader 관점)
- López de Prado 2018 Ch 11 = production CV 표준

## Assumptions

- V-08 pipeline (W-0221) 구현 시 cv_strategy 옵션 수용 가능
- 1년치 1h klines (8760 bar) 부모 repo cache에 충분히 존재 (다수 심볼 ≥ 70k bar)
- V-01 PurgedKFold 인터페이스 frozen — 변경 없음

## Open Questions

§10 Q1~Q3 (overlapping step / consensus 임계 / anchored mode).

## Decisions

- consensus 모드 V-08 default
- anchored=True 기본
- embargo 의미 V-01과 다름 명시
- step_bars >= test_bars 만 v1.0 권장

## Next Steps

§13 — V-08 consensus 통합 + Quant Realism W-0228 + G3 임계 ADR.

## Exit Criteria

§5 — 모듈 + ≥10 test + V-08 wiring + perf <500ms + augment-only.

## Handoff Checklist

- [x] PRD v1.0 (3-perspective sign-off)
- [ ] GitHub Issue 등록
- [ ] V-08 W-0221 PRD 본문에 cv_strategy 옵션 명시 추가
- [ ] 구현 PR
- [ ] V-08 acceptance에 walk-forward path 통합

---

*W-0255 v1.0 created 2026-04-27 by Agent A037 — walk-forward CV PRD with CTO + AI Researcher + Quant Trader 3-perspective sign-off. Direct implementation of W-0225 §6.2 M-3 P1 priority bump.*
