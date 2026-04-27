# W-0220 — V-06 Statistics Engine (Sharpe + DSR + BH + Bootstrap)

**Owner:** research
**Status:** Ready (PRD only, depends on V-02)
**Type:** New module (`engine/research/validation/stats.py`)
**Depends on:** W-0214 §3.2/§3.7, W-0215 §14.6 (G1~G4 신규), W-0218 V-02 (input PhaseConditionalReturn)
**Estimated effort:** 2 day implementation + 1 day test = 3 day total
**Parallel-safe:** ✅ (V-02 output 위에서 작동, V-02와 동시 개발 가능 — interface lock)

---

## 0. 한 줄 요약

W-0214 G1~G4 (t-stat ≥ 2 + DSR > 0 + Bootstrap CI + Sharpe) 통계 엔진. **F1 measurement (W-0216)의 임계 검증 직접 트리거**. scipy.stats + statsmodels.multitest + numpy.random 활용.

## 1. Goal

W-0214 §3.7 acceptance gates 중 통계 부분 4개 (G1, G2, G4 + Sharpe) 구현:
- G1: Welch's t-test + Benjamini-Hochberg multiple comparison correction
- G2: Deflated Sharpe Ratio (López de Prado 2014)
- G4: Bootstrap 95% CI (excludes 0 → significant)
- Annualized Sharpe (W-0216 F1 강화)

## 2. Owner

research (CTO + AI Researcher 공동, 통계 표준 정합성 보증)

## 3. Scope

| 파일 | 변경 유형 | 이유 |
|---|---|---|
| `engine/research/validation/stats.py` | new | 통계 함수 |
| `engine/research/validation/test_stats.py` | new | unit test (≥20 case) |
| `engine/research/pattern_search.py` | **read-only** | V-00 augment-only |

## 4. Non-Goals

- ❌ G3 PurgedKFold pass — V-01 (W-0217)
- ❌ G5 ablation drop — V-03 (W-0219)
- ❌ G6 sequence monotonic — V-04 (W-0xxx)
- ❌ G7 regime gate — V-05 (W-0xxx)
- ❌ Pipeline integration — V-08 (W-0221)
- ❌ Position sizing / drawdown — W-0226+ Quant Realism

## 5. Exit Criteria

```
[ ] welch_t_test(samples_a, samples_b) → (t, p, df) — scipy.stats.ttest_ind
[ ] bh_correct(p_values, n_tests, alpha=0.05) → corrected_p_values — statsmodels.multipletests
[ ] deflated_sharpe(returns, n_trials, skew, kurt) → DSR — López de Prado 2014
[ ] bootstrap_ci(samples, n_iter=1000, ci=0.95, seed=42) → (lower, upper, mean)
[ ] annualized_sharpe(returns_pct, horizon_hours, periods_per_year=252*24) → Sharpe
[ ] hit_rate(samples) → fraction > 0
[ ] profit_factor(samples) → sum_pos / abs(sum_neg)
[ ] unit test ≥20 case (edge: n<10, all_zero, all_negative, NaN handling)
[ ] performance: <50ms for 1000 samples per metric
[ ] 학술 출처 인용: 각 함수 docstring에 paper + formula
```

## 6. CTO 설계

### 6.1 API spec

