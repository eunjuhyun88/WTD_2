# W-0221 — V-08 Validation Pipeline (Integration)

**Owner:** research
**Status:** Ready (PRD only, depends on V-01/V-02/V-06)
**Type:** New module (`engine/research/validation/pipeline.py`)
**Depends on:** W-0217 V-01 (cv.py), W-0218 V-02 (phase_eval.py), W-0220 V-06 (stats.py)
**Estimated effort:** 3 day implementation + 1 day test = 4 day total
**Parallel-safe:** ⚠️ V-01/V-02/V-06 머지 후 (sequential dependency)

---

## 0. 한 줄 요약

V-01 PurgedKFold + V-02 phase_eval + V-06 stats를 통합한 **end-to-end validation pipeline**. B0~B3 baseline + cost injection + multi-pattern × multi-horizon batch. **F1 measurement (W-0216) 직접 트리거**.

## 1. Goal

W-0214 §3 entire validation framework 통합:
1. PatternObject + BenchmarkPack input → PurgedKFold split
2. fold별 phase_eval + B0~B3 baseline 측정
3. stats.py 통과 임계 검증 (G1~G4)
4. dashboard JSON output (V-10 Hunter UI 입력)

## 2. Owner

research

## 3. Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/validation/pipeline.py` | new | 통합 entry |
| `engine/research/validation/baselines.py` | new | B0~B3 baseline 정의 |
| `engine/research/validation/test_pipeline.py` | new | end-to-end test |
| `engine/research/pattern_search.py` | **read-only** | V-00 augment-only |

## 4. Non-Goals

- ❌ M2 ablation (V-03 W-0219)
- ❌ M3 sequence (V-04)
- ❌ M4 regime (V-05)
- ❌ Gate v2 통합 (V-11 W-0222)
- ❌ Weekly cron (V-09)
- ❌ Hunter UI (V-10)
- ❌ pattern_search.py 수정 (V-00 augment-only)

## 5. Exit Criteria

```
[ ] ValidationPipelineConfig dataclass (cv_config + cost_bps + horizons + baselines)
[ ] run_validation_pipeline(pattern, pack) → ValidationReport
[ ] B0 (random time) baseline 자동 측정
[ ] B1 (buy & hold) baseline
[ ] B2 (phase 0 미진입) baseline — pattern_search.py entry_hit=False 활용
[ ] B3 (phase k-1) baseline — summarize_phase_attempt_records 활용
[ ] cost_bps injection 명시 (W-0214 D3 = 15bps)
[ ] G1~G4 임계 자동 검증 (V-06 stats.py 호출)
[ ] dashboard JSON output (V-10 입력 spec)
[ ] integration test: 1 P0 pattern × 1년 holdout × full pipeline → ValidationReport
[ ] performance: <60s per (pattern, horizon=4h) on 1년 1h bar
```

## 6. CTO 설계

### 6.1 API spec