```python
# engine/research/validation/stats.py

from dataclasses import dataclass
from typing import Sequence
import numpy as np
import pandas as pd
from scipy import stats as scipy_stats
from statsmodels.stats.multitest import multipletests

@dataclass(frozen=True)
class TTestResult:
    t_statistic: float
    p_value: float
    df: float                      # degrees of freedom
    n_samples: tuple[int, int]     # (n_a, n_b)
    mean_diff: float

def welch_t_test(
    samples_a: Sequence[float],
    samples_b: Sequence[float],
    *,
    equal_var: bool = False,        # Welch
    alternative: str = "two-sided", # "less" / "greater" / "two-sided"
) -> TTestResult:
    """Welch's t-test (unequal variance assumption).

    Reference: Welch (1947), Biometrika.
    Used for: M1 phase-conditional return vs B0 random baseline.
    """
    arr_a = np.asarray(samples_a, dtype=float)
    arr_b = np.asarray(samples_b, dtype=float)
    arr_a = arr_a[~np.isnan(arr_a)]
    arr_b = arr_b[~np.isnan(arr_b)]
    if len(arr_a) < 3 or len(arr_b) < 3:
        return TTestResult(t_statistic=0.0, p_value=1.0, df=0.0,
                           n_samples=(len(arr_a), len(arr_b)),
                           mean_diff=float(arr_a.mean() - arr_b.mean()) if len(arr_a) and len(arr_b) else 0.0)
    result = scipy_stats.ttest_ind(arr_a, arr_b, equal_var=equal_var, alternative=alternative)
    return TTestResult(
        t_statistic=float(result.statistic),
        p_value=float(result.pvalue),
        df=float(result.df) if hasattr(result, 'df') else float(len(arr_a) + len(arr_b) - 2),
        n_samples=(len(arr_a), len(arr_b)),
        mean_diff=float(arr_a.mean() - arr_b.mean()),
    )


def bh_correct(
    p_values: Sequence[float],
    *,
    alpha: float = 0.05,
    method: str = "fdr_bh",
) -> tuple[np.ndarray, np.ndarray]:
    """Benjamini-Hochberg multiple comparison correction.

    Reference: Benjamini & Hochberg (1995), JRSS B.
    Used for: 5 P0 patterns × 3 horizons = 15 tests → BH corrected.

    Returns: (rejected_bool_array, corrected_p_values)
    """
    rejected, corrected_p, _, _ = multipletests(p_values, alpha=alpha, method=method)
    return rejected, corrected_p


def deflated_sharpe(
    returns_pct: Sequence[float],
    *,
    n_trials: int,
    skew: float | None = None,
    kurt: float | None = None,
    periods_per_year: float = 252 * 24,  # 1h bar default
) -> float:
    """Deflated Sharpe Ratio (López de Prado 2014).

    Adjusts Sharpe for selection bias (n_trials).
    DSR > 0 → better than random search across n_trials.

    Reference: Bailey & López de Prado (2014), J. Portfolio Management.
    Formula: DSR = (SR - SR_threshold) / sigma_SR
      where SR_threshold accounts for selection bias.

    Used for: G2 acceptance gate.
    """
    arr = np.asarray(returns_pct, dtype=float)
    arr = arr[~np.isnan(arr)]
    n = len(arr)
    if n < 10:
        return 0.0
    sr = annualized_sharpe(arr, horizon_hours=1, periods_per_year=periods_per_year)
    skew_val = skew if skew is not None else float(scipy_stats.skew(arr))
    kurt_val = kurt if kurt is not None else float(scipy_stats.kurtosis(arr, fisher=False))
    # SR variance (Mertens 2002 adjustment)
    var_sr = (1.0 - skew_val * sr + (kurt_val - 1) / 4.0 * sr**2) / (n - 1)
    sigma_sr = np.sqrt(max(var_sr, 1e-12))
    # Selection bias threshold (Bailey & López de Prado 2014 eq.10)
    emc = 0.5772156649  # Euler-Mascheroni constant
    sr_threshold = sigma_sr * (
        (1 - emc) * scipy_stats.norm.ppf(1 - 1.0 / n_trials)
        + emc * scipy_stats.norm.ppf(1 - 1.0 / (n_trials * np.e))
    )
    dsr = (sr - sr_threshold) / sigma_sr
    return float(dsr)


def bootstrap_ci(
    samples: Sequence[float],
    *,
    n_iter: int = 1000,
    ci: float = 0.95,
    statistic: str = "mean",  # "mean" / "median"
    seed: int = 42,
) -> tuple[float, float, float]:
    """Bootstrap confidence interval (Efron 1979).

    Used for: G4 acceptance gate (CI excludes 0 → significant).

    Returns: (lower, upper, point_estimate)
    """
    arr = np.asarray(samples, dtype=float)
    arr = arr[~np.isnan(arr)]
    n = len(arr)
    if n < 10:
        return 0.0, 0.0, 0.0
    rng = np.random.default_rng(seed)
    boot_stats = []
    for _ in range(n_iter):
        sample = rng.choice(arr, size=n, replace=True)
        if statistic == "mean":
            boot_stats.append(sample.mean())
        elif statistic == "median":
            boot_stats.append(np.median(sample))
        else:
            raise ValueError(f"Unknown statistic: {statistic}")
    alpha_lo = (1 - ci) / 2 * 100
    alpha_hi = (1 + ci) / 2 * 100
    lower = float(np.percentile(boot_stats, alpha_lo))
    upper = float(np.percentile(boot_stats, alpha_hi))
    point = float(arr.mean()) if statistic == "mean" else float(np.median(arr))
    return lower, upper, point


def annualized_sharpe(
    returns_pct: Sequence[float],
    *,
    horizon_hours: int = 1,
    periods_per_year: float = 252 * 24,
) -> float:
    """Annualized Sharpe ratio (Sharpe 1966).

    SR = mean / std × sqrt(periods_per_year / horizon_hours)
    """
    arr = np.asarray(returns_pct, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) < 2 or arr.std() < 1e-9:
        return 0.0
    return float(arr.mean() / arr.std() * np.sqrt(periods_per_year / horizon_hours))


def hit_rate(samples: Sequence[float]) -> float:
    """Fraction of positive returns. W-0216 §15.1 F1 강화."""
    arr = np.asarray(samples, dtype=float)
    arr = arr[~np.isnan(arr)]
    if len(arr) == 0:
        return 0.0
    return float((arr > 0).mean())


def profit_factor(samples: Sequence[float]) -> float:
    """sum(positive) / abs(sum(negative)). W-0216 §15.1 F1 강화."""
    arr = np.asarray(samples, dtype=float)
    arr = arr[~np.isnan(arr)]
    pos = arr[arr > 0].sum()
    neg = arr[arr < 0].sum()
    if abs(neg) < 1e-9:
        return float("inf") if pos > 0 else 0.0
    return float(pos / abs(neg))
```