```python
# engine/research/validation/pipeline.py

from dataclasses import dataclass, field
from typing import Sequence
import numpy as np
import pandas as pd

from engine.research.pattern_search import (
    BenchmarkPack, BenchmarkPackStore, PatternObject  # composition
)
from .cv import PurgedKFold, PurgedKFoldConfig
from .phase_eval import (
    measure_phase_conditional_return,
    measure_phase_conditional_return_with_cv,
    PhaseConditionalReturn
)
from .stats import (
    welch_t_test, bh_correct, deflated_sharpe,
    bootstrap_ci, annualized_sharpe, hit_rate, profit_factor
)
from .baselines import (
    measure_b0_random, measure_b1_buy_hold,
    measure_b2_phase_zero, measure_b3_phase_k_minus_1
)


@dataclass(frozen=True)
class ValidationPipelineConfig:
    """전체 pipeline 설정."""
    cv_config: PurgedKFoldConfig = field(default_factory=PurgedKFoldConfig)
    cost_bps: float = 15.0                         # W-0214 D3
    horizons_hours: tuple[int, ...] = (1, 4, 24)
    baselines: tuple[str, ...] = ("B0", "B1", "B2", "B3")
    bootstrap_n_iter: int = 1000
    bh_alpha: float = 0.05
    n_trials_for_dsr: int | None = None            # None = horizons * patterns


@dataclass(frozen=True)
class GateResult:
    """단일 gate 통과 여부."""
    gate_id: str        # "G1", "G2", "G4"
    name: str
    value: float
    threshold: float
    passed: bool


@dataclass(frozen=True)
class HorizonReport:
    """1개 (pattern, phase, horizon) 측정 결과."""
    pattern_slug: str
    phase_name: str
    horizon_hours: int
    n_samples: int

    phase_return: PhaseConditionalReturn       # V-02 output
    baselines: dict[str, PhaseConditionalReturn]  # B0/B1/B2/B3

    # vs B0 (random) test
    t_vs_b0: float
    p_vs_b0: float
    p_bh_vs_b0: float                          # BH corrected (after multi-test)
    sharpe: float
    dsr: float
    bootstrap_ci: tuple[float, float]
    hit_rate: float
    profit_factor: float

    gates: list[GateResult]                    # G1, G2, G4 + F1 강화
    overall_passed: bool                        # ≥4 of 6 metrics


@dataclass(frozen=True)
class ValidationReport:
    """1개 PatternObject × 모든 (phase, horizon) 통합.

    ⚠️ W-0225 §6.1 Issue C-2 fix: V-11 gate v2가 read하는 sub_results 추가.
    """
    pattern_slug: str
    timestamp: pd.Timestamp
    config: ValidationPipelineConfig
    horizon_reports: list[HorizonReport]

    overall_pass_count: int                    # 통과한 horizon 수
    overall_pass_rate: float
    f1_kill: bool                               # W-0216 F1 KILL?

    # ── Sub-results (W-0225 C-2 fix): V-11 gate v2가 G3/G5/G6/G7 검증 시 read ──
    # V-01 PurgedKFold (G3)
    fold_pass_count: int = 0                    # 5 fold 중 G1+G4 통과한 수
    fold_total_count: int = 0                   # 5 (config.cv_config.n_splits)

    # V-03 Ablation (G5) — list of AblationResult
    ablation_results: list = field(default_factory=list)  # validation/ablation.py:AblationResult

    # V-04 Sequence (G6) — SequenceCompletionResult
    sequence_result: dict | None = None          # serialized SequenceCompletionResult

    # V-05 Regime (G7) — list of RegimeConditionalReturn
    regime_results: list = field(default_factory=list)
    regime_pass_count: int = 0                   # G7 t≥2 통과 regime 수

    def to_dashboard_json(self) -> dict:
        """V-10 Hunter UI 입력 spec."""
        return {
            "pattern_slug": self.pattern_slug,
            "timestamp": self.timestamp.isoformat(),
            "horizons": [
                {
                    "horizon_hours": h.horizon_hours,
                    "phase": h.phase_name,
                    "n": h.n_samples,
                    "metrics": {
                        "mean": h.phase_return.mean_return_pct,
                        "t_vs_b0": h.t_vs_b0,
                        "p_bh": h.p_bh_vs_b0,
                        "sharpe": h.sharpe,
                        "dsr": h.dsr,
                        "ci": list(h.bootstrap_ci),
                        "hit_rate": h.hit_rate,
                        "profit_factor": h.profit_factor,
                    },
                    "gates": [{"id": g.gate_id, "passed": g.passed,
                               "value": g.value, "threshold": g.threshold}
                              for g in h.gates],
                    "passed": h.overall_passed,
                }
                for h in self.horizon_reports
            ],
            "overall": {
                "pass_count": self.overall_pass_count,
                "pass_rate": self.overall_pass_rate,
                "f1_kill": self.f1_kill,
            },
        }


def run_validation_pipeline(
    pattern: PatternObject,
    pack: BenchmarkPack,
    *,
    config: ValidationPipelineConfig = ValidationPipelineConfig(),
) -> ValidationReport:
    """End-to-end validation: V-01 split → V-02 measure → V-06 stats → gates."""
    horizon_reports = []
    all_p_values = []

    for horizon in config.horizons_hours:
        # 1. V-02 measurement with V-01 PurgedKFold split
        phase_results_per_fold = measure_phase_conditional_return_with_cv(
            pattern=pattern, ..., horizon_hours=horizon,
            cost_bps=config.cost_bps, cv_config=config.cv_config,
        )
        # aggregate across folds
        all_samples = np.concatenate([r.samples for r in phase_results_per_fold])
        agg_phase = _aggregate_phase_results(phase_results_per_fold)

        # 2. baselines
        baselines = {}
        if "B0" in config.baselines:
            baselines["B0"] = measure_b0_random(
                n_samples=len(all_samples), horizon_hours=horizon,
                cost_bps=config.cost_bps,
            )
        if "B1" in config.baselines:
            baselines["B1"] = measure_b1_buy_hold(
                horizon_hours=horizon, cost_bps=config.cost_bps,
            )
        # B2/B3 similar...

        # 3. V-06 stats
        b0_samples = baselines["B0"].samples if "B0" in baselines else []
        t_result = welch_t_test(all_samples, b0_samples, alternative="greater")
        sr = annualized_sharpe(all_samples, horizon_hours=horizon)
        n_trials = config.n_trials_for_dsr or len(config.horizons_hours)
        dsr = deflated_sharpe(all_samples, n_trials=n_trials)
        ci_lo, ci_hi, _ = bootstrap_ci(all_samples, n_iter=config.bootstrap_n_iter)
        hr = hit_rate(all_samples)
        pf = profit_factor(all_samples)

        all_p_values.append(t_result.p_value)

        # 4. Gates (G1, G2, G4 + F1 강화 4)
        gates = [
            GateResult("G1", "t-stat ≥ 2", t_result.t_statistic, 2.0, t_result.t_statistic >= 2.0),
            GateResult("G2", "DSR > 0", dsr, 0.0, dsr > 0),
            GateResult("G4", "Bootstrap CI excludes 0", ci_lo, 0.0, ci_lo > 0),
            GateResult("F1-Sharpe", "Sharpe ≥ 1", sr, 1.0, sr >= 1.0),
            GateResult("F1-Hit", "Hit rate ≥ 0.52", hr, 0.52, hr >= 0.52),
            GateResult("F1-PF", "PF ≥ 1.2", pf, 1.2, pf >= 1.2),
        ]
        passed_count = sum(1 for g in gates if g.passed)
        overall_passed = passed_count >= 4  # W-0216 §15.1: ≥4 of 6

        horizon_reports.append(HorizonReport(
            pattern_slug=pattern.slug, phase_name=...,
            horizon_hours=horizon, n_samples=len(all_samples),
            phase_return=agg_phase, baselines=baselines,
            t_vs_b0=t_result.t_statistic, p_vs_b0=t_result.p_value,
            p_bh_vs_b0=0.0,  # filled after BH below
            sharpe=sr, dsr=dsr, bootstrap_ci=(ci_lo, ci_hi),
            hit_rate=hr, profit_factor=pf,
            gates=gates, overall_passed=overall_passed,
        ))

    # 5. BH correction across horizons
    _, p_corrected = bh_correct(all_p_values, alpha=config.bh_alpha)
    horizon_reports = [
        replace(h, p_bh_vs_b0=float(p_corrected[i]))
        for i, h in enumerate(horizon_reports)
    ]

    pass_count = sum(1 for h in horizon_reports if h.overall_passed)
    pass_rate = pass_count / len(horizon_reports)
    f1_kill = pass_rate == 0.0  # W-0216 F1 KILL

    return ValidationReport(
        pattern_slug=pattern.slug, timestamp=pd.Timestamp.utcnow(),
        config=config, horizon_reports=horizon_reports,
        overall_pass_count=pass_count, overall_pass_rate=pass_rate,
        f1_kill=f1_kill,
    )
```