### 6.2 F1 측정 통합 (W-0216)

```python
# engine/research/validation/falsifiable_kill.py (W-0218 후속, F1 measurement)

from .phase_eval import measure_phase_conditional_return  # V-02
from .stats import (
    welch_t_test, bh_correct, deflated_sharpe,
    bootstrap_ci, annualized_sharpe, hit_rate, profit_factor
)

def measure_F1(p0_patterns, horizons=[1, 4, 24], cost_bps=15.0):
    results = []
    for pattern_id in p0_patterns:
        for h in horizons:
            phase_result = measure_phase_conditional_return(
                pattern_slug=pattern_id, ..., horizon_hours=h, cost_bps=cost_bps
            )
            random_result = measure_random_baseline(
                n_samples=phase_result.n_samples, horizon_hours=h, cost_bps=cost_bps
            )
            t_result = welch_t_test(phase_result.samples, random_result.samples,
                                    alternative="greater")
            sr = annualized_sharpe(phase_result.samples, horizon_hours=h)
            dsr = deflated_sharpe(phase_result.samples,
                                  n_trials=len(p0_patterns) * len(horizons))
            ci_lo, ci_hi, _ = bootstrap_ci(phase_result.samples)
            hr = hit_rate(phase_result.samples)
            pf = profit_factor(phase_result.samples)
            results.append({
                "pattern": pattern_id, "h": h, "n": phase_result.n_samples,
                "t": t_result.t_statistic, "p": t_result.p_value,
                "sharpe": sr, "dsr": dsr, "ci": (ci_lo, ci_hi),
                "hit_rate": hr, "profit_factor": pf,
            })
    p_values = [r["p"] for r in results]
    rejected, p_corrected = bh_correct(p_values)
    for r, c, rej in zip(results, p_corrected, rejected):
        r["p_bh"] = float(c)
        r["passes_t_bh"] = bool(rej)
        # W-0216 §15.1 F1 강화: 5개 metric 중 ≥4 fail = KILL F1
        passed = (
            (r["t"] >= 2.0 and r["passes_t_bh"]) +  # G1
            (r["dsr"] > 0) +                          # G2
            (r["ci"][0] > 0) +                        # G4 (lower bound > 0)
            (r["sharpe"] >= 1.0) +                    # F1 강화
            (r["hit_rate"] >= 0.52) +                 # F1 강화
            (r["profit_factor"] >= 1.2)               # F1 강화
        )
        r["passed_count"] = passed
    pass_rate = sum(1 for r in results if r["passed_count"] >= 4) / len(results)
    return {"pass_rate": pass_rate, "kill": pass_rate == 0, "details": results}
```

→ V-06 통합으로 W-0216 F1 직접 측정 가능.

## 7. AI Researcher 설계

### 7.1 학술 정합성

| 함수 | 출처 | 비고 |
|---|---|---|
| Welch t-test | Welch (1947) Biometrika | scipy.stats.ttest_ind 사용 |
| BH correction | Benjamini & Hochberg (1995) JRSS B | statsmodels.multipletests |
| Deflated Sharpe | Bailey & López de Prado (2014) JPM | 직접 구현 (Mertens 2002 SR variance + Euler-Mascheroni) |
| Bootstrap CI | Efron (1979) Annals of Statistics | numpy.random.default_rng |
| Sharpe | Sharpe (1966) JoB | Annualization √(252 × 24) for 1h bar |

### 7.2 N=15 BH 보정 적합성

5 P0 patterns × 3 horizons = 15 tests. BH는 multiple test 표준. m=15에서:
- BH critical: p ≤ (k/m) × α = (k/15) × 0.05
- 1순위 통과 p_max = 0.0033 (k=1, gentle)
- 5순위 통과 p_max = 0.0167 (k=5, more lenient)

→ 15 tests에서 false discovery rate 차단 충분. m≥30이면 더 strict한 BY 권장.

### 7.3 DSR 정당성

W-0214 P0 5 패턴 × 53 PatternObject 라이브러리에서 selection. n_trials=15가 너무 작아 DSR이 과도하게 conservative할 수 있음.

→ V-06에서 `n_trials` 인자 외부 노출. F1에서 `len(p0) * len(horizons)` 이지만, F2/F4 etc.에서 다른 값 사용.

## 8. Quant Trader 설계

### 8.1 Sharpe annualization

1h bar: periods_per_year = 252 × 24 = 6048 (crypto 24/7는 365 × 24 = 8760, 보수적으로 252×24=6048)
4h bar: periods_per_year = 252 × 6 = 1512

→ default 252×24=6048 (1h bar). 다른 timeframe은 외부 주입.

### 8.2 Hit rate / Profit factor 임계

W-0216 §15.1 강화:
- hit_rate ≥ 0.52 (random=0.50)
- profit_factor ≥ 1.2 (1.0=break-even)

이 임계는 Quant 일반. Crypto perp 4h horizon에서 tight하지만 합리적.

### 8.3 Bootstrap n_iter

n_iter=1000 (Efron 권장 minimum). performance ≤ 50ms for 1000 samples — 빠름.
n_iter=10000은 더 정확하지만 ~500ms. F1 측정 batch에서 1000으로 충분.