### 6.2 baselines.py 별도 모듈

```python
# engine/research/validation/baselines.py

def measure_b0_random(*, n_samples: int, horizon_hours: int, cost_bps: float = 15.0,
                      symbol: str = "BTCUSDT", timeframe: str = "1h",
                      seed: int = 42) -> PhaseConditionalReturn:
    """B0 random time baseline. W-0214 §3.3 + W-0218 §7.2."""
    # implementation: random sample timestamps + measure_phase_conditional_return

def measure_b1_buy_hold(*, horizon_hours: int, cost_bps: float = 15.0, ...) -> PhaseConditionalReturn:
    """B1 buy & hold baseline."""

def measure_b2_phase_zero(*, pattern, pack, horizon_hours: int, ...) -> PhaseConditionalReturn:
    """B2 미진입 케이스. pattern_search.py entry_hit=False 활용."""

def measure_b3_phase_k_minus_1(*, pattern, pack, horizon_hours: int, ...) -> PhaseConditionalReturn:
    """B3 직전 phase. summarize_phase_attempt_records 활용."""
```

### 6.3 Edge case

| Case | 처리 |
|---|---|
| BenchmarkPack < n_splits × 2 | ValueError + early return |
| All baselines empty | gates fail + log warning |
| t-stat NaN (n<3) | gate fail + skip horizon |
| Cost-adjusted return all negative | hit_rate=0, PF=0 → gate fail |

## 7. AI Researcher 설계

### 7.1 W-0214 §3 spec 정합성 매트릭스

| §3 spec | V-08 구현 |
|---|---|
| §3.1 두 evidence | objective (forward return) only — subjective (verdict)는 W-0216 F2에서 |
| §3.2 M1 measurement | `measure_phase_conditional_return_with_cv` ✅ |
| §3.2 M1 acceptance | `gates[G1]` ✅ |
| §3.3 4 baselines | B0~B3 모듈 ✅ |
| §3.4 PurgedKFold | V-01 통합 ✅ |
| §3.5 stats engine | V-06 통합 ✅ |
| §3.6 reproducibility | seed=42 default ✅ |
| §3.7 G1~G7 | G1/G2/G4 + F1 강화 (G3 V-01에서, G5~G7 후속) |

### 7.2 BH correction 시점

V-08에서는 (pattern, horizons) 내부에서 BH. F1 measurement (W-0216)는 (5 patterns × 3 horizons = 15 tests) 전체에서 BH 재계산.

→ V-08은 single-pattern BH (3 horizons). W-0216은 multi-pattern BH (15 tests) — 둘 다 필요.

## 8. Quant Trader 설계

### 8.1 Cost injection 강제

```python
config.cost_bps = 15.0  # W-0214 D3 enforce
```

→ pipeline 내부에서 cost 차감. pattern_search.py의 implicit slip 0.1%는 무시 (V-02에서 명시 cost로 override).

### 8.2 Performance 목표

```
1 pattern × 3 horizons × 5 folds = 15 sub-eval
fold당 200 entries × 50ms = 10s (vectorized 시 <1s)
× 15 sub = 150s? → vectorize + cache klines 1회

Target: <60s per (pattern, horizon=4h) 1년
실측: 1번 클라인 로드 (50MB cache hit) + vectorized split = ~30s 예상
```

### 8.3 Dashboard JSON spec

V-10 Hunter UI에서 사용. JSON schema:
- pattern_slug, timestamp
- horizons[]: {h, n, metrics: {t/p/sharpe/dsr/ci/hit/pf}, gates[], passed}
- overall: {pass_count, pass_rate, f1_kill}

→ Frontend (Svelte W-0240 dashboard) 직접 consume.

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| V-01/V-02/V-06 interface drift | 중 | 높음 | dataclass frozen + version field |
| BenchmarkPack 데이터 부족 (n<60) | 고 | 중 | early return + warn |
| Cost injection 누락 | 저 | 높음 | pipeline 내부 강제 |
| Memory blowup (1년 1h bar × 5 folds × 4 baselines) | 중 | 중 | streaming aggregate |
| Klines cache miss → 부분 결과 | 중 | 저 | log + skip + n_samples 정확 |