## 9. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| scipy 버전 불일치 (alternative arg) | 중 | 중 | scipy ≥1.6 require |
| statsmodels 의존 | 저 | 저 | requirements.txt 추가 |
| n<10 silent return 0 | 중 | 중 | logging.warning + n 명시 |
| NaN handling | 중 | 중 | dropna in all functions |
| DSR n_trials=1 → division by 0 | 저 | 저 | n_trials ≥ 2 assert |

## 10. Open Questions

- **Q1**: Welch alternative — F1은 "phase return > random" → "greater" one-tailed. Two-tailed로 보수적? → W-0214 §3.2 acceptance "t ≥ 2.0" → one-tailed greater 적합.
- **Q2**: Bootstrap seed=42 default 노출? → 외부 인자 OK, default 42 reproducibility.
- **Q3**: Profit factor inf 처리 — 모두 양수면 inf. JSON serialization 시 문제. → str("inf") 또는 cap=10.0?

## 11. Acceptance Test (Bash)

```bash
# 1. 모듈 존재
test -f engine/research/validation/stats.py
test -f engine/research/validation/test_stats.py

# 2. Unit test
cd engine && pytest research/validation/test_stats.py -v
# → ≥20 test, all pass

# 3. F1 measurement smoke (V-02 + V-06 통합)
cd engine && python -c "
from research.validation.stats import welch_t_test, deflated_sharpe, annualized_sharpe
import numpy as np
samples = np.random.normal(0.5, 1.0, 100)
random = np.random.normal(0, 1.0, 100)
t = welch_t_test(samples, random, alternative='greater')
print(f't={t.t_statistic:.3f}, p={t.p_value:.4f}')
print(f'Sharpe={annualized_sharpe(samples):.3f}')
print(f'DSR={deflated_sharpe(samples, n_trials=15):.3f}')
"
```

## 12. Cross-references

- W-0214 v1.3 §3.2 (M1 acceptance), §3.7 (G1~G4)
- W-0215 §14.6 Table 5 (Gates × functions)
- W-0216 §15.1 F1 강화 (Sharpe + DSR + hit + PF)
- W-0218 V-02 (input PhaseConditionalReturn)
- López de Prado (2014) DSR
- Welch (1947), Benjamini & Hochberg (1995), Efron (1979)

## 13. Next (V-06 머지 후)

- W-0221 V-08 pipeline.py (V-01 + V-02 + V-06 통합 + B0~B3 baseline)
- F1 measurement W-0216 시작 (Week 1)
- W-0219 V-03 ablation (M2)
- W-0222 V-11 gate v2 (G1~G7 통합)

---

*W-0220 v1.0 created 2026-04-27 by Agent A033 — V-06 stats engine PRD with 3-perspective sign-off.*

---

## Goal

§1 — W-0214 G1~G4 통계 엔진. F1 measurement 임계 검증 직접 트리거.

## Owner

§2 — research

## Scope

§3 — `engine/research/validation/stats.py` 신규 + test.

## Non-Goals

§4 — G3 V-01 / G5 V-03 / G6 V-04 / G7 V-05 / pipeline V-08 / sizing W-0226+.

## Canonical Files

§3 — `stats.py`, `test_stats.py`.

## Facts

§7.1 학술 출처: Welch 1947 / BH 1995 / DSR 2014 / Efron 1979 / Sharpe 1966.

## Assumptions

§9 Risk register. scipy ≥1.6, statsmodels 의존, NaN dropna.

## Open Questions

§10 Q1~Q3 (alternative=greater, bootstrap seed, PF inf).

## Decisions

Welch + BH (fdr_bh) + DSR (López de Prado) + bootstrap seed=42 default.

## Next Steps

§13 — V-08 (W-0221) pipeline 통합 + F1 measurement (W-0216).

## Exit Criteria

§5 — 7 함수 구현 + unit test 20+ + perf <50ms + 학술 출처 인용.

## Handoff Checklist

- [x] PRD v1.0 published
- [ ] Issue #422 implementation 시작
- [ ] stats.py 구현 + 20+ unit test
- [ ] V-08 pipeline 통합