## 10. Open Questions

- **Q1**: ValidationReport JSON file vs DB persist? → V-09 cron에서 DB. V-08 자체는 in-memory return.
- **Q2**: Gate "≥4 of 6" 임계가 W-0216 §15.10 의사결정 매트릭스와 일치? → §15.10은 KILL 매트릭스, V-08은 gate. 다른 layer.
- **Q3**: B2/B3 측정에서 pattern_search.py 함수가 충분한 hooks 제공? → V-00 audit 결과: 부분 (entry_hit=False, summarize_phase_attempt_records). 명확히 부족 시 별도 ADR.

## 11. Acceptance Test (Bash)

```bash
# 1. 모듈 존재
test -f engine/research/validation/pipeline.py
test -f engine/research/validation/baselines.py
test -f engine/research/validation/test_pipeline.py

# 2. End-to-end test
cd engine && pytest research/validation/test_pipeline.py::test_full_pipeline_p0 -v
# → 1 P0 pattern × 1년 fixture → ValidationReport with gates

# 3. F1 KILL detection
cd engine && python -c "
from research.validation.pipeline import run_validation_pipeline
from patterns.library import get_pattern
report = run_validation_pipeline(get_pattern('p0_test'), pack=...)
print(f'pass_rate={report.overall_pass_rate}, f1_kill={report.f1_kill}')
print(f'JSON: {report.to_dashboard_json()}')
"

# 4. pattern_search.py augment-only
git diff origin/main -- engine/research/pattern_search.py
# → 0 lines
```

## 12. Cross-references

- W-0214 v1.3 §3 entire validation framework
- W-0215 §14.7 Quant Coverage Matrix (1/8 — V-08에서 cost 명시)
- W-0216 §15 F1 강화 + §15.10 KILL matrix
- W-0217 V-01, W-0218 V-02, W-0220 V-06
- W-0214 §14.11 후속 work items

## 13. Next (V-08 머지 후)

- W-0216 F1 measurement 시작 (Week 1)
- W-0219 V-03 ablation (M2)
- W-0222 V-11 gate v2 (G1~G7 통합)
- W-0223 V-09 weekly cron
- W-0225 V-10 Hunter UI (dashboard JSON consume)

---

*W-0221 v1.0 created 2026-04-27 by Agent A033 — V-08 pipeline PRD with 3-perspective sign-off.*

---

## Goal

§1 — V-01 + V-02 + V-06 통합 end-to-end validation pipeline. F1 measurement 트리거.

## Owner

§2 — research

## Scope

§3 — `validation/pipeline.py` + `baselines.py` 신규 + test.

## Non-Goals

§4 — M2/M3/M4 별도 (V-03/V-04/V-05) / Gate v2 V-11 / cron V-09 / UI V-10.

## Canonical Files

§3 — `pipeline.py`, `baselines.py`, `test_pipeline.py`.

## Facts

§7.1 W-0214 §3 spec 정합 매트릭스. cost_bps=15.0 D3 정합.

## Assumptions

§9 Risk register. V-01/V-02/V-06 interface frozen, BenchmarkPack n>=60.

## Open Questions

§10 Q1~Q3 (JSON file vs DB, gate threshold, B2/B3 hooks).

## Decisions

cost_bps 강제 / ≥4 of 6 gate / BH within-pattern / dashboard JSON spec for V-10.

## Next Steps

§13 — F1 measurement (W-0216) + V-09 cron + V-11 gate v2.

## Exit Criteria

§5 — config + run_validation_pipeline + B0~B3 + G1~G4 + dashboard JSON + integration test + perf <60s.

## Handoff Checklist

- [x] PRD v1.0 published
- [ ] V-01/V-02/V-06 머지 후 시작
- [ ] Issue #423 implementation
- [ ] dashboard JSON spec → V-10 frontend
